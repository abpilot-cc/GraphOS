import { EventEmitter } from "events";
import express from "express";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { IGraph, INodeType, IApp, IAppEvents, AppEvent } from "graphos-core";
import type { Express, NextFunction, Request, Response } from "express";


type PluginInstaller = (app: IApp, env: any) => void | Promise<void>;

function makePluginApp(expressApp: Express): { app: IApp; nodeTypes: INodeType[], tabs: PluginTabDefinition[] } {
  const nodeTypes: INodeType[] = [];
  const listeners = new Map<keyof IAppEvents, Array<(event: IAppEvents[keyof IAppEvents]) => void>>();
  const tabs: PluginTabDefinition[] = [];

  const register = (raw: unknown): void => {
    if (!raw || typeof raw !== "object") {
      throw new Error("Node type must be an object");
    }
    const nt = raw as Record<string, unknown>;
    if (typeof nt.type !== "string" || !nt.type) {
      throw new Error('Node type must have a non-empty string "type"');
    }
    if (typeof nt.description !== "string") {
      throw new Error(`Node type "${nt.type}" must have a string "description"`);
    }
    nodeTypes.push(raw as INodeType);
  };

  const app: IApp = {
    addNodeType(nodeType: INodeType): IApp {
      register(nodeType);
      return app;
    },
    addTab(tab: PluginTabDefinition): IApp {
      tabs.push(tab);
      return app;
    },
    on<K extends keyof IAppEvents>(event: K, listener: (event: IAppEvents[K]) => void): IApp {
      const list = listeners.get(event) ?? [];
      list.push(listener as any);
      listeners.set(event, list);
      return app;
    },
    express(): Express {
      return expressApp;
    },
  };

  return {
    app,
    nodeTypes,
    tabs,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PluginStatus = "loaded" | "error" | "unloaded";

export interface PluginInfo {
  name: string;
  entryPath: string;
  status: PluginStatus;
  error?: string;
  nodeTypes: INodeType[];
  tabs: PluginTabDefinition[];
}

export interface PluginTabDefinition {
  id: string;
  label: string;
  url: string;
}

export interface PluginManagerEvents {
  "plugin:loaded": (name: string, nodeTypes: INodeType[]) => void;
  "plugin:unloaded": (name: string) => void;
  "plugin:error": (name: string, error: Error) => void;
  "node-types:changed": (nodeTypes: INodeType[]) => void;
}

// ---------------------------------------------------------------------------
// PluginManager
// ---------------------------------------------------------------------------

export class PluginManager extends EventEmitter {
  private readonly plugins = new Map<string, PluginInfo>();
  private readonly pluginAppListeners = new Map<string, Map<keyof IAppEvents, Array<(event: IAppEvents[keyof IAppEvents]) => void>>>();
  private readonly pluginHttpApps = new Map<string, Express>();
  private readonly graphosDir: string;
  private readonly workDir: string;
  private readonly expressApp: Express;
  private expressBridgeAttached = false;
  private watcher: fs.FSWatcher | null = null;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(workDir: string, expressApp: Express) {
    super();
    this.workDir = workDir;
    this.expressApp = expressApp;
    this.graphosDir = workDir;
  }

  attachExpressBridge(): void {
    if (this.expressBridgeAttached) return;

    this.expressApp.use((req: Request, res: Response, next: NextFunction) => {
      this.dispatchPluginHttp(req, res, next);
    });

    this.expressBridgeAttached = true;
  }

  private dispatchPluginHttp(req: Request, res: Response, next: NextFunction): void {
    const handlers = Array.from(this.pluginHttpApps.values());
    if (handlers.length === 0) {
      next();
      return;
    }

    let index = 0;
    const run = (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }

      const handler = handlers[index];
      index += 1;

      if (!handler) {
        next();
        return;
      }

      handler(req, res, run);
    };

    run();
  }

  private getGraphosPackageJsonPath(): string {
    return path.join(this.graphosDir, "package.json");
  }

  private readGraphosDependencies(): [string[], any] {
    const packageJsonPath = this.getGraphosPackageJsonPath();
    try {
      if (!fs.existsSync(packageJsonPath)) {
        console.warn(`[PluginManager] Missing GraphOS package.json at ${packageJsonPath}`);
        return [[], { workDir: this.workDir }];
      }

      const raw = fs.readFileSync(packageJsonPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const deps = parsed.devDependencies;
      const graphosConfig = parsed.graphos && typeof parsed.graphos === "object"
        ? parsed.graphos as Record<string, unknown>
        : undefined;
      const env = graphosConfig ? { ...graphosConfig, workDir: this.workDir } : { workDir: this.workDir };
      if (!deps || typeof deps !== "object") {
        return [[], env];
      }

      const dependencyNames = Object.keys(deps as Record<string, unknown>);
      const pluginDependencies: string[] = [];

      for (const depName of dependencyNames) {
        const depPackageJsonPath = path.join(this.graphosDir, "node_modules", depName, "package.json");
        if (!fs.existsSync(depPackageJsonPath)) {
          continue;
        }

        try {
          const depRaw = fs.readFileSync(depPackageJsonPath, "utf-8");
          const depParsed = JSON.parse(depRaw) as Record<string, unknown>;
          const graphos = depParsed.graphos;
          const plugin = graphos && typeof graphos === "object"
            ? (graphos as Record<string, unknown>).plugin
            : undefined;
          const entry = plugin && typeof plugin === "object"
            ? (plugin as Record<string, unknown>).entry
            : undefined;

          if (typeof entry === "string" && entry.trim()) {
            pluginDependencies.push(depName);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[PluginManager] Skipping dependency '${depName}' because its package.json could not be read: ${message}`);
        }
      }

      return [pluginDependencies, env];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[PluginManager] Failed reading GraphOS devDependencies: ${message}`);
      return [[], null];
    }
  }

  private resolvePluginConfig(name: string): { entryPath: string; tabs: PluginTabDefinition[] } {
    const packageJsonPath = path.join(this.graphosDir, "node_modules", name, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`Cannot resolve package '${name}' from ${this.graphosDir}/node_modules`);
    }

    const raw = fs.readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const graphos = parsed.graphos;
    if (!graphos || typeof graphos !== "object") {
      throw new Error(`Package '${name}' is missing graphos config`);
    }

    const plugin = (graphos as Record<string, unknown>).plugin;
    if (!plugin || typeof plugin !== "object") {
      throw new Error(`Package '${name}' is missing graphos.plugin config`);
    }

    const entry = (plugin as Record<string, unknown>).entry;
    if (typeof entry !== "string" || !entry) {
      throw new Error(`Package '${name}' has invalid graphos.plugin.entry`);
    }

    const rawTabs = (plugin as Record<string, unknown>).tabs;
    const tabs = this.normalizePluginTabs(rawTabs, name);

    return {
      entryPath: path.resolve(path.dirname(packageJsonPath), entry),
      tabs,
    };
  }

  private normalizePluginTabs(rawTabs: unknown, pluginName: string): PluginTabDefinition[] {
    if (!Array.isArray(rawTabs)) return [];

    const normalized: PluginTabDefinition[] = [];
    for (const item of rawTabs) {
      if (!item || typeof item !== "object") continue;
      const tab = item as Record<string, unknown>;
      const rawId = tab.id;
      const rawLabel = tab.label;
      const rawUrl = tab.url;

      if (typeof rawId !== "string" || !rawId.trim()) continue;
      if (typeof rawLabel !== "string" || !rawLabel.trim()) continue;
      if (typeof rawUrl !== "string" || !rawUrl.trim()) continue;

      normalized.push({
        id: `${pluginName}:${rawId.trim()}`,
        label: rawLabel.trim(),
        url: rawUrl.trim(),
      });
    }

    return normalized;
  }

  // ---- Loading -----------------------------------------------------------

  async loadAll(): Promise<any> {
    const [deps, env] = this.readGraphosDependencies();
    if (deps.length === 0) {
      for (const name of this.plugins.keys()) {
        this.unloadPlugin(name);
      }
      console.log("[PluginManager] No plugin packages with graphos.plugin.entry found in .graphos/package.json");
      return env;
    }

    const next = new Set(deps);
    for (const existing of this.plugins.keys()) {
      if (!next.has(existing)) {
        this.unloadPlugin(existing);
      }
    }

    await Promise.all(deps.map((depName) => this.loadPlugin(depName, env)));
    return env;
  }

  async loadPlugin(name: string, env: any): Promise<void> {
    let entryPath = "";
    const pluginHttpApp = express();
    const { app: pluginApp, nodeTypes, tabs } = makePluginApp(pluginHttpApp);
    const appListeners = new Map<AppEvent, Array<(event: IAppEvents[keyof IAppEvents]) => void>>();

    // Runtime compatibility: always provide plugins an app object
    // with on/addNode/addNodeType, even if older code paths construct
    // a partial context.
    const compatApp: IApp = {
      addNodeType(nodeType: INodeType): IApp {
        pluginApp.addNodeType(nodeType);
        return compatApp;
      },
      addTab(tab: PluginTabDefinition): IApp {
        pluginApp.addTab(tab);
        return compatApp;
      },
      on<K extends keyof IAppEvents>(event: K, listener: (event: IAppEvents[K]) => void): IApp {
        const maybeOn = (pluginApp as Partial<IApp>).on;
        if (typeof maybeOn === "function") {
          maybeOn(event, listener);
        }
        const list = appListeners.get(event) ?? [];
        list.push(listener as any);
        appListeners.set(event, list);
        return compatApp;
      },
      express(): Express {
        return pluginApp.express();
      },
    };

    try {
      const config = this.resolvePluginConfig(name);
      entryPath = config.entryPath;
      tabs.push(...config.tabs);
      if (!fs.existsSync(entryPath)) {
        throw new Error(`Plugin entry does not exist: ${entryPath}`);
      }

      // Use a timestamp query to bust Node.js ESM import cache on hot reload
      const url = `${pathToFileURL(entryPath).href}?t=${Date.now()}`;
      const mod = await import(url);
      const installer: PluginInstaller | undefined = mod.default;

      if (typeof installer !== "function") {
        throw new Error(`default export must be a function, got ${typeof installer}`);
      }

      await installer(compatApp, env);

      const info: PluginInfo = { name, entryPath, status: "loaded", nodeTypes, tabs };
      this.plugins.set(name, info);
      this.pluginAppListeners.set(name, appListeners);
      this.pluginHttpApps.set(name, pluginHttpApp);

      console.log(`[PluginManager] Loaded plugin '${name}' — ${nodeTypes.length} node type(s)`);
      this.emit("plugin:loaded", name, nodeTypes);
      this.emit("node-types:changed", this.getNodeTypes());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[PluginManager] Failed to load plugin '${name}': ${error.message}`);

      this.plugins.set(name, {
        name,
        entryPath,
        status: "error",
        error: error.message,
        nodeTypes: [],
        tabs: [],
      });
      this.pluginAppListeners.delete(name);
      this.pluginHttpApps.delete(name);

      this.emit("plugin:error", name, error);
    }
  }

  unloadPlugin(name: string): void {
    if (!this.plugins.has(name)) return;

    this.plugins.delete(name);
    this.pluginAppListeners.delete(name);
    this.pluginHttpApps.delete(name);
    console.log(`[PluginManager] Unloaded plugin '${name}'`);
    this.emit("plugin:unloaded", name);
    this.emit("node-types:changed", this.getNodeTypes());
  }

  emitAppEvent(event: AppEvent, payload: IAppEvents[keyof IAppEvents]): void {
    for (const [pluginName, listenersByEvent] of this.pluginAppListeners.entries()) {
      const listeners = listenersByEvent.get(event) ?? [];
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error(`[PluginManager] Plugin '${pluginName}' app.on('${event}') listener error: ${error.message}`);
          this.emit("plugin:error", pluginName, error);
        }
      }
    }
  }

  async reloadPlugin(name: string, env: any): Promise<void> {
    // Remove stale entry so loadPlugin starts fresh
    this.plugins.delete(name);
    this.pluginAppListeners.delete(name);
    this.pluginHttpApps.delete(name);
    await this.loadPlugin(name, env);
  }

  // ---- Query helpers -----------------------------------------------------

  getNodeTypes(): INodeType[] {
    const all: INodeType[] = [];
    for (const info of this.plugins.values()) {
      if (info.status === "loaded") {
        all.push(...info.nodeTypes);
      }
    }
    return all;
  }

  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(name: string): PluginInfo | undefined {
    return this.plugins.get(name);
  }

  // ---- Hot reload (fs.watch) ---------------------------------------------

  watchPlugins(env: any): void {
    if (this.watcher) return;

    if (!fs.existsSync(this.graphosDir)) {
      // Watch parent so we notice when .graphos/ is created
      const parent = path.dirname(this.graphosDir);
      console.log("[PluginManager] Waiting for .graphos directory to appear...");
      const parentWatcher = fs.watch(parent, (_, filename) => {
        if (filename && path.join(parent, filename) === this.graphosDir && fs.existsSync(this.graphosDir)) {
          parentWatcher.close();
          this._startWatch(env);
        }
      });
      return;
    }

    this._startWatch(env);
  }

  private _startWatch(env: any): void {
    this.watcher = fs.watch(this.graphosDir, { recursive: true }, (_, filename) => {
      if (!filename) return;

      const normalized = filename.replace(/\\/g, "/");
      if (normalized === "package.json") {
        const existing = this.debounceTimers.get("__all__");
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(
          "__all__",
          setTimeout(() => {
            this.debounceTimers.delete("__all__");
            console.log("[PluginManager] .graphos/package.json changed, reloading all plugins...");
            void this.loadAll().catch((e: unknown) => {
              console.error("[PluginManager] Hot-reload error while loading all plugins:", e);
            });
          }, 250),
        );
        return;
      }

      if (!normalized.startsWith("node_modules/")) return;

      const parts = normalized.split("/");
      let pluginName = parts[1] ?? "";
      if (pluginName.startsWith("@")) {
        const scopedName = parts[2] ?? "";
        if (!scopedName) return;
        pluginName = `${pluginName}/${scopedName}`;
      }

      const [dependencies] = this.readGraphosDependencies();
      if (!dependencies.includes(pluginName)) return;

      if (!pluginName) return;

      // Debounce: wait 250 ms after last event for the same plugin
      const existing = this.debounceTimers.get(pluginName);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(
        pluginName,
        setTimeout(() => {
          this.debounceTimers.delete(pluginName);
          console.log(`[PluginManager] Change in '${pluginName}', reloading…`);
          this.reloadPlugin(pluginName, env).catch((e: unknown) => {
            console.error(`[PluginManager] Hot-reload error for '${pluginName}':`, e);
          });
        }, 250),
      );
    });

    console.log(`[PluginManager] Watching ${this.graphosDir}`);
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    console.log("[PluginManager] Stopped watching plugins");
  }

  // ---- EventEmitter typed overloads -------------------------------------

  override on<K extends keyof PluginManagerEvents>(event: K, listener: PluginManagerEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof PluginManagerEvents>(
    event: K,
    ...args: Parameters<PluginManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
