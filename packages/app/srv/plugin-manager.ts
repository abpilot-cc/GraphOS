import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { IGraph, INodeType } from "graphos-core";

type AppEvent = "changed";
type IAppEventChanged = { type: "changed"; data: IGraph };

// ---------------------------------------------------------------------------
// Plugin App context — matches IApp + addNode alias used by app.js plugins
// ---------------------------------------------------------------------------

type PluginApp = {
  addNodeType(nodeType: unknown): PluginApp;
  on(event: AppEvent, listener: (event: IAppEventChanged) => void): PluginApp;
};

type PluginInstaller = (app: PluginApp) => void | Promise<void>;

function makePluginApp(): { app: PluginApp; nodeTypes: INodeType[] } {
  const nodeTypes: INodeType[] = [];
  const listeners = new Map<AppEvent, Array<(event: IAppEventChanged) => void>>();

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

  const app: PluginApp = {
    addNodeType(nodeType: unknown): PluginApp {
      register(nodeType);
      return app;
    },
    on(event: AppEvent, listener: (event: IAppEventChanged) => void): PluginApp {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
      return app;
    },
  };

  return {
    app,
    nodeTypes,
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
  private readonly pluginAppListeners = new Map<string, Map<AppEvent, Array<(event: IAppEventChanged) => void>>>();
  private readonly pluginsDir: string;
  private watcher: fs.FSWatcher | null = null;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(pluginsDir: string) {
    super();
    this.pluginsDir = pluginsDir;
  }

  // ---- Loading -----------------------------------------------------------

  async loadAll(): Promise<void> {
    if (!fs.existsSync(this.pluginsDir)) {
      console.log(`[PluginManager] No plugins directory at ${this.pluginsDir}`);
      return;
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    await Promise.all(dirs.map((d) => this.loadPlugin(d.name)));
  }

  async loadPlugin(name: string): Promise<void> {
    const entryPath = path.join(this.pluginsDir, name, "app.js");

    if (!fs.existsSync(entryPath)) {
      console.warn(`[PluginManager] Plugin '${name}' has no app.js, skipping`);
      return;
    }

    const { app: pluginApp, nodeTypes } = makePluginApp();
    const appListeners = new Map<AppEvent, Array<(event: IAppEventChanged) => void>>();

    // Runtime compatibility: always provide plugins an app object
    // with on/addNode/addNodeType, even if older code paths construct
    // a partial context.
    const compatApp: PluginApp = {
      addNodeType(nodeType: unknown): PluginApp {
        pluginApp.addNodeType(nodeType);
        return compatApp;
      },
      on(event: AppEvent, listener: (event: IAppEventChanged) => void): PluginApp {
        const maybeOn = (pluginApp as Partial<PluginApp>).on;
        if (typeof maybeOn === "function") {
          maybeOn(event, listener);
        }
        const list = appListeners.get(event) ?? [];
        list.push(listener);
        appListeners.set(event, list);
        return compatApp;
      },
    };

    try {
      // Use a timestamp query to bust Node.js ESM import cache on hot reload
      const url = `${pathToFileURL(entryPath).href}?t=${Date.now()}`;
      const mod = await import(url);
      const installer: PluginInstaller | undefined = mod.default;

      if (typeof installer !== "function") {
        throw new Error(`default export must be a function, got ${typeof installer}`);
      }

      await installer(compatApp);

      const info: PluginInfo = { name, entryPath, status: "loaded", nodeTypes };
      this.plugins.set(name, info);
      this.pluginAppListeners.set(name, appListeners);

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
      });
      this.pluginAppListeners.delete(name);

      this.emit("plugin:error", name, error);
    }
  }

  unloadPlugin(name: string): void {
    if (!this.plugins.has(name)) return;

    this.plugins.delete(name);
    this.pluginAppListeners.delete(name);
    console.log(`[PluginManager] Unloaded plugin '${name}'`);
    this.emit("plugin:unloaded", name);
    this.emit("node-types:changed", this.getNodeTypes());
  }

  emitAppEvent(event: AppEvent, payload: IAppEventChanged): void {
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

  async reloadPlugin(name: string): Promise<void> {
    // Remove stale entry so loadPlugin starts fresh
    this.plugins.delete(name);
    await this.loadPlugin(name);
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

  watchPlugins(): void {
    if (this.watcher) return;

    if (!fs.existsSync(this.pluginsDir)) {
      // Watch parent so we notice when plugins/ is created
      const parent = path.dirname(this.pluginsDir);
      console.log(`[PluginManager] Waiting for plugins directory to appear…`);
      const parentWatcher = fs.watch(parent, (_, filename) => {
        if (filename && path.join(parent, filename) === this.pluginsDir && fs.existsSync(this.pluginsDir)) {
          parentWatcher.close();
          this._startWatch();
        }
      });
      return;
    }

    this._startWatch();
  }

  private _startWatch(): void {
    this.watcher = fs.watch(this.pluginsDir, { recursive: true }, (_, filename) => {
      if (!filename) return;

      // On Windows path separators may differ; normalise
      const parts = filename.split(/[\\/]/);
      const pluginName = parts[0];
      if (!pluginName) return;

      // Debounce: wait 250 ms after last event for the same plugin
      const existing = this.debounceTimers.get(pluginName);
      if (existing) clearTimeout(existing);

      this.debounceTimers.set(
        pluginName,
        setTimeout(() => {
          this.debounceTimers.delete(pluginName);
          console.log(`[PluginManager] Change in '${pluginName}', reloading…`);
          this.reloadPlugin(pluginName).catch((e: unknown) => {
            console.error(`[PluginManager] Hot-reload error for '${pluginName}':`, e);
          });
        }, 250),
      );
    });

    console.log(`[PluginManager] Watching ${this.pluginsDir}`);
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
