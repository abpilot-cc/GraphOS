import type { AddEvent, DelEvent, GetEvent, IEvent, IEventSource, IObject, SetEvent } from "./index.js";
import { App, MemStorage } from "./index.js";
import path from "path";
import fs from "fs";
import os from "os";
import { createRequire } from "node:module";
import { pathToFileURL } from "url";
import type { ISimulator } from "./ISimulator.js";
import { WasmSimulator } from "./WasmSimulator.js";
import { AppSimulator } from "./AppSimulator.js";

// ── types ───────────────────────────────────────────────────────────────────

export type PluginSocket = {
    on: (event: string, listener: (...args: any[]) => void) => void;
    off?: (event: string, listener: (...args: any[]) => void) => void;
    removeListener?: (event: string, listener: (...args: any[]) => void) => void;
    send?: (data: string) => void;
    emit?: (event: string, payload?: unknown) => void;
    readyState?: number;
    OPEN?: number;
    device?: { type: string };
    simulator?: ISimulator | undefined;
    __wsEventHandlers?: Map<string, Set<(payload: unknown) => void>>;
    __wsMessageListener?: (raw: unknown) => void;
};

type AppRecord = {
    time: number;
    type: 'event' | 'spawn' | 'change' | 'despawn';
    data: IEvent<IObject> | IObject;
};

export type LogQueryOptions = {
    start?: number;
    end?: number;
};

export type SimulatorConfig = {
    workDir: string;
    socketSet: Set<PluginSocket>;
    emitAllSockets: (type: string, payload?: unknown) => void;
    emitSocketEvent: (socket: PluginSocket, type: string, payload?: unknown) => void;
    emitDeviceList?: () => void;
    getDevices?: () => { type: string }[];
};

// ── helpers ─────────────────────────────────────────────────────────────────

function isWsSocket(socket: PluginSocket): boolean {
    return typeof socket.send === "function";
}

// ── createSimulator ─────────────────────────────────────────────────────────

