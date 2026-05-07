import type { Request, Response } from "express";
import type { INode } from "graphos-core";
import type { PluginManager } from "../plugin-manager.ts";
import {
  buildNodeRelationMaps,
  describeNodeForAI,
  getGraphSelectionState,
  loadGraph,
  resolveGraphId,
} from "../core.ts";

export function handleGetGraphNode(pluginManager: PluginManager) {
  return (req: Request, res: Response) => {
    const graphId = resolveGraphId(req.query.graphId);
    const requestedNodeId =
      typeof req.query.nodeId === "string" ? req.query.nodeId.trim() : "";

    const currentSelection = getGraphSelectionState(graphId).selectedNodeId;
    const nodeId = requestedNodeId || currentSelection || "";

    const graph = loadGraph(graphId);
    if (!graph) {
      res.status(404).json({ error: `Graph not found: ${graphId}` });
      return;
    }

    if (!nodeId) {
      res.status(400).json({
        error:
          "Missing required query parameter: nodeId, and no selected node is currently synced for this graph",
      });
      return;
    }

    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      res.status(404).json({ error: `Node not found: ${nodeId}` });
      return;
    }

    const nodeTypesByType = new Map(pluginManager.getNodeTypes().map((nt) => [nt.type, nt]));
    const relationMaps = buildNodeRelationMaps(graph);
    const parentIds = relationMaps.parentsByNodeId.get(node.id) ?? [];
    const childIds = relationMaps.childrenByNodeId.get(node.id) ?? [];
    const parentNodes = parentIds
      .map((id) => graph.nodes.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is INode => Boolean(candidate));
    const childNodes = childIds
      .map((id) => graph.nodes.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is INode => Boolean(candidate));

    res.json({
      graph: {
        id: graph.id,
        name: graph.name,
        selectedNodeId: currentSelection,
      },
      selectedNode: describeNodeForAI(node, graph, nodeTypesByType, relationMaps),
      parentNodes: parentNodes.map((candidate) =>
        describeNodeForAI(candidate, graph, nodeTypesByType, relationMaps),
      ),
      childNodes: childNodes.map((candidate) =>
        describeNodeForAI(candidate, graph, nodeTypesByType, relationMaps),
      ),
      aiSummary: {
        focusNodeId: node.id,
        focusNodeType: node.type,
        requestedNodeId: requestedNodeId || null,
        usingSyncedSelection: !requestedNodeId,
        parentNodeIds: parentIds,
        childNodeIds: childIds,
        naturalLanguage: `Node "${node.id}" of type "${node.type}" has ${parentIds.length} parent nodes and ${childIds.length} child nodes.`,
      },
    });
  };
}
