import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IEvent, IObject, ISimulator } from "./ISimulator.js";

type InboundMessage =
    | { Event: { type: string; payload: unknown } }
    | "Reset" | "Startup";

type WorkerOutbound =
    | { type: "ready" }
    | { type: "outbound"; text: string }
    | { type: "error"; message: string; detail: string };

export class WasmSimulator extends EventTarget implements ISimulator {

    private _worker: ChildProcess;
    private _messages: InboundMessage[] = ['Startup'];
    private _pendingEvents: CustomEvent[] = [];
    /** stderr lines accumulated from the child process */
    private _stderrLines: string[] = [];

    private constructor(worker: ChildProcess) {
        super();
        this._worker = worker;

        // Collect stderr so it can be included in error reports (e.g. Rust panic messages)
        worker.stderr?.setEncoding("utf8");
        worker.stderr?.on("data", (chunk: string) => {
            const lines = chunk.split("\n").filter(l => l.length > 0);
            this._stderrLines.push(...lines);
            // Keep a rolling window to avoid unbounded growth
            if (this._stderrLines.length > 200) {
                this._stderrLines.splice(0, this._stderrLines.length - 200);
            }
        });

        worker.on("message", (msg: WorkerOutbound) => {
            if (msg.type === "outbound") {
                this._processOutbound(msg.text);
            } else if (msg.type === "error") {
                const stderr = this._stderrLines.join("\n");
                const full = [msg.message, msg.detail, stderr].filter(Boolean).join("\n");
                console.error(full);
                this.dispatchEvent(new CustomEvent("error", { detail: { message: full } }));
            }
        });
        worker.on("error", (err) => {
            this.dispatchEvent(new CustomEvent("error", { detail: { message: err.message } }));
        });
        worker.on("exit", (code, signal) => {
            if (code !== 0) {
                const stderr = this._stderrLines.join("\n");
                const full = [`WASM worker process exited unexpectedly (code=${code}, signal=${signal})`, stderr]
                    .filter(Boolean).join("\n");
                console.error(full);
                this.dispatchEvent(new CustomEvent("error", { detail: { message: full } }));
            }
        });
    }

    private _processOutbound(text: string): void {
        if (!text) return;
        const spawns = new Map<string, IObject>();
        const changes = new Map<string, IObject>();
        text.split("\n").filter(line => line.trim().length > 0).forEach(line => {
            try {
                const message = JSON.parse(line);
                if (message === "Reset") {
                    this._pendingEvents.push(new CustomEvent("reset", { detail: {} }));
                } else if (message.Spawn) {
                    const object: IObject = { id: message.Spawn.id, table: message.Spawn.table };
                    spawns.set(message.Spawn.id, object);
                    this._pendingEvents.push(new CustomEvent("spawn", { detail: { object } }));
                } else if (message.Despawn) {
                    const object: IObject = { id: message.Despawn.id, table: message.Despawn.table };
                    this._pendingEvents.push(new CustomEvent("despawn", { detail: { object } }));
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
                            this._pendingEvents.push(new CustomEvent("change", { detail: { object } }));
                        }
                    }
                } else if (message.Log) {
                    this._pendingEvents.push(new CustomEvent("log", { detail: message.Log }));
                }
            } catch (e) {
                console.error("Failed to parse event from wasm worker:", e);
            }
        });
    }

    update(dt: number): void {
        // Dispatch events buffered from the previous worker response
        const events = this._pendingEvents.splice(0);
        for (const event of events) {
            this.dispatchEvent(event);
        }

        // Send pending inbound messages + dt to the worker
        const messages = this._messages.splice(0).map(m => JSON.stringify(m));
        this._worker.send({ type: "update", dt, messages });
    }

    emit(event: IEvent): void {
        this._messages.push({ Event: { type: event.type, payload: event } });
    }

    on(event: "spawn" | "despawn" | "change" | "reset" | "error" | "log", listener: (event: CustomEvent<any>) => void): void {
        this.addEventListener(event, listener as EventListener);
    }

    exit(): void {
        this.removeEventListener('spawn', null);
        this.removeEventListener('despawn', null);
        this.removeEventListener('change', null);
        this.removeEventListener('reset', null);
        this.removeEventListener('error', null);
        this.removeEventListener('log', null);
        this._worker.send({ type: "exit" });
        // Give the child process a moment to clean up, then force kill
        setTimeout(() => this._worker.kill(), 500);
    }

    static async load(p: string): Promise<WasmSimulator> {
        const workerPath = fileURLToPath(new URL("./WasmWorker.js", import.meta.url));
        const child = fork(workerPath, [], { silent: true }); // silent=true pipes stdio for capture

        // Forward child stdout/stderr to the parent's streams so logs are visible,
        // and keep a buffer so init errors can be included in the rejection message.
        const initStderr: string[] = [];
        child.stdout?.pipe(process.stdout);
        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => {
            process.stderr.write(chunk);
            initStderr.push(...chunk.split("\n").filter(l => l.length > 0));
        });

        await new Promise<void>((resolve, reject) => {
            child.once("message", (msg: WorkerOutbound) => {
                if (msg.type === "ready") {
                    resolve();
                } else if (msg.type === "error") {
                    const detail = [msg.message, msg.detail, ...initStderr].filter(Boolean).join("\n");
                    reject(new Error(detail));
                } else {
                    reject(new Error("Unexpected message from wasm worker: " + JSON.stringify(msg)));
                }
            });
            child.once("error", reject);
            child.once("exit", (code) => {
                const detail = [`WASM worker process exited during init (code=${code})`, ...initStderr]
                    .filter(Boolean).join("\n");
                reject(new Error(detail));
            });
            child.send({ type: "init", wasmPath: path.resolve(p) });
        });

        // Allow the parent process to exit without waiting for the child;
        // the child will detect the IPC disconnect and exit on its own.
        child.unref();

        // Also kill the child synchronously when the parent process exits.
        const killChild = () => { try { child.kill(); } catch { /* already gone */ } };
        process.on("exit", killChild);
        // Clean up the listener once the child exits to avoid leaks.
        child.once("exit", () => process.off("exit", killChild));

        return new WasmSimulator(child);
    }
}