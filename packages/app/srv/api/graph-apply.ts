import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { validateNode } from "graphos-core";
import type { INode } from "graphos-core";
import type { PluginManager } from "../plugin-manager.ts";
import {
  getWorkingDir,
  TransactionSchema,
  getGraphSelectionState,
  loadGraph,
  resolveGraphId,
  saveGraph,
  setSelectedNodeId,
  toRFGraph,
} from "../core.ts";
import { listGraphHistory } from "../history.ts";

export function handlePostGraphApply(io: Server, pluginManager: PluginManager) {
  return (req: Request, res: Response) => {
    const graphId = resolveGraphId(req.body?.graphId);
    const graph = loadGraph(graphId);

    if (!graph) {
      res.status(404).json({
        success: false,
        status: "failed",
        message: `Graph not found: ${graphId}`,
      });
      return;
    }

    const parsed = TransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      res.status(400).json({
        success: false,
        status: "failed",
        message: firstIssue
          ? `Invalid request body: ${firstIssue.message}`
          : "Invalid request body",
      });
      return;
    }

    const { ops } = parsed.data;
    const applied: string[] = [];
    const errors: { op: string; index: number; reason: string }[] = [];
    const nodeTypesByType = new Map(pluginManager.getNodeTypes().map((nt) => [nt.type, nt]));

    for (let i = 0; i < ops.length; i++) {
      const operation = ops[i];
      try {
        switch (operation.op) {
          case "CREATE_NODE": {
            const { id, type, position, data } = operation.metadata;
            if (graph.nodes.some((n) => n.id === id)) {
              errors.push({ op: operation.op, index: i, reason: `Node with id "${id}" already exists` });
              break;
            }
            const newNode: INode = {
              id,
              type,
              position: [position.x, position.y],
              properties: data?.properties ?? {},
            };
            const nodeTypeDef = nodeTypesByType.get(type);
            if (nodeTypeDef) {
              const [valid, validationError] = validateNode(newNode, nodeTypeDef);
              if (!valid) {
                errors.push({
                  op: operation.op,
                  index: i,
                  reason: `Node validation failed: ${validationError}. Node type "${type}" requires: ${JSON.stringify(nodeTypeDef.properties)}.`,
                });
                break;
              }
            }
            graph.nodes.push(newNode);
            applied.push(`CREATE_NODE(${id})`);
            break;
          }
          case "UPDATE_NODE": {
            const { id, data } = operation.metadata;
            const node = graph.nodes.find((n) => n.id === id);
            if (!node) {
              errors.push({ op: operation.op, index: i, reason: `Node not found: ${id}` });
              break;
            }
            const mergedNode: INode = {
              ...node,
              properties:
                data.properties !== undefined
                  ? { ...node.properties, ...data.properties }
                  : node.properties,
              position:
                data.position !== undefined
                  ? [data.position.x ?? node.position[0], data.position.y ?? node.position[1]]
                  : node.position,
            };
            const updateNodeTypeDef = nodeTypesByType.get(node.type);
            if (updateNodeTypeDef) {
              const [valid, validationError] = validateNode(mergedNode, updateNodeTypeDef);
              if (!valid) {
                errors.push({
                  op: operation.op,
                  index: i,
                  reason: `Node validation failed: ${validationError}. Node type "${node.type}" requires: ${JSON.stringify(updateNodeTypeDef.properties)}.`,
                });
                break;
              }
            }
            (node as any).properties = mergedNode.properties;
            (node as any).position = mergedNode.position;
            applied.push(`UPDATE_NODE(${id})`);
            break;
          }
          case "DELETE_NODE": {
            const { id } = operation.metadata;
            const before = graph.nodes.length;
            graph.nodes = graph.nodes.filter((n) => n.id !== id);
            graph.edges = graph.edges.filter(([source, target]) => source !== id && target !== id);
            if (graph.nodes.length === before) {
              errors.push({ op: operation.op, index: i, reason: `Node not found: ${id}` });
              break;
            }
            const selectionState = getGraphSelectionState(graphId);
            if (selectionState.selectedNodeId === id) {
              setSelectedNodeId(graphId, null);
            }
            applied.push(`DELETE_NODE(${id})`);
            break;
          }
          case "CONNECT": {
            const { source, target } = operation.metadata;
            if (!graph.nodes.some((n) => n.id === source)) {
              errors.push({ op: operation.op, index: i, reason: `Source node not found: ${source}` });
              break;
            }
            if (!graph.nodes.some((n) => n.id === target)) {
              errors.push({ op: operation.op, index: i, reason: `Target node not found: ${target}` });
              break;
            }
            if (graph.edges.some(([s, t]) => s === source && t === target)) {
              errors.push({ op: operation.op, index: i, reason: `Edge already exists: ${source} -> ${target}` });
              break;
            }
            graph.edges.push([source, target]);
            applied.push(`CONNECT(${source}->${target})`);
            break;
          }
          case "DISCONNECT": {
            const { id } = operation.metadata;
            // id format: "edge_<idx>_<source>_<target>"
            const parts = id.split("_");
            const source = parts[2];
            const target = parts.slice(3).join("_");
            const before = graph.edges.length;
            graph.edges = graph.edges.filter(([s, t]) => !(s === source && t === target));
            if (graph.edges.length === before) {
              errors.push({ op: operation.op, index: i, reason: `Edge not found: ${id}` });
              break;
            }
            applied.push(`DISCONNECT(${id})`);
            break;
          }
        }
      } catch (err) {
        errors.push({ op: operation.op, index: i, reason: String(err) });
      }
    }

    if (applied.length > 0) {
      saveGraph(graph, {
        source: "api.apply",
        summary: applied.join(", "),
      });
      io.to(graphId).emit("graph-update", toRFGraph(graph));
      io.to(graphId).emit("graph-history-updated", {
        graphId,
        history: listGraphHistory(getWorkingDir(), graphId),
      });
      pluginManager.emitAppEvent("changed", { type: "changed", data: graph });
    }

    const success = errors.length === 0;
    const status = success ? "completed" : applied.length > 0 ? "completed_with_errors" : "failed";

    res.json({
      success,
      status,
      totalOps: ops.length,
      appliedOps: applied.length,
      failedOps: errors.length,
      message: success
        ? `All ${applied.length} operation(s) completed successfully.`
        : `Applied ${applied.length}/${ops.length} operation(s), ${errors.length} failed.`,
      errors,
    });
  };
}
