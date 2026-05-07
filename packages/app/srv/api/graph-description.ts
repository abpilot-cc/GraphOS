import type { Request, Response } from "express";
import type { PluginManager } from "../plugin-manager.ts";
import {
  buildNodeRelationMaps,
  describeNodeForAI,
  getGraphSelectionState,
  loadGraph,
  resolveGraphId,
} from "../core.ts";

export function handleGetGraphDescription(pluginManager: PluginManager) {
  return (req: Request, res: Response) => {
    const graphId = resolveGraphId(req.query.graphId);
    const graph = loadGraph(graphId);

    if (!graph) {
      res.status(404).json({ error: `Graph not found: ${graphId}` });
      return;
    }

    const nodeTypesByType = new Map(pluginManager.getNodeTypes().map((nt) => [nt.type, nt]));
    const relationMaps = buildNodeRelationMaps(graph);
    const roots = graph.nodes
      .filter((node) => (relationMaps.parentsByNodeId.get(node.id) ?? []).length === 0)
      .map((node) => node.id);
    const leaves = graph.nodes
      .filter((node) => (relationMaps.childrenByNodeId.get(node.id) ?? []).length === 0)
      .map((node) => node.id);

    res.json({
      graph: {
        id: graph.id,
        name: graph.name,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        rootNodeIds: roots,
        leafNodeIds: leaves,
        selectedNodeId: getGraphSelectionState(graph.id).selectedNodeId,
      },
      nodes: graph.nodes.map((node) =>
        describeNodeForAI(node, graph, nodeTypesByType, relationMaps),
      ),
      edges: graph.edges.map(([source, target], index) => ({
        id: `edge_${index}_${source}_${target}`,
        source,
        target,
      })),
      adjacency: graph.nodes.map((node) => ({
        nodeId: node.id,
        parentIds: relationMaps.parentsByNodeId.get(node.id) ?? [],
        childIds: relationMaps.childrenByNodeId.get(node.id) ?? [],
      })),
      aiSummary: `Graph "${graph.name}" contains ${graph.nodes.length} nodes and ${graph.edges.length} edges. Root nodes: ${roots.join(", ") || "none"}. Leaf nodes: ${leaves.join(", ") || "none"}.`,
    });
  };
}
