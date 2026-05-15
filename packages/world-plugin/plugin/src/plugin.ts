import type { IApp, IGraph, INode } from "graphos-core";
import { genTypeScript } from "./genTypeScript.js";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import { fileURLToPath, pathToFileURL } from "url";
import { App, MemStorage, type AddEvent, type DelEvent, type GetEvent, type IEvent, type IEventSource, type IObject, type SetEvent } from "./index.js";
import { genCocosCreator } from "./genCocosCreator.js";

type AppRecord = {
    time: number;
    type: 'event' | 'get' | 'add' | 'set' | 'del';
    data: IEvent<IObject> | IObject;
};

type WsEnvelope = {
    type: string;
    payload?: unknown;
};

type PluginSocket = {
    on: (event: string, listener: (...args: any[]) => void) => void;
    off?: (event: string, listener: (...args: any[]) => void) => void;
    removeListener?: (event: string, listener: (...args: any[]) => void) => void;
    send?: (data: string) => void;
    emit?: (event: string, payload?: unknown) => void;
    readyState?: number;
    OPEN?: number;
    device?: { type: string };
    app?: App | undefined;
    worldContext?: IEventSource<IObject> | undefined;
    __wsEventHandlers?: Map<string, Set<(payload: unknown) => void>>;
    __wsMessageListener?: (raw: unknown) => void;
};

function isWsSocket(socket: PluginSocket): boolean {
    return typeof socket.send === "function";
}

function parseWsEnvelope(raw: unknown): WsEnvelope | null {
    try {
        const asText = (() => {
            if (typeof raw === "string") return raw;
            if (Array.isArray(raw)) return Buffer.concat(raw).toString();
            if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw)).toString();
            if (raw instanceof Uint8Array) return Buffer.from(raw).toString();
            return String(raw ?? "");
        })();
        const parsed = JSON.parse(asText) as WsEnvelope;
        if (!parsed || typeof parsed.type !== "string") return null;
        return parsed;
    } catch {
        return null;
    }
}

function emitSocketEvent(socket: PluginSocket, type: string, payload?: unknown) {
    if (isWsSocket(socket)) {
        const openState = typeof socket.OPEN === "number" ? socket.OPEN : 1;
        if (typeof socket.readyState === "number" && socket.readyState !== openState) return;
        socket.send!(JSON.stringify({ type, payload }));
        return;
    }

    socket.emit?.(type, payload);
}

function attachSocketEvent(
    socket: PluginSocket,
    type: string,
    handler: (payload: unknown) => void,
    cleanups: Array<() => void>,
) {
    if (isWsSocket(socket)) {
        if (!socket.__wsEventHandlers) {
            socket.__wsEventHandlers = new Map();
        }

        if (!socket.__wsMessageListener) {
            socket.__wsMessageListener = (raw: unknown) => {
                const envelope = parseWsEnvelope(raw);
                if (!envelope) return;

                const handlers = socket.__wsEventHandlers?.get(envelope.type);
                if (!handlers || handlers.size === 0) return;

                for (const fn of handlers) {
                    fn(envelope.payload);
                }
            };
            socket.on("message", socket.__wsMessageListener);
        }

        const handlers = socket.__wsEventHandlers.get(type) ?? new Set<(payload: unknown) => void>();
        handlers.add(handler);
        socket.__wsEventHandlers.set(type, handlers);

        cleanups.push(() => {
            const byType = socket.__wsEventHandlers?.get(type);
            if (byType) {
                byType.delete(handler);
                if (byType.size === 0) {
                    socket.__wsEventHandlers?.delete(type);
                }
            }

            if (socket.__wsEventHandlers && socket.__wsEventHandlers.size === 0 && socket.__wsMessageListener) {
                if (socket.off) socket.off("message", socket.__wsMessageListener);
                else socket.removeListener?.("message", socket.__wsMessageListener);
                delete socket.__wsMessageListener;
            }
        });
        return;
    }

    const listener = (payload: unknown) => handler(payload);
    socket.on(type, listener);
    cleanups.push(() => {
        if (socket.off) socket.off(type, listener);
        else socket.removeListener?.(type, listener);
    });
}

