import path from "node:path";
import fs from "node:fs";

import { App, MemStorage, type IEventSource, type IEvent as IAppEvent, type GetEvent, type SetEvent, type AddEvent, type DelEvent } from "./index.js";
import type { IEvent, IObject, ISimulator } from "./ISimulator.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";


export class AppSimulator extends EventTarget implements ISimulator {

    private _app: App;
    private _worldContext: IEventSource<IObject>;

    update(dt: number): void {
        this._app.update(dt);
    }

    constructor(app: App, worldContext: IEventSource<IObject>) {
        super();
        this._app = app;
        this._worldContext = worldContext;

        app.ctx.on<GetEvent<IObject>, IObject>('get', (event) => {
            this.dispatchEvent(new CustomEvent("spawn", { detail: { object: event.source.object } }));
        });

        app.ctx.on<SetEvent<IObject>, IObject>('set', (event) => {
            this.dispatchEvent(new CustomEvent("change", { detail: { object: { ...JSON.parse(JSON.stringify(event.data)), id: event.source.object.id, table: event.source.object.table } } }));
        });

        app.ctx.on<AddEvent<IObject>, IObject>('add', (event) => {
            this.dispatchEvent(new CustomEvent("spawn", { detail: { object: event.source.object } }));
        });

        app.ctx.on<DelEvent<IObject>, IObject>('del', (event) => {
            this.dispatchEvent(new CustomEvent("despawn", { detail: { object: event.source.object } }));
        });
    }

    emit(event: IEvent): void {
        this._app.trigger({ ...event, source: this._worldContext } as IAppEvent<IObject>);
    }

    on(event: "spawn" | "despawn" | "change" | "reset" | "error", listener: (event: CustomEvent<any>) => void): void {
        this.addEventListener(event, listener as EventListener);
    }

    exit(): void {
        this.removeEventListener('spawn', null);
        this.removeEventListener('despawn', null);
        this.removeEventListener('change', null);
        this.removeEventListener('reset', null);
        this.removeEventListener('error', null);
    }

    static async load(entryPath: string): Promise<AppSimulator> {

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
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor as new (
                ...args: string[]
            ) => (...args: unknown[]) => Promise<unknown>;

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

            transformed = transformed.replace(/^\s*export\s*\{([^}]*)\}\s+from\s+['\"]([^'\"]+)['\"]\s*;?\s*$/gm, (_full, names: string, specifier: string) => {
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
                const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor as new (
                    ...args: string[]
                ) => (...args: unknown[]) => Promise<unknown>;
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

        if (!entryFn) throw new Error("Failed to find entry function in runtime module exports");
        let app = new App(new MemStorage());
        let worldContext = entryFn(app);

        return new AppSimulator(app, worldContext);
    }
}
