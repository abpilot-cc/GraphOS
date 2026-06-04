import { readFileSync } from "node:fs";
import path from "node:path";
import fs from "node:fs";

type WasmExports = {
    memory: WebAssembly.Memory;
    ffi_app_create: (fmt: number) => number;
    ffi_app_update: (app: number, dt: number) => void;
    ffi_app_inbound: (app: number, data: number, len: number) => void;
    ffi_app_outbound: (app: number, outLenPtr: number) => number;
    ffi_app_exit: (app: number) => void;
    ffi_app_initialize: () => void;
    ffi_alloc: (a: number) => number;
    ffi_free: (a: number, b: number) => void;
};

if (!process.send) throw new Error("WasmWorker must run as a forked child process");
const send = process.send.bind(process);

// Exit when the parent process closes the IPC channel (parent exited or crashed)
process.on("disconnect", () => {
    cleanup();
    process.exit(0);
});

const enc = new TextEncoder();
const dec = new TextDecoder();

function allocString(str: string, wasm: WasmExports): [number, number] {
    const bytes = enc.encode(str + "\0");
    const len = bytes.length;
    const off = wasm.ffi_alloc(len);
    new Uint8Array(wasm.memory.buffer, off, len).set(bytes);
    return [off, len];
}

let wasm: WasmExports | null = null;
let appId: number = 0;
let inbound: [number, number] | null = null;
let lengthBuf: [number, number] | null = null;

function cleanup(): void {
    if (!wasm) return;
    if (inbound !== null) {
        wasm.ffi_free(inbound[0], inbound[1]);
        inbound = null;
    }
    if (lengthBuf !== null) {
        wasm.ffi_free(lengthBuf[0], lengthBuf[1]);
        lengthBuf = null;
    }
    wasm.ffi_app_exit(appId);
    wasm = null;
}

type WorkerMessage =
    | { type: "init"; wasmPath: string }
    | { type: "update"; dt: number; messages: string[] }
    | { type: "exit" };

function sendError(message: string, detail?: string): void {
    send({ type: "error", message, detail: detail ?? "" });
}

// Catch unhandled errors (e.g. WASM traps surfaced as JS exceptions) and
// forward the full stack to the parent before the process dies.
process.on("uncaughtException", (err: Error) => {
    sendError(
        `[WasmWorker] uncaughtException: ${err.message}`,
        err.stack ?? String(err)
    );
    cleanup();
    process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const detail = reason instanceof Error ? (reason.stack ?? String(reason)) : String(reason);
    sendError(`[WasmWorker] unhandledRejection: ${msg}`, detail);
});

process.on("message", (msg: WorkerMessage) => {
    if (msg.type === "init") {
        try {
            const code = readFileSync(msg.wasmPath).toString();
            // eslint-disable-next-line no-eval
            const fn = eval(`(function(__dirname,require,exports) { ${code} return wasm; })`);
            wasm = fn(
                path.dirname(msg.wasmPath),
                (name: string) => { if (name === "fs") return fs; },
                {}
            ) as WasmExports;

            const fmt = allocString("json", wasm);
            wasm.ffi_app_initialize();
            appId = wasm.ffi_app_create(fmt[0]);
            wasm.ffi_free(fmt[0], fmt[1]);
            lengthBuf = [wasm.ffi_alloc(8), 8];

            send({ type: "ready" });
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            sendError(`[WasmWorker] init failed: ${e.message}`, e.stack ?? String(e));
            process.exit(1);
        }

    } else if (msg.type === "update") {
        if (!wasm || !lengthBuf) return;

        try {
            if (msg.messages.length > 0) {
                const s = msg.messages.join("\n") + "\n";
                const bytes = enc.encode(s);
                const len = bytes.length;
                if (inbound === null || inbound[1] < len) {
                    if (inbound !== null) {
                        wasm.ffi_free(inbound[0], inbound[1]);
                    }
                    inbound = [wasm.ffi_alloc(len), len];
                }
                new Uint8Array(wasm.memory.buffer, inbound[0], len).set(bytes);
                wasm.ffi_app_inbound(appId, inbound[0], len);
            }

            wasm.ffi_app_update(appId, msg.dt);

            new DataView(wasm.memory.buffer).setBigUint64(lengthBuf[0], BigInt(0), true);
            const outboundPtr = wasm.ffi_app_outbound(appId, lengthBuf[0]);
            const outboundLen = Number(
                new DataView(wasm.memory.buffer).getBigUint64(lengthBuf[0], true)
            );

            let text = "";
            if (outboundPtr !== 0 && outboundLen > 0) {
                text = dec.decode(new Uint8Array(wasm.memory.buffer, outboundPtr, outboundLen));
            }

            send({ type: "outbound", text });
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            sendError(`[WasmWorker] update failed: ${e.message}`, e.stack ?? String(e));
        }

    } else if (msg.type === "exit") {
        cleanup();
    }
});