export function createSimulator(config: SimulatorConfig) {
    const {
        workDir,
        socketSet,
        emitAllSockets,
        emitSocketEvent,
        emitDeviceList = () => { },
        getDevices = () => [],
    } = config;

    let tv: ReturnType<typeof setTimeout> | undefined;
    let simulator: ISimulator | undefined;
    let duration: number = 0;
    let current: number = 0;
    let scale: number = 1.0;
    let fps: number = 30;
    let isPaused: boolean = false;
    let records: AppRecord[] = [];
    let isLoading = false;
    let errorMessage: string | undefined = undefined;

    const syncSocketRefs = () => {
        for (const socket of socketSet) {
            socket.simulator = simulator;
        }
    };

    const emitState = (target?: PluginSocket) => {
        const payload = {
            duration,
            current,
            state: errorMessage ? 'error' : simulator ? (isPaused ? 'paused' : 'running') : (isLoading ? 'loading' : 'stopped'),
            scale,
            fps,
            error: errorMessage,
        };

        if (target) {
            emitSocketEvent(target, 'world-state', payload);
            return;
        }

        emitAllSockets('world-state', payload);
    };

    const clearTimer = () => {
        if (tv) {
            clearTimeout(tv);
            tv = undefined;
        }
    };

    const emitRecord = (record: AppRecord, target?: PluginSocket) => {
        if (target) {
            emitSocketEvent(target, 'world-event-record', record);
            return;
        }

        emitAllSockets('world-event-record', record);
    };

    const emitRecordClear = (target?: PluginSocket) => {
        if (target) {
            emitSocketEvent(target, 'world-event-record-clear');
            return;
        }

        emitAllSockets('world-event-record-clear');
    };

    const pushRecord = (record: AppRecord) => {
        records.push(record);
        emitRecord(record);
    };

    const onUpdate = () => {
        if (!simulator || isPaused) return;

        const dt = scale / fps;
        const startedAt = Date.now();
        simulator.update(dt);
        duration += dt;
        current = duration;
        emitState();

        const elapsed = Date.now() - startedAt;
        const delay = dt * 1000 - elapsed;
        tv = setTimeout(onUpdate, Math.max(0, delay));
    };

    const onInit = () => {
        if (!simulator) return;

        simulator.addEventListener('spawn', (event) => {
            pushRecord({ time: duration, type: 'spawn', data: (event as CustomEvent<{ object: IObject }>).detail.object });
        }
        );

        simulator.addEventListener('despawn', (event) => {
            pushRecord({ time: duration, type: 'despawn', data: (event as CustomEvent<{ object: IObject }>).detail.object });
        });

        simulator.addEventListener('change', (event) => {
            pushRecord({ time: duration, type: 'change', data: (event as CustomEvent<{ object: IObject }>).detail.object });
        });

    };

    const loadApp = () => {

        if (fs.existsSync(path.join(workDir, 'dist', 'app_bg.wasm'))) {
            isLoading = true;
            WasmSimulator.load(path.join(workDir, 'dist', 'app.js')).then((app) => {
                isLoading = false;
                simulator = app;
                syncSocketRefs();
                onInit();
                emitState();
                tv = setTimeout(onUpdate, 0);
            }).catch((e) => {
                isLoading = false;
                errorMessage = `Failed to load Wasm simulator: ${e instanceof Error ? e.message : String(e)}`;
                emitState();
            });
        } else {
            isLoading = true;
            AppSimulator.load(path.join(workDir, 'dist', 'src', 'app.js')).then((app) => {
                isLoading = false;
                simulator = app;
                syncSocketRefs();
                onInit();
                emitState();
                tv = setTimeout(onUpdate, 0);
            }).catch((e) => {
                isLoading = false;
                errorMessage = `Failed to load App simulator: ${e instanceof Error ? e.message : String(e)}`;
                emitState();
            });
        }

    };

    // ── public API ──────────────────────────────────────────────────────────

    return {
        attachSocket(socket: PluginSocket) {
            socket.simulator = simulator;
            emitState(socket);
            emitRecordClear(socket);
            for (const record of records) {
                if (record.time <= current) {
                    emitRecord(record, socket);
                }
            }
        },
        emitState(target?: PluginSocket) {
            emitState(target);
        },
        getCurrentTime() {
            return current;
        },
        getState() {
            return {
                duration,
                current,
                state: errorMessage ? 'error' : simulator ? (isPaused ? 'paused' : 'running') : (isLoading ? 'loading' : 'stopped'),
                error: errorMessage,
                scale,
                fps,
            };
        },
        getLogs(options?: LogQueryOptions) {
            const start = options?.start ?? Number.NEGATIVE_INFINITY;
            const end = options?.end ?? current;
            return records.filter((record) => record.time >= start && record.time <= end);
        },
        setTimescale(newScale: number) {
            scale = newScale;
            emitState();
        },
        setFps(newFps: number) {
            fps = newFps;
            emitState();
        },
        setCurrent(newCurrent: number) {
            if (!simulator || !isPaused || newCurrent < 0 || newCurrent > duration || current === newCurrent) return;

            if (newCurrent > current) {
                for (const record of records) {
                    if (record.time > current && record.time <= newCurrent) {
                        emitRecord(record);
                    }
                }
                current = newCurrent;
            } else {
                emitRecordClear();
                for (const record of records) {
                    if (record.time <= newCurrent) {
                        emitRecord(record);
                    }
                }
                current = newCurrent;
            }

            emitState();
        },
        reset() {
            duration = 0;
            current = 0;
            scale = 1.0;
            fps = 30;
            isPaused = false;
            simulator?.exit();
            simulator = undefined;
            errorMessage = undefined;
            records = [];
            clearTimer();
            syncSocketRefs();
            emitRecordClear();
            emitState();
        },
        pause() {
            isPaused = true;
            clearTimer();
            emitState();
        },
        resume() {
            isPaused = false;

            if (current < duration) {
                for (const record of records) {
                    if (record.time > current) {
                        emitRecord(record);
                    }
                }
                current = duration;
            }

            if (simulator) {
                clearTimer();
                tv = setTimeout(onUpdate, 0);
            }

            emitState();
        },
        start() {
            isPaused = false;
            if (!simulator && !isLoading) {
                loadApp();
                clearTimer();
            }
            emitState();
        },
        sendEvent(data: unknown) {
            if (!data || typeof data !== 'object') return;

            const eventData = data as Record<string, unknown>;
            if (typeof eventData.type !== 'string' || !simulator) return;

            const item: AppRecord = { time: duration, type: 'event', data: eventData as unknown as IEvent<IObject> };
            pushRecord(item);
            simulator.emit(data as any);
        },
    };
}
