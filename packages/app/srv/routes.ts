import type { Express } from "express";
import type { Server } from "socket.io";
import type { PluginManager } from "./plugin-manager.ts";
import { handleGetNodeTypes } from "./api/node-types.ts";
import { handleGetPlugins } from "./api/plugins.ts";
import { handleGetGraphDescription } from "./api/graph-description.ts";
import { handleGetGraphNode } from "./api/graph-node.ts";
import { handlePostGraphApply } from "./api/graph-apply.ts";

export function registerRoutes(app: Express, io: Server, pluginManager: PluginManager) {
  app.get("/api/node-types", handleGetNodeTypes(pluginManager));
  app.get("/api/plugins", handleGetPlugins(pluginManager));
  app.get("/api/graph/description", handleGetGraphDescription(pluginManager));
  app.get("/api/graph/node", handleGetGraphNode(pluginManager));
  app.post("/api/graph/apply", handlePostGraphApply(io, pluginManager));
}
