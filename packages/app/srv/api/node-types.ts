import type { Request, Response } from "express";
import type { PluginManager } from "../plugin-manager.ts";
import type { INodeType, NodeProperty, NodePropertyEditor } from "graphos-core";

function inferEditor(property: NodeProperty): NodePropertyEditor {
  if (property.editor) return property.editor;
  if (Array.isArray(property.type)) return "select";

  switch (property.type) {
    case "boolean":
      return "checkbox";
    case "float":
    case "integer":
      return "number";
    case "JSONSchema":
      return "json";
    case "string":
    default:
      return "text";
  }
}

export function normalizeNodeTypes(nodeTypes: INodeType[]): INodeType[] {
  return nodeTypes.map((nodeType) => ({
    ...nodeType,
    properties: Object.fromEntries(
      Object.entries(nodeType.properties ?? {}).map(([key, property]) => [
        key,
        {
          ...property,
          editor: inferEditor(property),
        },
      ]),
    ),
  }));
}

export function handleGetNodeTypes(pluginManager: PluginManager) {
  return (_req: Request, res: Response) => {
    res.json(normalizeNodeTypes(pluginManager.getNodeTypes()));
  };
}
