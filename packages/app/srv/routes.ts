import type { Express } from "express";
import type { PluginManager } from "./plugin-manager.ts";
import type { RealtimeServer } from "./realtime.ts";
import { handleGetNodeTypes } from "./api/node-types.ts";
import { handleGetPlugins } from "./api/plugins.ts";
import { handleGetGraphDescription } from "./api/graph-description.ts";
import { handleGetGraphNode } from "./api/graph-node.ts";
import { handlePostGraphApply } from "./api/graph-apply.ts";
import { handleGetGraphHistory, handlePostGraphHistoryRestore } from "./api/graph-history.ts";

export function registerRoutes(app: Express, realtime: RealtimeServer, pluginManager: PluginManager) {
  app.get("/api/node-types", handleGetNodeTypes(pluginManager));
  app.get("/api/plugins", handleGetPlugins(pluginManager));
  app.get("/api/graph/description", handleGetGraphDescription(pluginManager));
  app.get("/api/graph/node", handleGetGraphNode(pluginManager));
  app.get("/api/graph/history", handleGetGraphHistory());
  app.post("/api/graph/apply", handlePostGraphApply(realtime, pluginManager));
  app.post("/api/graph/history/restore", handlePostGraphHistoryRestore(realtime, pluginManager));
}