function attachSocketDisconnect(
    socket: PluginSocket,
    handler: () => void,
    cleanups: Array<() => void>,
) {
    const eventName = isWsSocket(socket) ? "close" : "disconnect";
    socket.on(eventName, handler);
    cleanups.push(() => {
        if (socket.off) socket.off(eventName, handler);
        else socket.removeListener?.(eventName, handler);
    });
}

export default function install(app: IApp, env: any) {

    app.addNodeType({
        type: "World",
        description: "Root node of the world model. A World is the single top-level context and the root of the Context tree.",
        properties: {
            "name": {
                type: "string",
                description: "Human-readable world name. Use a stable domain name, such as 'ECommercePlatform' or 'SmartHome'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this world's purpose and scope.",
                editor: 'textarea',
            }
        },
        inTypes: [],
        outTypes: ['Context', 'Variant', 'Event', 'System'],
    })

    app.addNodeType({
        type: "Context",
        description: "Tree node under World/Context. A Context groups related domains and can contain child Context nodes and Variant definitions.",
        properties: {
            "name": {
                type: "string",
                description: "Context name within its parent scope, such as 'User', 'Order', 'Payment', or 'Device'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this context's purpose and contents.",
                editor: 'textarea',
            }
        },
        inTypes: ['World', 'Context'],
        outTypes: ['Context', 'Variant', 'Event', 'System'],
    })

    app.addNodeType({
        type: "Variant",
        description: "Typed variable definition attached to a World/Context node. A Variant declares available data fields and how their values are produced.",
        properties: {
            "name": {
                type: "string",
                description: "Variable key. Use semantic names like 'region', 'currency', 'maxRetryCount', or 'isEnabled'.",
                required: true,
            },
            "type": {
                type: ['string', 'float', 'integer', 'boolean', 'JSONSchema'],
                description: "Value type of this variable. Choose JSONSchema when the value is a structured object.",
                required: true,
                defaultValue: 'string',
            },
            "jsonSchema": {
                type: "JSONSchema",
                description: "Schema used when type is JSONSchema. Define object shape, required fields, and constraints.",
                defaultValue: '{}',
                visible: {
                    type: 'JSONSchema',
                }
            },
            "required": {
                type: 'boolean',
                description: "Indicates whether this variable is required.",
                required: false,
                defaultValue: false,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this variable's meaning, usage, and value sources.",
                editor: 'textarea',
            }
        },
        inTypes: ['World', 'Context', 'Event'],
        outTypes: ['View'],
    })



    app.addNodeType({
        type: "System",
        description: "Lifecycle processing node attached to World/Context. System handles logic at different lifecycle timings of the current Context/World (Startup, Update, Change, Spawn, Despawn).",
        properties: {
            "name": {
                type: "string",
                description: "System name used to identify this lifecycle logic unit within the current World/Context.",
                required: true,
            },
            "updateEnabled": {
                type: "boolean",
                description: "Run on Update timing. Executes every frame.",
                defaultValue: false,
            },
            "updateDescription": {
                type: "string",
                description: "Description for Update timing behavior.",
                editor: 'textarea',
            },
            "changeEnabled": {
                type: "boolean",
                description: "Run on Change timing. Executes when the related Context changes.",
                defaultValue: false,
            },
            "changeDescription": {
                type: "string",
                description: "Description for Change timing behavior.",
                editor: 'textarea',
            },
            "spawnEnabled": {
                type: "boolean",
                description: "Run on Spawn timing. Executes after a Context is created.",
                defaultValue: false,
            },
            "spawnDescription": {
                type: "string",
                description: "Description for Spawn timing behavior.",
                editor: 'textarea',
            },
            "despawnEnabled": {
                type: "boolean",
                description: "Run on Despawn timing. Executes before a Context is deleted.",
                defaultValue: false,
            },
            "despawnDescription": {
                type: "string",
                description: "Description for Despawn timing behavior.",
                editor: 'textarea',
            },
        },
        inTypes: ['World', 'Context'],
        outTypes: [],
    })

    app.addNodeType({
        type: "Event",
        description: "Event definition node under World. An Event can declare input Variants and EventSystem handlers.",
        properties: {
            "name": {
                type: "string",
                description: "Event name, such as 'UserRegistered', 'PaymentSucceeded', or 'DeviceConnected'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this event's semantics and trigger conditions.",
                editor: 'textarea',
            }
        },
        inTypes: ['World'],
        outTypes: ['Variant', 'EventSystem'],
    })

    app.addNodeType({
        type: "EventSystem",
        description: "Event-driven processing node under Event. Depends on the World event flow (via Event) and handles event logic, mainly for creating/managing Context instances (for example, initializing contexts after entering the game).",
        properties: {
            "name": {
                type: "string",
                description: "Handler name for this event processing unit.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Detailed event handling logic, especially how this handler creates, initializes, or updates Context instances.",
                editor: 'textarea',
            }
        },
        inTypes: ['Event'],
        outTypes: [],
    })

    app.addNodeType({
        type: "View",
        description: "Presentation-layer mapping node for a Variant. A View defines how a Variant value should be transformed into display text (or a display-friendly string) for UI rendering, logs, and AI-generated front-end behavior descriptions. Use this node to specify readable labels, formatting conventions, and compositional output rules without changing source business data.",
        properties: {
            "name": {
                type: "string",
                description: "View field name or output alias. This is the semantic identifier used by UI/AI pipelines to reference this display rule, for example 'titleText', 'subtitle', 'badgeLabel', or 'summaryLine'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Natural-language intent for this display rule. Describe what users should see, in which scenario it appears, tone/style requirements, fallback expectations, and any localization notes. AI agents should treat this as primary guidance when generating or explaining UI behavior.",
                editor: 'textarea',
            },
            "valueScriptCode": {
                type: "string",
                description: "JavaScript function body that computes and returns the display value for this View. Write plain JavaScript code and use `return` to produce the output. Built-in variables available in scope: `value` (the current value of the associated Variant — may be a primitive or object depending on the Variant type), `object` (the Context object instance that owns this Variant, giving access to sibling fields). The return value is used directly as the display output; return a string for text rendering, or any serializable value for structured consumers. Example: `if (!value) return '—'; return value.firstName + ' ' + value.lastName + ' (' + object.role + ')';`",
                editor: 'code/javascript',
            },
        },
        inTypes: ['Variant'],
        outTypes: [],
    })

    let graph: IGraph | undefined;
    let socketSet = new Set<PluginSocket>();

    const setGraph = (g: IGraph) => {
        graph = g;
        for (const socket of socketSet) {
            emitSocketEvent(socket, 'world-graph', graph);
        }
    };

    const getDevices = () => {
        let devices: { type: string }[] = [];
        for (const socket of socketSet) {
            if (socket.device) {
                devices.push(socket.device);
            }
        }
        return devices;
    };

    const emitDeviceList = () => {
        let devices = getDevices();
        for (const socket of socketSet) {
            if (socket.device) continue;
            emitSocketEvent(socket, 'world-device-list', devices);
        }
    };

    const emitDevicesEvent = (type: string, payload?: unknown) => {
        for (const socket of socketSet) {
            if (!socket.device) continue;
            emitSocketEvent(socket, type, payload);
        }
    };

    app.on('open', (event) => {
        setGraph(event.data);
    });

    app.on("changed", (event) => {
        setGraph(event.data);
        if (env && env.world && env.world.genTypeScript && env.world.genTypeScript.enabled) {
            const gen = path.join(env.workDir, env.world.genTypeScript.outDir || "gen");
            try {
                const codeFiles = genTypeScript(event.data);
                fs.mkdirSync(gen, { recursive: true });
                for (let file of codeFiles) {
                    fs.writeFileSync(path.join(gen, file.name), file.content, "utf-8");
                }
            } catch (err: any) {
                console.error("Error generating TypeScript code for World:", err.stack || err);
            }
        }

        if (env && env.world && env.world.genCocosCreator && env.world.genCocosCreator.enabled) {
            const gen = path.join(env.workDir, env.world.genCocosCreator.outDir || "gen");
            try {
                const codeFiles = genCocosCreator(event.data);
                fs.mkdirSync(gen, { recursive: true });
                for (let file of codeFiles) {
                    fs.writeFileSync(path.join(gen, file.name), file.content, "utf-8");
                }
            } catch (err: any) {
                console.error("Error generating Cocos Creator code for World:", err.stack || err);
            }
        }
    });

    const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
    app.express().use("/world", express.static(distPath));
    app.express().get("/world/*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });


    const appPath = path.join(env.workDir, "dist/app");
    app.express().use("/app", express.static(appPath));
    app.express().get("/app/*", (req, res) => {
        res.sendFile(path.join(appPath, "index.html"));
    });

    app.addTab({ id: 'world', label: 'Simulator', url: '/world/' });
    app.on('socket', ({ socket }) => {
        const socketLike = socket as unknown as PluginSocket;
        const cleanups: Array<() => void> = [];
        const emit = (type: string, payload?: unknown) => emitSocketEvent(socketLike, type, payload);
        const onEvent = <T = unknown>(type: string, handler: (payload: T) => void) => {
            attachSocketEvent(socketLike, type, (payload) => handler(payload as T), cleanups);
        };
        // You can set up socket event handlers here if needed
        let tv: any;
        let app: App | undefined;
        let worldContext: IEventSource<IObject> | undefined;
        let duration: number = 0;
        let current: number = 0;
        let scale: number = 1.0;
        let fps: number = 30;
        let isPaused: boolean = false;
        let records: AppRecord[] = [];
        let loadedTmpDir: string | undefined;

        const emitState = () => {
            emit("world-state", { duration: duration, current: current, state: app ? isPaused ? 'paused' : 'running' : 'stopped', scale: scale, fps: fps });
        };

        let onUpdate: () => void;


        onUpdate = () => {
            if (!app || isPaused) return;
            let dt = scale / fps;
            let t = Date.now();
            app.update(dt);
            duration += dt;
            current = duration;
            emitState();
            let e = Date.now() - t;
            let d = dt * 1000 - e;
            tv = setTimeout(onUpdate, Math.max(0, d));
        };

        const onInit = () => {
            if (!app) return;
            app.ctx.on<GetEvent<IObject>, IObject>('get', (event) => {
                let item: AppRecord = { time: duration, type: 'get', data: JSON.parse(JSON.stringify(event.source.object)) };
                records.push(item);
                emit('world-event-record', item);
                emitDevicesEvent('world-event-record', item);
            });

            app.ctx.on<SetEvent<IObject>, IObject>('set', (event) => {
                let item: AppRecord = { time: duration, type: 'set', data: { ...JSON.parse(JSON.stringify(event.data)), id: event.source.object.id, table: event.source.object.table } };
                records.push(item);
                emit('world-event-record', item);
                emitDevicesEvent('world-event-record', item);
            });

            app.ctx.on<AddEvent<IObject>, IObject>('add', (event) => {
                let item: AppRecord = { time: duration, type: 'add', data: JSON.parse(JSON.stringify(event.source.object)) };
                records.push(item);
                emit('world-event-record', item);
                emitDevicesEvent('world-event-record', item);
            });

            app.ctx.on<DelEvent<IObject>, IObject>('del', (event) => {
                let item: AppRecord = { time: duration, type: 'del', data: { id: event.source.object.id, table: event.source.object.table } };
                records.push(item);
                emit('world-event-record', item);
                emitDevicesEvent('world-event-record', item);
            });
        };

        const onLoadApp = () => {
            app = new App(new MemStorage());
            socketLike.app = app;
            onInit();
            const sourceDistPath = path.join(env.workDir, "dist");
            if (loadedTmpDir) {
                try {
                    fs.rmSync(loadedTmpDir, { recursive: true, force: true });
                } catch (e) {
                    console.warn(`Failed to remove previous temp world dist at ${loadedTmpDir}:`, e);
                }
                loadedTmpDir = undefined;
            }

            const runTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphos-world-"));
            const tmpDistPath = path.join(runTmpRoot, "dist");

            try {
                fs.cpSync(sourceDistPath, tmpDistPath, { recursive: true });
                loadedTmpDir = runTmpRoot;
            } catch (e) {
                console.error(`Failed to copy world dist from ${sourceDistPath} to temp path ${tmpDistPath}:`, e);
                return;
            }

            const entryPath = path.join(tmpDistPath, "src/app.js");
            if (fs.existsSync(entryPath)) {
                (async () => {
                    try {
                        const url = pathToFileURL(entryPath).href;
                        const e = await import(url);
                        const fn: (app: App) => IEventSource<IObject> = e.default;
                        worldContext = fn(app);
                        socketLike.worldContext = worldContext;
                    }
                    catch (e) {
                        console.error(`Error loading or executing ${entryPath}:`, e);
                    }
                })();
            }
        };

        onEvent('world-get-state', () => emitState());

        onEvent('world-get-graph', () => {
            if (graph) {
                emit('world-graph', graph);
            }
        })

        onEvent<number>('world-set-timescale', (newScale) => {
            scale = newScale;
            emitState();
        });

        onEvent<number>('world-set-fps', (newFps) => {
            fps = newFps;
            emitState();
        });

        onEvent<number>('world-set-current', (newCurrent) => {
            if (!app || !isPaused || newCurrent < 0 || newCurrent > duration || current === newCurrent) return;
            if (newCurrent > current) {
                for (let record of records) {
                    if (record.time > current && record.time <= newCurrent) {
                        emit('world-event-record', record);
                        emitDevicesEvent('world-event-record', record);
                    }
                }
                current = newCurrent;
            } else {
                emit('world-event-record-clear');
                emitDevicesEvent('world-event-record-clear');
                for (let record of records) {
                    if (record.time <= newCurrent) {
                        emit('world-event-record', record);
                        emitDevicesEvent('world-event-record', record);
                    }
                }
                current = newCurrent;
            }
            emitState();
        });

        onEvent('world-reset', () => {
            duration = 0;
            current = 0;
            scale = 1.0;
            fps = 30;
            isPaused = false;
            app = undefined;
            worldContext = undefined;
            socketLike.app = undefined;
            socketLike.worldContext = undefined;
            records.splice(0, records.length);
            if (tv) clearTimeout(tv);
            tv = undefined;
            emit('world-event-record-clear');
            emitDevicesEvent('world-event-record-clear');
            emitState();
        });

        onEvent('world-pause', () => {
            isPaused = true;
            if (tv) clearTimeout(tv);
            tv = undefined;
            emitState();
        });

        onEvent('world-resume', () => {
            isPaused = false;
            if (current < duration) {
                for (let record of records) {
                    if (record.time > current) {
                        emit('world-event-record', record);
                        emitDevicesEvent('world-event-record', record);
                    }
                }
                current = duration;
            }
            if (app) {
                if (tv) clearTimeout(tv);
                tv = setTimeout(onUpdate, 0);
            }
            emitState();
        });

        onEvent('world-start', () => {
            isPaused = false;
            if (!app) {
                onLoadApp();
                if (tv) clearTimeout(tv);
                tv = setTimeout(onUpdate, 0);
            }
            emitState();
        });

        onEvent('world-send-event', (data) => {

            console.log('Received event from client:', data, socketLike.device);

            if (!data || typeof data !== 'object') return;

            const eventData = data as Record<string, unknown>;
            if (typeof eventData.type !== 'string') return;

            if (socketLike.device) {
                for (let socket of socketSet) {
                    if (socket.app && socket.worldContext) {
                        const triggerEvent = { ...eventData, source: socket.worldContext } as IEvent<IObject>;
                        let item: AppRecord = { time: duration, type: 'event', data: eventData as unknown as IEvent<IObject> };
                        records.push(item);
                        socket.app.trigger(triggerEvent);
                        emit('world-event-record', item);
                        emitDevicesEvent('world-event-record', item);
                    }
                }
                return;
            } else if (app && worldContext) {
                const triggerEvent = { ...eventData, source: worldContext } as IEvent<IObject>;
                let item: AppRecord = { time: duration, type: 'event', data: eventData as unknown as IEvent<IObject> };
                records.push(item);
                app.trigger(triggerEvent);
                emit('world-event-record', item);
                emitDevicesEvent('world-event-record', item);
            }

        });

        onEvent<{ type: string }>('world-device', (device) => {
            socketLike.device = device;
            emitDeviceList();
        });

        onEvent<{ type: string }>('world-get-devices', () => {
            emitSocketEvent(socketLike, 'world-device-list', getDevices());
        });

        socketSet.add(socketLike);

        attachSocketDisconnect(socketLike, () => {
            socketSet.delete(socketLike);
            if (tv) clearTimeout(tv);
            tv = undefined;
            app = undefined;
            if (loadedTmpDir) {
                try {
                    fs.rmSync(loadedTmpDir, { recursive: true, force: true });
                } catch (e) {
                    console.warn(`Failed to remove temp world dist at ${loadedTmpDir}:`, e);
                }
                loadedTmpDir = undefined;
            }
            for (const cleanup of cleanups) {
                cleanup();
            }
            emitDeviceList();
        }, cleanups);
    });
}