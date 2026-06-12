use crate::core::*;
use bevy_app::prelude::*;
use bevy_time::{Time, Virtual};
// use tracing::info;
use std::ffi::{c_void, CStr};
use std::os::raw::{c_char, c_float, c_uchar, c_ulong};
use std::time::Duration;

// ── 内存分配 ───────────────────────────────────────────

#[unsafe(no_mangle)]
pub extern "C" fn ffi_alloc(size: usize) -> *mut u8 {
    let layout = std::alloc::Layout::from_size_align(size, 1).unwrap();
    unsafe { std::alloc::alloc(layout) }
}

#[unsafe(no_mangle)]
pub extern "C" fn ffi_free(ptr: *mut u8, size: usize) {
    if ptr.is_null() {
        return;
    }
    let layout = std::alloc::Layout::from_size_align(size, 1).unwrap();
    unsafe { std::alloc::dealloc(ptr, layout) };
}

struct AppHandle {
    app: App,
    outbound_cache: Vec<u8>,
    format: Format,
}

#[derive(PartialEq, Eq, Clone)]
enum Format {
    Cbor,
    Json,
}

// Rust 层 onload 回调
static mut ONLOAD_FN: Option<fn(&mut App)> = None;

/// 注册 onload 回调（Rust 代码调用）
pub fn app_onload(f: fn(&mut App)) {
    unsafe {
        ONLOAD_FN = Some(f);
    }
}

fn parse_format(fmt: &str) -> Format {
    match fmt.to_ascii_lowercase().as_str() {
        "json" => Format::Json,
        _ => Format::Cbor,
    }
}

fn new_app() -> App {
    let mut app = App::new();
    app.insert_resource(Time::<Virtual>::default());
    reg(&mut app);
    app
}

#[unsafe(no_mangle)]
pub extern "C" fn ffi_app_create(format: *const c_char) -> *mut c_void {
    let fmt = unsafe {
        if format.is_null() {
            "cbor"
        } else {
            CStr::from_ptr(format).to_str().unwrap_or("cbor")
        }
    };
    let format = parse_format(fmt);
    let mut app = new_app();
    unsafe {
        if let Some(f) = ONLOAD_FN {
            f(&mut app);
        }
    }
    let handle = AppHandle {
        app,
        outbound_cache: Vec::new(),
        format,
    };

    let app_ptr = Box::into_raw(Box::new(handle)) as *mut c_void;

    app_ptr
}

#[unsafe(no_mangle)]
pub extern "C" fn ffi_app_update(app_id: *mut c_void, dt: c_float) {
    // info!("ffi_app_update called with dt: {}", dt);

    if app_id.is_null() {
        return;
    }

    let handle = unsafe { &mut *(app_id as *mut AppHandle) };
    let duration = Duration::from_secs_f32(dt);
    // Advance Time<Virtual> for game systems. Time<Real> is advanced
    // by the sync_physics_time system in PreUpdate (see lib.rs).
    handle
        .app
        .world_mut()
        .resource_mut::<Time<Virtual>>()
        .advance_by(duration);

    // info!("Running app update...");
    handle.app.update();
    // 刷新 outbound 缓存
    handle.outbound_cache.clear();
    let world = handle.app.world_mut();
    if let Some(mut res) = world.get_resource_mut::<WorldResource>() {
        match handle.format {
            Format::Cbor => {
                while let Some(msg) = res.recv() {
                    handle
                        .outbound_cache
                        .extend(serde_cbor::to_vec(&msg).unwrap());
                }
            }
            Format::Json => {
                let mut first = true;
                while let Some(msg) = res.recv() {
                    let line = serde_json::to_string(&msg).unwrap();
                    // info!("Outbound message: {}", line);
                    if !first {
                        handle.outbound_cache.push(b'\n');
                    }
                    handle.outbound_cache.extend(line.as_bytes());
                    first = false;
                }
            }
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn ffi_app_inbound(app_id: *mut c_void, data: *const c_uchar, data_len: c_ulong) {
    if app_id.is_null() || data.is_null() {
        return;
    }
    let handle = unsafe { &mut *(app_id as *mut AppHandle) };
    let slice = unsafe { std::slice::from_raw_parts(data, data_len as usize) };
    let world = handle.app.world_mut();
    if let Some(mut res) = world.get_resource_mut::<WorldResource>() {
        match handle.format {
            Format::Cbor => {
                // 多条 cbor 消息拼接
                let mut offset = 0;
                while offset < slice.len() {
                    match serde_cbor::de::from_slice::<Message>(&slice[offset..]) {
                        Ok(msg) => {
                            let used = serde_cbor::to_vec(&msg).unwrap().len();
                            res.send(msg);
                            offset += used;
                        }
                        Err(_) => break,
                    }
                }
            }
            Format::Json => {
                // 多行 json，每行一条
                let s = std::str::from_utf8(slice).unwrap();
                for line in s.lines() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    // info!("Received inbound message: {}", line);
                    if let Ok(msg) = serde_json::from_str::<Message>(line) {
                        res.send(msg);
                    }
                }
            }
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn ffi_app_outbound(app_id: *mut c_void, out_len: *mut c_ulong) -> *const c_uchar {
    if app_id.is_null() {
        return std::ptr::null();
    }

    let handle = unsafe { &mut *(app_id as *mut AppHandle) };
    if let Some(out_len) = unsafe { out_len.as_mut() } {
        *out_len = handle.outbound_cache.len() as c_ulong;
    }
    if handle.outbound_cache.is_empty() {
        std::ptr::null()
    } else {
        handle.outbound_cache.as_ptr()
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn ffi_app_exit(app_id: *mut c_void) {
    if app_id.is_null() {
        return;
    }
    let _ = unsafe { Box::from_raw(app_id as *mut AppHandle) };
    // Box 自动释放
}
