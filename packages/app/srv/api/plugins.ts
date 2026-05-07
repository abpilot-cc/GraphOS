import type { Request, Response } from "express";
import type { PluginManager } from "../plugin-manager.ts";

export function handleGetPlugins(pluginManager: PluginManager) {
  return (_req: Request, res: Response) => {
    res.json(
      pluginManager.listPlugins().map(({ name, status, error, nodeTypes }) => ({
        name,
        status,
        error,
        nodeTypeCount: nodeTypes.length,
      })),
    );
  };
}
