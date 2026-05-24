import type { IApp, IGraph, INode } from "graphos-core";
import { genTypeScript } from "./genTypeScript.js";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "url";
import { App, MemStorage, type AddEvent, type DelEvent, type GetEvent, type IEvent, type IEventSource, type IObject, type SetEvent } from "./index.js";
import { genCocosCreator } from "./genCocosCreator.js";
import { genWebTypeScript } from "./genWebTypeScript.js";

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

type LogQueryOptions = {
    start?: number;
    end?: number;
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

    const emitAllSockets = (type: string, payload?: unknown) => {
        for (const socket of socketSet) {
            emitSocketEvent(socket, type, payload);
        }
    };

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

    const simulator = (() => {
        let tv: ReturnType<typeof setTimeout> | undefined;
        let simulatorApp: App | undefined;
        let worldContext: IEventSource<IObject> | undefined;
        let duration: number = 0;
        let current: number = 0;
        let scale: number = 1.0;
        let fps: number = 30;
        let isPaused: boolean = false;
        let records: AppRecord[] = [];
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor as new (
            ...args: string[]
        ) => (...args: unknown[]) => Promise<unknown>;
        const runtimeImportSuffixes = ["", ".js", "/index.js", ".mjs", "/index.mjs", ".cjs", "/index.cjs"];

        const parseImportClause = (clause: string) => {
            const trimmed = clause.trim();
            let defaultImport: string | undefined;
            let namespaceImport: string | undefined;
            let namedImports: Array<{ imported: string; local: string }> = [];

            const parseNamedImports = (value: string) => {
                const inner = value.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
                if (!inner) return [] as Array<{ imported: string; local: string }>;
                return inner
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .map((part) => {
                        const [importedRaw, localRaw] = part.split(/\s+as\s+/);
                        const importedName = (importedRaw ?? '').trim();
                        return {
                            imported: importedName,
                            local: (localRaw ?? importedName).trim(),
                        };
                    });
            };

            if (trimmed.startsWith('{')) {
                namedImports = parseNamedImports(trimmed);
                return { defaultImport, namespaceImport, namedImports };
            }

            if (trimmed.startsWith('* as ')) {
                namespaceImport = trimmed.slice(5).trim();
                return { defaultImport, namespaceImport, namedImports };
            }

            const commaIndex = trimmed.indexOf(',');
            if (commaIndex === -1) {
                defaultImport = trimmed;
                return { defaultImport, namespaceImport, namedImports };
            }

            defaultImport = trimmed.slice(0, commaIndex).trim();
            const rest = trimmed.slice(commaIndex + 1).trim();
            if (rest.startsWith('{')) {
                namedImports = parseNamedImports(rest);
            } else if (rest.startsWith('* as ')) {
                namespaceImport = rest.slice(5).trim();
            }

            return { defaultImport, namespaceImport, namedImports };
        };

        const transformRuntimeModuleSource = (source: string, filePath: string) => {
            const exportNames: string[] = [];
            const exportAliases: Array<{ local: string; exported: string }> = [];
            const importPrelude: string[] = [];
            let importIndex = 0;

            const addExportName = (name: string) => {
                if (!exportNames.includes(name)) {
                    exportNames.push(name);
                }
            };

            let transformed = source.replace(/^\s*import\s+([^;]+?)\s+from\s+['\"]([^'\"]+)['\"]\s*;?\s*$/gm, (_full, clause: string, specifier: string) => {
                const moduleVar = `__module_${importIndex++}`;
                const bindings = parseImportClause(clause);
                const statements = [`const ${moduleVar} = await __loadModule(${JSON.stringify(specifier)}, __filename);`];

                if (bindings.defaultImport) {
                    statements.push(`const ${bindings.defaultImport} = Object.prototype.hasOwnProperty.call(${moduleVar}, "default") ? ${moduleVar}.default : ${moduleVar};`);
                }

                if (bindings.namespaceImport) {
                    statements.push(`const ${bindings.namespaceImport} = ${moduleVar};`);
                }

                if (bindings.namedImports.length > 0) {
                    const destructured = bindings.namedImports
                        .map(({ imported, local }) => imported === local ? imported : `${imported}: ${local}`)
                        .join(', ');
                    statements.push(`const { ${destructured} } = ${moduleVar};`);
                }

                importPrelude.push(...statements);
                return '';
            });

            transformed = transformed.replace(/^\s*import\s+['\"]([^'\"]+)['\"]\s*;?\s*$/gm, (_full, specifier: string) => {
                importPrelude.push(`await __loadModule(${JSON.stringify(specifier)}, __filename);`);
                return '';
            });

            transformed = transformed.replace(/^\s*export\s*\{([^}]*)\}\s*from\s+['\"]([^'\"]+)['\"]\s*;?\s*$/gm, (_full, names: string, specifier: string) => {
                const moduleVar = `__module_${importIndex++}`;
                importPrelude.push(`const ${moduleVar} = await __loadModule(${JSON.stringify(specifier)}, __filename);`);

                for (const part of names.split(',').map((value) => value.trim()).filter(Boolean)) {
                    const [importedRaw, exportedRaw] = part.split(/\s+as\s+/);
                    const imported = (importedRaw ?? '').trim();
                    const exported = (exportedRaw ?? imported).trim();
                    exportAliases.push({
                        local: `${moduleVar}.${imported}`,
                        exported,
                    });
                }

                return '';
            });

            transformed = transformed.replace(/^\s*export\s+\*\s+from\s+['\"]([^'\"]+)['\"]\s*;?\s*$/gm, (_full, specifier: string) => {
                const moduleVar = `__module_${importIndex++}`;
                importPrelude.push(`const ${moduleVar} = await __loadModule(${JSON.stringify(specifier)}, __filename);`);
                importPrelude.push(`Object.assign(__exports, ${moduleVar});`);
                return '';
            });

            transformed = transformed.replace(/^\s*export\s+\*\s+as\s+(\w+)\s+from\s+['\"]([^'\"]+)['\"]\s*;?\s*$/gm, (_full, exported: string, specifier: string) => {
                const moduleVar = `__module_${importIndex++}`;
                importPrelude.push(`const ${moduleVar} = await __loadModule(${JSON.stringify(specifier)}, __filename);`);
                exportAliases.push({
                    local: moduleVar,
                    exported,
                });
                return '';
            });

            transformed = transformed.replace(/export\s+default\s+function\s*(\w+)?\s*\(/g, (_full, name: string | undefined) => {
                return `__exports.default = function ${name ?? ''}(`;
            });

            transformed = transformed.replace(/export\s+default\s+class\s+(\w+)/g, (_full, name: string) => {
                return `__exports.default = class ${name}`;
            });

            transformed = transformed.replace(/export\s+default\s+/g, '__exports.default = ');

            transformed = transformed.replace(/export\s+function\s+(\w+)\s*\(/g, (_full, name: string) => {
                addExportName(name);
                return `function ${name}(`;
            });

            transformed = transformed.replace(/export\s+class\s+(\w+)/g, (_full, name: string) => {
                addExportName(name);
                return `class ${name}`;
            });

            transformed = transformed.replace(/export\s+(const|let|var)\s+(\w+)/g, (_full, kind: string, name: string) => {
                addExportName(name);
                return `${kind} ${name}`;
            });

            transformed = transformed.replace(/export\s*\{([^}]*)\}\s*;?/g, (_full, names: string) => {
                for (const part of names.split(',').map((value) => value.trim()).filter(Boolean)) {
                    const [localRaw, exportedRaw] = part.split(/\s+as\s+/);
                    const local = (localRaw ?? '').trim();
                    exportAliases.push({
                        local,
                        exported: (exportedRaw ?? local).trim(),
                    });
                }
                return '';
            });

            transformed = transformed.replace(/export\s*\{\s*\}\s*;?/g, '');

            const exportAssignments = [
                ...exportNames.map((name) => `__exports.${name} = ${name};`),
                ...exportAliases.map(({ local, exported }) => `__exports.${exported} = ${local};`),
            ];

            return `${importPrelude.join('\n')}\n${transformed}\n${exportAssignments.join('\n')}\nreturn __exports;\n//# sourceURL=${pathToFileURL(filePath).href}`;
        };

        const resolveRuntimeModulePath = (specifier: string, importerPath: string) => {
            if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
                return null;
            }

            const basePath = specifier.startsWith('/')
                ? specifier
                : path.resolve(path.dirname(importerPath), specifier);

            for (const suffix of runtimeImportSuffixes) {
                const candidate = suffix ? `${basePath}${suffix}` : basePath;
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    return candidate;
                }
            }

            return null;
        };

        const syncSocketRefs = () => {
            for (const socket of socketSet) {
                socket.app = simulatorApp;
                socket.worldContext = worldContext;
            }
        };

        const emitState = (target?: PluginSocket) => {
            const payload = {
                duration,
                current,
                state: simulatorApp ? (isPaused ? 'paused' : 'running') : 'stopped',
                scale,
                fps,
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
            if (!simulatorApp || isPaused) return;

            const dt = scale / fps;
            const startedAt = Date.now();
            simulatorApp.update(dt);
            duration += dt;
            current = duration;
            emitState();

            const elapsed = Date.now() - startedAt;
            const delay = dt * 1000 - elapsed;
            tv = setTimeout(onUpdate, Math.max(0, delay));
        };

        const onInit = () => {
            if (!simulatorApp) return;

            simulatorApp.ctx.on<GetEvent<IObject>, IObject>('get', (event) => {
                pushRecord({ time: duration, type: 'get', data: JSON.parse(JSON.stringify(event.source.object)) });
            });

            simulatorApp.ctx.on<SetEvent<IObject>, IObject>('set', (event) => {
                pushRecord({
                    time: duration,
                    type: 'set',
                    data: { ...JSON.parse(JSON.stringify(event.data)), id: event.source.object.id, table: event.source.object.table },
                });
            });

            simulatorApp.ctx.on<AddEvent<IObject>, IObject>('add', (event) => {
                pushRecord({ time: duration, type: 'add', data: JSON.parse(JSON.stringify(event.source.object)) });
            });

            simulatorApp.ctx.on<DelEvent<IObject>, IObject>('del', (event) => {
                pushRecord({ time: duration, type: 'del', data: { id: event.source.object.id, table: event.source.object.table } });
            });
        };

        const loadApp = () => {
            simulatorApp = new App(new MemStorage());
            worldContext = undefined;
            syncSocketRefs();
            onInit();

            const sourceDistPath = path.join(env.workDir, 'dist');
            const entryPath = path.join(sourceDistPath, 'src/app.js');
            if (!fs.existsSync(entryPath)) return;

            (async () => {
                try {
                    type RuntimeModuleRecord = {
                        exportsObject: Record<string, unknown>;
                        loaded: boolean;
                        error?: unknown;
                        promise: Promise<void>;
                    };

                    const moduleCache = new Map<string, RuntimeModuleRecord>();
                    const loadRuntimeModule = async (specifier: string, importerPath: string): Promise<Record<string, unknown>> => {
                        const resolvedPath = resolveRuntimeModulePath(specifier, importerPath);
                        if (!resolvedPath) {
                            const required = createRequire(importerPath)(specifier);
                            if (required && typeof required === 'object') {
                                return required as Record<string, unknown>;
                            }
                            return { default: required };
                        }

                        const cached = moduleCache.get(resolvedPath);
                        if (cached) {
                            if (cached.error !== undefined) {
                                throw cached.error;
                            }

                            // Break circular imports by returning the shared exports object
                            // while the first evaluation is still in progress.
                            if (!cached.loaded) {
                                return cached.exportsObject;
                            }

                            await cached.promise;
                            return cached.exportsObject;
                        }

                        const exportsObject: Record<string, unknown> = {};
                        let resolveModule!: () => void;
                        let rejectModule!: (error: unknown) => void;
                        const moduleRecord: RuntimeModuleRecord = {
                            exportsObject,
                            loaded: false,
                            promise: new Promise<void>((resolve, reject) => {
                                resolveModule = resolve;
                                rejectModule = reject;
                            }),
                        };

                        moduleCache.set(resolvedPath, moduleRecord);

                        try {
                            const source = fs.readFileSync(resolvedPath, 'utf-8');
                            const compiled = transformRuntimeModuleSource(source, resolvedPath);
                            const factory = new AsyncFunction('__loadModule', '__filename', '__dirname', '__exports', compiled);
                            await factory(
                                (childSpecifier: string, childImporterPath: string) => loadRuntimeModule(childSpecifier, childImporterPath),
                                resolvedPath,
                                path.dirname(resolvedPath),
                                exportsObject,
                            );
                            moduleRecord.loaded = true;
                            resolveModule();
                            return exportsObject;
                        } catch (error) {
                            moduleRecord.error = error;
                            rejectModule(error);
                            throw error;
                        }
                    };

                    let loaded: any = await loadRuntimeModule(entryPath, entryPath);
                    let entryFn: ((runtimeApp: App) => IEventSource<IObject>) | undefined;
                    while (loaded?.default) {
                        loaded = loaded.default;
                        if (typeof loaded === 'function') {
                            entryFn = loaded;
                            break;
                        }
                    }

                    if (!entryFn || !simulatorApp) return;
                    worldContext = entryFn(simulatorApp);
                    syncSocketRefs();
                }
                catch (error) {
                    console.error(`Error loading or executing ${entryPath}:`, error);
                }
            })();
        };

        return {
            attachSocket(socket: PluginSocket) {
                socket.app = simulatorApp;
                socket.worldContext = worldContext;
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
                if (!simulatorApp || !isPaused || newCurrent < 0 || newCurrent > duration || current === newCurrent) return;

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
                simulatorApp = undefined;
                worldContext = undefined;
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

                if (simulatorApp) {
                    clearTimer();
                    tv = setTimeout(onUpdate, 0);
                }

                emitState();
            },
            start() {
                isPaused = false;
                if (!simulatorApp) {
                    loadApp();
                    clearTimer();
                    tv = setTimeout(onUpdate, 0);
                }
                emitState();
            },
            sendEvent(data: unknown) {
                if (!data || typeof data !== 'object') return;

                const eventData = data as Record<string, unknown>;
                if (typeof eventData.type !== 'string' || !simulatorApp || !worldContext) return;

                const item: AppRecord = { time: duration, type: 'event', data: eventData as unknown as IEvent<IObject> };
                pushRecord(item);
                simulatorApp.trigger({ ...eventData, source: worldContext } as IEvent<IObject>);
            },
        };
    })();

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

        if (env && env.world && env.world.genWebTypeScript && env.world.genWebTypeScript.enabled) {
            const gen = path.join(env.workDir, env.world.genWebTypeScript.outDir || "gen");
            try {
                const codeFiles = genWebTypeScript(event.data);
                fs.mkdirSync(gen, { recursive: true });
                for (let file of codeFiles) {
                    fs.writeFileSync(path.join(gen, file.name), file.content, "utf-8");
                }
            } catch (err: any) {
                console.error("Error generating Web TypeScript code for World:", err.stack || err);
            }
        }
    });

    app.express().get('/api/world/log', (req, res) => {
        const parseTime = (value: unknown, name: string): number | undefined => {
            if (value === undefined) return undefined;
            const raw = Array.isArray(value) ? value[0] : value;
            if (raw === undefined || raw === null || raw === '') return undefined;
            const parsed = Number(raw);
            if (Number.isNaN(parsed)) {
                throw new Error(`${name} must be a number`);
            }
            return parsed;
        };

        try {
            const start = parseTime(req.query.startTime ?? req.query.start, 'startTime');
            const end = parseTime(req.query.endTime ?? req.query.end, 'endTime');
            const query: LogQueryOptions = {};

            if (start !== undefined) {
                query.start = start;
            }

            if (end !== undefined) {
                query.end = end;
            }

            if (start !== undefined && end !== undefined && start > end) {
                res.status(400).json({ error: 'startTime must be less than or equal to endTime' });
                return;
            }

            res.json({
                current: simulator.getCurrentTime(),
                start: start ?? null,
                end: end ?? simulator.getCurrentTime(),
                logs: simulator.getLogs(query),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid query parameters';
            res.status(400).json({ error: message });
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

        onEvent('world-get-state', () => simulator.emitState(socketLike));

        onEvent('world-get-graph', () => {
            if (graph) {
                emit('world-graph', graph);
            }
        })

        onEvent<number>('world-set-timescale', (newScale) => {
            simulator.setTimescale(newScale);
        });

        onEvent<number>('world-set-fps', (newFps) => {
            simulator.setFps(newFps);
        });

        onEvent<number>('world-set-current', (newCurrent) => {
            simulator.setCurrent(newCurrent);
        });

        onEvent('world-reset', () => {
            simulator.reset();
        });

        onEvent('world-pause', () => {
            simulator.pause();
        });

        onEvent('world-resume', () => {
            simulator.resume();
        });

        onEvent('world-start', () => {
            simulator.start();
        });

        onEvent('world-send-event', (data) => {
            // console.log('Received event from client:', data, socketLike.device);
            simulator.sendEvent(data);
        });

        onEvent<{ type: string }>('world-device', (device) => {
            socketLike.device = device;
            emitDeviceList();
        });

        onEvent<{ type: string }>('world-get-devices', () => {
            emitSocketEvent(socketLike, 'world-device-list', getDevices());
        });

        socketSet.add(socketLike);
        simulator.attachSocket(socketLike);

        attachSocketDisconnect(socketLike, () => {
            socketSet.delete(socketLike);
            for (const cleanup of cleanups) {
                cleanup();
            }
            emitDeviceList();
        }, cleanups);
    });
}