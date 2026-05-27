import { readFileSync } from "node:fs";
import type { IEvent, IObject, ISimulator } from "./ISimulator.js";
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

const enc = new TextEncoder();
const dec = new TextDecoder();

function pusString(str: string, wasm: WasmExports, memory: WebAssembly.Memory): [number, number] {
    const bytes = enc.encode(str + '\0');
    const len = bytes.length;
    const off = wasm.ffi_alloc(len);
    new Uint8Array(memory.buffer, off, len).set(bytes);
    return [off, len];
}

interface Context {
    id: string;
    table: string;
    pid: string | null;
}


type Message =
    | { Spawn: Context }
    | { Despawn: Context }
    | { Change: { id: string; table: string, name: string; value: any } }
    | { Event: { type: string; payload: any } }
    | "Reset";


export class WasmSimulator extends EventTarget implements ISimulator {

    private _wasm: WasmExports;
    private _memory: WebAssembly.Memory;
    private _appId: number;
    private _inbound: [number, number] | null = null;
    private _messages: Message[] = [];
    private _length: [number, number] | null = null;

    constructor(wasm: WasmExports, memory: WebAssembly.Memory) {
        super();
        this._wasm = wasm;
        this._memory = memory;
        let format = pusString("json", wasm, memory);
        wasm.ffi_app_initialize();
        this._appId = wasm.ffi_app_create(format[0]);
        wasm.ffi_free(format[0], format[1]);
        this._length = [wasm.ffi_alloc(8), 8];
    }

    update(dt: number): void {
        if (this._messages.length > 0) {
            let lines: string[] = [];
            while (this._messages.length > 0) {
                const message = this._messages.shift()!;
                lines.push(JSON.stringify(message));
            }
            const s = lines.join("\n") + "\n";
            const bytes = enc.encode(s);
            const len = bytes.length;
            if (this._inbound === null || this._inbound[1] < len) {
                if (this._inbound !== null) {
                    this._wasm.ffi_free(this._inbound[0], this._inbound[1]);
                    this._inbound = null;
                }
                this._inbound = [this._wasm.ffi_alloc(len), len];
            }
            new Uint8Array(this._memory.buffer, this._inbound[0], len).set(bytes);
            this._wasm.ffi_app_inbound(this._appId, this._inbound[0], len);
        }
        this._wasm.ffi_app_update(this._appId, dt);
        if (this._length === null) return;
        new DataView(this._memory.buffer).setBigUint64(this._length[0], BigInt(0), true);
        const outboundPtr = this._wasm.ffi_app_outbound(this._appId, this._length[0]);
        const outboundLen = Number(new DataView(this._memory.buffer).getBigUint64(this._length[0], true));
        if (outboundPtr !== 0 && outboundLen > 0) {
            const text = dec.decode(new Uint8Array(this._memory.buffer, outboundPtr, outboundLen));
            // console.info(text);
            const spawns = new Map<string, IObject>();
            const changes = new Map<string, IObject>();
            const events: CustomEvent[] = [];
            text.split("\n").filter(line => line.trim().length > 0).forEach(line => {
                try {
                    const message = JSON.parse(line);
                    if (message === "Reset") {
                        events.push(new CustomEvent("reset", { detail: {} }));
                    } else if (message.Spawn) {
                        const object: IObject = { id: message.Spawn.id, table: message.Spawn.table };
                        spawns.set(message.Spawn.id, object);
                        events.push(new CustomEvent("spawn", { detail: { object } }));
                    } else if (message.Despawn) {
                        const object: IObject = { id: message.Despawn.id, table: message.Despawn.table };
                        events.push(new CustomEvent("despawn", { detail: { object } }));
                    } else if (message.Change) {
                        let object = spawns.get(message.Change.id);
                        if (object !== undefined) {
                            object[message.Change.name] = message.Change.value;
                        } else {
                            object = changes.get(message.Change.id);
                            if (object !== undefined) {
                                object[message.Change.name] = message.Change.value;
                            } else {
                                object = { id: message.Change.id, table: message.Change.table, [message.Change.name]: message.Change.value };
                                changes.set(message.Change.id, object);
                                events.push(new CustomEvent("change", { detail: { object } }));
                            }
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse event from wasm:", e);
                }
            });
            for (let event of events) {
                this.dispatchEvent(event);
            }
        }
    }

    emit(event: IEvent): void {
        // console.info("Emitting event:", event);
        this._messages.push({ Event: { type: event.type, payload: event } });
    }

    on(event: "spawn" | "despawn" | "change" | "reset", listener: (event: CustomEvent<{ object: IObject; }>) => void): void {
        this.addEventListener(event, listener as EventListener);
    }

    exit(): void {
        if (this._inbound !== null) {
            this._wasm.ffi_free(this._inbound[0], this._inbound[1]);
            this._inbound = null;
        }
        if (this._length !== null) {
            this._wasm.ffi_free(this._length[0], this._length[1]);
            this._length = null;
        }
        this._wasm.ffi_app_exit(this._appId);
    }

    static async load(p: string): Promise<WasmSimulator> {
        const code = readFileSync(p).toString();
        const fn = eval(`(function(__dirname,require,exports) { ${code} return wasm; })`)
        const wasm = fn(path.dirname(p), function (name: string) {
            if (name == 'fs') return fs;
        }, {}) as WasmExports;
        const memory = wasm.memory;
        return new WasmSimulator(wasm, memory);
    }
}