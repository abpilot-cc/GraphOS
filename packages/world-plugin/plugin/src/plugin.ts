import type { IApp, IGraph, INode } from "graphos-core";
import { genTypeScript } from "./genTypeScript.js";
import path from "path";
import fs from "fs";
import express from "express";
import { fileURLToPath, pathToFileURL } from "url";
import { App, MemStorage, type AddEvent, type DelEvent, type GetEvent, type IEvent, type IEventSource, type IObject, type SetEvent } from "./index.js";
import { Socket } from "socket.io";


type AppRecord = {
    time: number;
    type: 'event' | 'get' | 'add' | 'set' | 'del';
    data: IEvent<IObject> | IObject;
};

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
        outTypes: ['Context', 'Variant', 'Event']
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
        outTypes: ['Context', 'Variant', 'Event'],
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
        outTypes: [],
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

    let graph: IGraph | undefined;
    let socketSet = new Set<Socket>();

    const setGraph = (g: IGraph) => {
        graph = g;
        for (const socket of socketSet) {
            socket.emit('world-graph', graph);
        }
    };

    app.on('open', (event) => {
        setGraph(event.data);
    });

    app.on("changed", (event) => {
        setGraph(event.data);
        if (env && env.world && env.world.genTypeScript) {
            const file = path.join(env.workDir, "gen/World.ts");
            try {
                const code = genTypeScript(event.data);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, code, "utf-8");
                console.log(`Generated TypeScript code for World model at ${file}`);
            } catch (err: any) {
                console.error("Error generating TypeScript code for World model:", err.stack || err);
            }
        }
    });

    const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
    app.express().use("/world", express.static(distPath));
    app.express().get("/world/*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });

    app.addTab({ id: 'world', label: 'Simulator', url: '/world' });
    app.on('socket', ({ socket }) => {
        console.log("Received socket connection in World plugin:", socket.id);
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

        const emitState = () => {
            socket.emit("world-state", { duration: duration, current: current, state: app ? isPaused ? 'paused' : 'running' : 'stopped', scale: scale, fps: fps });
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
                socket.emit('world-event-record', item);
            });

            app.ctx.on<SetEvent<IObject>, IObject>('set', (event) => {
                let item: AppRecord = { time: duration, type: 'set', data: { ...JSON.parse(JSON.stringify(event.data)), id: event.source.object.id, table: event.source.object.table } };
                records.push(item);
                socket.emit('world-event-record', item);
            });

            app.ctx.on<AddEvent<IObject>, IObject>('add', (event) => {
                let item: AppRecord = { time: duration, type: 'add', data: JSON.parse(JSON.stringify(event.source.object)) };
                records.push(item);
                socket.emit('world-event-record', item);
            });

            app.ctx.on<DelEvent<IObject>, IObject>('del', (event) => {
                let item: AppRecord = { time: duration, type: 'del', data: { id: event.source.object.id, table: event.source.object.table } };
                records.push(item);
                socket.emit('world-event-record', item);
            });
        };

        const onLoadApp = () => {
            app = new App(new MemStorage());
            onInit();
            const entryPath = path.join(env.workDir, "dist/src/app.js");
            if (fs.existsSync(entryPath)) {
                (async () => {
                    try {
                        const url = `${pathToFileURL(entryPath).href}?t=${Date.now()}`;
                        const e = await import(url);
                        const fn: (app: App) => IEventSource<IObject> = e.default;
                        worldContext = fn(app);
                    }
                    catch (e) {
                        console.error(`Error loading or executing ${entryPath}:`, e);
                    }
                })();
            }
        };

        socket.on('world-get-state', emitState);

        socket.on('world-get-graph', () => {
            if (graph) {
                socket.emit('world-graph', graph);
            }
        })

        socket.on('world-set-timescale', (newScale: number) => {
            scale = newScale;
            emitState();
        });

        socket.on('world-set-fps', (newFps: number) => {
            fps = newFps;
            emitState();
        });

        socket.on('world-set-current', (newCurrent: number) => {
            if (!app || !isPaused || newCurrent < 0 || newCurrent > duration || current === newCurrent) return;
            if (newCurrent > current) {
                for (let record of records) {
                    if (record.time > current && record.time <= newCurrent) {
                        socket.emit('world-event-record', record);
                    }
                }
                current = newCurrent;
            } else {
                socket.emit('world-event-record-clear');
                for (let record of records) {
                    if (record.time <= newCurrent) {
                        socket.emit('world-event-record', record);
                    }
                }
                current = newCurrent;
            }
            emitState();
        });

        socket.on('world-reset', () => {
            duration = 0;
            current = 0;
            scale = 1.0;
            fps = 30;
            isPaused = false;
            app = undefined;
            records.splice(0, records.length);
            if (tv) clearTimeout(tv);
            tv = undefined;
            emitState();
        });

        socket.on('world-pause', () => {
            isPaused = true;
            if (tv) clearTimeout(tv);
            tv = undefined;
            emitState();
        });

        socket.on('world-resume', () => {
            isPaused = false;
            if (current < duration) {
                for (let record of records) {
                    if (record.time > current) {
                        socket.emit('world-event-record', record);
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

        socket.on('world-start', () => {
            isPaused = false;
            if (!app) {
                onLoadApp();
                if (tv) clearTimeout(tv);
                tv = setTimeout(onUpdate, 0);
            }
            emitState();
        });

        socket.on('world-send-event', (data) => {
            console.log('Received event from client:', data);
            if (typeof data === 'object' && data.type && worldContext && app) {
                let item: AppRecord = { time: duration, type: 'event', data };
                records.push(item);
                app.trigger({ ...data, source: worldContext });
                socket.emit('world-event-record', item);
            }
        });

        socketSet.add(socket);

        socket.on('disconnect', () => {
            socketSet.delete(socket);
            if (tv) clearTimeout(tv);
            tv = undefined;
            app = undefined;
        });
    });
}