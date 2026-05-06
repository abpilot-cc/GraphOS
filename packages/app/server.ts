import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { z } from "zod";
import fs from "fs";
import { PluginManager } from "./srv/plugin-manager.ts";
import { validateNode } from "graphos-core";
import type { IGraph, INode, IEdge } from "graphos-core";

// --- IGraph <-> ReactFlow conversion ---

type RFNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
};

type RFEdge = {
  id: string;
  source: string;
  target: string;
  [k: string]: any;
};

function rfNodeToINode(n: RFNode): INode {
  return {
    id: n.id,
    type: n.type ?? 'unknown',
    properties: n.data?.properties ?? {},
    position: [n.position?.x ?? 0, n.position?.y ?? 0],
  };
}

function iNodeToRFNode(n: INode & { position: any; data?: any }): RFNode {
  // Support both IGraph format [x, y] and legacy ReactFlow format {x, y}
  let x: number, y: number;
  if (Array.isArray(n.position)) {
    x = n.position[0] ?? 0;
    y = n.position[1] ?? 0;
  } else if (n.position && typeof n.position === 'object') {
    x = (n.position as any).x ?? 0;
    y = (n.position as any).y ?? 0;
  } else {
    x = 0; y = 0;
  }
  // Support both IGraph properties and legacy data.properties
  const properties = n.properties && Object.keys(n.properties).length > 0
    ? n.properties
    : (n.data?.properties ?? {});
  return {
    id: n.id,
    type: n.type,
    position: { x, y },
    data: { type: n.type, properties },
  };
}

function rfEdgeToIEdge(e: RFEdge): IEdge {
  return [e.source, e.target];
}

function iEdgeToRFEdge(e: IEdge, idx: number): RFEdge {
  return { id: `edge_${idx}_${e[0]}_${e[1]}`, source: e[0], target: e[1] };
}

function toRFGraph(g: IGraph): { id: string; name: string; nodes: RFNode[]; edges: RFEdge[] } {
  return {
    id: g.id,
    name: g.name,
    nodes: g.nodes.map(iNodeToRFNode),
    edges: g.edges.map(iEdgeToRFEdge),
  };
}

// --- Types & Schemas ---

const OperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("CREATE_NODE"),
    metadata: z.object({
      id: z.string(),
      type: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.record(z.string(), z.any()).optional(),
    }),
  }),
  z.object({
    op: z.literal("UPDATE_NODE"),
    metadata: z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    }),
  }),
  z.object({
    op: z.literal("DELETE_NODE"),
    metadata: z.object({
      id: z.string(),
    }),
  }),
  z.object({
    op: z.literal("CONNECT"),
    metadata: z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
    }),
  }),
  z.object({
    op: z.literal("DISCONNECT"),
    metadata: z.object({
      id: z.string(),
    }),
  }),
]);

const TransactionSchema = z.object({
  ops: z.array(OperationSchema),
});

type GraphData = IGraph;
type GraphSelectionState = {
  selectedNodeId: string | null;
};

// --- Filesystem Helpers ---

const GRAPH_EXT = ".graph.json";
const WORKING_DIR = process.cwd();

function getGraphFilePath(id: string) {
  return path.join(WORKING_DIR, `${id}${GRAPH_EXT}`);
}

function listGraphs(): { id: string; name: string }[] {
  try {
    const files = fs.readdirSync(WORKING_DIR);
    return files
      .filter((f) => f.endsWith(GRAPH_EXT))
      .map((f) => {
        const id = f.replace(GRAPH_EXT, "");
        const content = JSON.parse(fs.readFileSync(path.join(WORKING_DIR, f), "utf-8"));
        return { id, name: content.name || id };
      });
  } catch (e) {
    console.error("Error listing graphs:", e);
    return [];
  }
}

function saveGraph(graph: GraphData) {
  const filePath = getGraphFilePath(graph.id);
  fs.writeFileSync(filePath, JSON.stringify(graph, null, 2));
}

function deleteGraphFile(id: string) {
  const filePath = getGraphFilePath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function loadGraph(id: string): GraphData | undefined {
  const filePath = getGraphFilePath(id);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as GraphData;
}

function buildNodeRelationMaps(graph: GraphData) {
  const parentsByNodeId = new Map<string, string[]>();
  const childrenByNodeId = new Map<string, string[]>();

  for (const node of graph.nodes) {
    parentsByNodeId.set(node.id, []);
    childrenByNodeId.set(node.id, []);
  }

  for (const [source, target] of graph.edges) {
    childrenByNodeId.get(source)?.push(target);
    parentsByNodeId.get(target)?.push(source);
  }

  return { parentsByNodeId, childrenByNodeId };
}

function describeNodeForAI(
  node: INode,
  graph: GraphData,
  nodeTypesByType: Map<string, ReturnType<PluginManager["getNodeTypes"]>[number]>,
  relationMaps: ReturnType<typeof buildNodeRelationMaps>,
) {
  const nodeType = nodeTypesByType.get(node.type);
  const parentIds = relationMaps.parentsByNodeId.get(node.id) ?? [];
  const childIds = relationMaps.childrenByNodeId.get(node.id) ?? [];

  return {
    id: node.id,
    type: node.type,
    description: nodeType?.description ?? null,
    position: {
      x: node.position[0] ?? 0,
      y: node.position[1] ?? 0,
    },
    properties: node.properties,
    propertySchema: nodeType?.properties ?? {},
    allowedParents: nodeType?.inTypes ?? [],
    allowedChildren: nodeType?.outTypes ?? [],
    parentIds,
    childIds,
    parentCount: parentIds.length,
    childCount: childIds.length,
    isRoot: parentIds.length === 0,
    isLeaf: childIds.length === 0,
    connectedEdgeCount: graph.edges.filter(([source, target]) => source === node.id || target === node.id).length,
  };
}

const graphSelectionState = new Map<string, GraphSelectionState>();
let currentOpenGraphId: string | null = null;

function getGraphSelectionState(graphId: string): GraphSelectionState {
  const existing = graphSelectionState.get(graphId);
  if (existing) {
    return existing;
  }

  const created: GraphSelectionState = { selectedNodeId: null };
  graphSelectionState.set(graphId, created);
  return created;
}

function setSelectedNodeId(graphId: string, selectedNodeId: string | null) {
  graphSelectionState.set(graphId, { selectedNodeId });
}

function pickFallbackGraphId(): string {
  if (currentOpenGraphId && loadGraph(currentOpenGraphId)) {
    return currentOpenGraphId;
  }

  const available = listGraphs();
  if (available.length > 0) {
    currentOpenGraphId = available[0].id;
    return currentOpenGraphId;
  }

  currentOpenGraphId = null;
  return "";
}

function resolveGraphId(graphIdQuery: unknown): string {
  const requestedGraphId = typeof graphIdQuery === "string" ? graphIdQuery.trim() : "";
  if (requestedGraphId && loadGraph(requestedGraphId)) {
    return requestedGraphId;
  }

  return pickFallbackGraphId();
}

// Ensure at least one graph exists
if (listGraphs().length === 0) {
  saveGraph({
    id: "main",
    name: "Main Pipeline",
    nodes: [
      {
        id: "welcome-node",
        type: "text",
        position: [250, 5],
        properties: { name: "Welcome to GraphOS" },
      },
    ],
    edges: [],
  });
}

currentOpenGraphId = listGraphs()[0]?.id ?? null;

// --- Server Setup ---

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- Plugin Manager ---
  const pluginsDir = path.join(WORKING_DIR, "plugins");
  const pluginManager = new PluginManager(pluginsDir);
  await pluginManager.loadAll();
  pluginManager.watchPlugins();

  // Broadcast updated node types to all connected clients on hot reload
  pluginManager.on("node-types:changed", (nodeTypes) => {
    io.emit("node-types:updated", nodeTypes);
  });

  // --- API Routes ---

  app.get("/api/node-types", (_req, res) => {
    res.json(pluginManager.getNodeTypes());
  });

  app.get("/api/plugins", (_req, res) => {
    res.json(
      pluginManager.listPlugins().map(({ name, status, error, nodeTypes }) => ({
        name,
        status,
        error,
        nodeTypeCount: nodeTypes.length,
      })),
    );
  });

  app.get("/api/graph/description", (req, res) => {
    const graphId = resolveGraphId(req.query.graphId);
    const graph = loadGraph(graphId);

    if (!graph) {
      res.status(404).json({ error: `Graph not found: ${graphId}` });
      return;
    }

    const nodeTypesByType = new Map(pluginManager.getNodeTypes().map((nodeType) => [nodeType.type, nodeType]));
    const relationMaps = buildNodeRelationMaps(graph);
    const roots = graph.nodes.filter((node) => (relationMaps.parentsByNodeId.get(node.id) ?? []).length === 0).map((node) => node.id);
    const leaves = graph.nodes.filter((node) => (relationMaps.childrenByNodeId.get(node.id) ?? []).length === 0).map((node) => node.id);

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
      nodes: graph.nodes.map((node) => describeNodeForAI(node, graph, nodeTypesByType, relationMaps)),
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
      aiSummary: `Graph \"${graph.name}\" contains ${graph.nodes.length} nodes and ${graph.edges.length} edges. Root nodes: ${roots.join(", ") || "none"}. Leaf nodes: ${leaves.join(", ") || "none"}.`,
    });
  });

  app.get("/api/graph/node", (req, res) => {
    const graphId = resolveGraphId(req.query.graphId);
    const requestedNodeId = typeof req.query.nodeId === "string" ? req.query.nodeId.trim() : "";

    const currentSelection = getGraphSelectionState(graphId).selectedNodeId;
    const nodeId = requestedNodeId || currentSelection || "";

    const graph = loadGraph(graphId);
    if (!graph) {
      res.status(404).json({ error: `Graph not found: ${graphId}` });
      return;
    }

    if (!nodeId) {
      res.status(400).json({ error: "Missing required query parameter: nodeId, and no selected node is currently synced for this graph" });
      return;
    }

    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      res.status(404).json({ error: `Node not found: ${nodeId}` });
      return;
    }

    const nodeTypesByType = new Map(pluginManager.getNodeTypes().map((nodeType) => [nodeType.type, nodeType]));
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
      parentNodes: parentNodes.map((candidate) => describeNodeForAI(candidate, graph, nodeTypesByType, relationMaps)),
      childNodes: childNodes.map((candidate) => describeNodeForAI(candidate, graph, nodeTypesByType, relationMaps)),
      aiSummary: {
        focusNodeId: node.id,
        focusNodeType: node.type,
        requestedNodeId: requestedNodeId || null,
        usingSyncedSelection: !requestedNodeId,
        parentNodeIds: parentIds,
        childNodeIds: childIds,
        naturalLanguage: `Node \"${node.id}\" of type \"${node.type}\" has ${parentIds.length} parent nodes and ${childIds.length} child nodes.`,
      },
    });
  });

  app.post("/api/graph/apply", (req, res) => {
    const graphId = resolveGraphId(req.body?.graphId);
    const graph = loadGraph(graphId);

    if (!graph) {
      res.status(404).json({ error: `Graph not found: ${graphId}` });
      return;
    }

    const parsed = TransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
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
              properties: data.properties !== undefined ? { ...node.properties, ...data.properties } : node.properties,
              position: data.position !== undefined
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
      saveGraph(graph);
      io.to(graphId).emit("graph-update", toRFGraph(graph));
      pluginManager.emitAppEvent("changed", { type: "changed", data: graph });
    }

    const relationMaps = buildNodeRelationMaps(graph);
    const roots = graph.nodes.filter((n) => (relationMaps.parentsByNodeId.get(n.id) ?? []).length === 0).map((n) => n.id);
    const leaves = graph.nodes.filter((n) => (relationMaps.childrenByNodeId.get(n.id) ?? []).length === 0).map((n) => n.id);

    res.json({
      success: errors.length === 0,
      appliedCount: applied.length,
      errorCount: errors.length,
      applied,
      errors,
      graph: {
        id: graph.id,
        name: graph.name,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        rootNodeIds: roots,
        leafNodeIds: leaves,
        selectedNodeId: getGraphSelectionState(graphId).selectedNodeId,
      },
      nodes: graph.nodes.map((n) => describeNodeForAI(n, graph, nodeTypesByType, relationMaps)),
      edges: graph.edges.map(([source, target], index) => ({
        id: `edge_${index}_${source}_${target}`,
        source,
        target,
      })),
      aiSummary: `Applied ${applied.length}/${ops.length} operations to graph "${graph.name}". ${errors.length > 0 ? `${errors.length} operation(s) failed.` : "All operations succeeded."} Graph now has ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
    });
  });

  // --- Socket.IO Handling ---

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("get-graph-list", () => {
      const list = listGraphs();
      console.log("Sending graph list:", list.length, "items");
      socket.emit("graph-list", list);
    });

    socket.on("join-graph", (graphId: string) => {
      const requestedGraphId = typeof graphId === "string" ? graphId.trim() : "";
      const resolvedGraphId = requestedGraphId && loadGraph(requestedGraphId)
        ? requestedGraphId
        : pickFallbackGraphId();

      if (!resolvedGraphId) {
        socket.emit("graph-error", { message: "No graph available" });
        return;
      }

      console.log(`Socket ${socket.id} joining graph: ${resolvedGraphId}`);
      currentOpenGraphId = resolvedGraphId;
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(resolvedGraphId);
      socket.emit("graph-selection", {
        graphId: resolvedGraphId,
        selectedNodeId: getGraphSelectionState(resolvedGraphId).selectedNodeId,
      });
      
      const filePath = getGraphFilePath(resolvedGraphId);
      if (fs.existsSync(filePath)) {
        const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        socket.emit("graph-initial", toRFGraph(graph));
      } else {
        console.warn(`Graph file not found: ${filePath}`);
      }
    });

    socket.on("create-graph", (name: string) => {
      console.log(`Creating graph: ${name}`);
      const id = `graph_${Date.now()}`;
      const newGraph: GraphData = { id, name, nodes: [], edges: [] };
      saveGraph(newGraph);
      currentOpenGraphId = id;
      io.emit("graph-list", listGraphs());
      socket.emit("graph-created", newGraph);
    });

    socket.on("rename-graph", ({ id, name }: { id: string; name: string }) => {
      console.log(`Renaming graph ${id} to ${name}`);
      const filePath = getGraphFilePath(id);
      if (fs.existsSync(filePath)) {
        const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        graph.name = name;
        saveGraph(graph);
        io.emit("graph-list", listGraphs());
        io.to(id).emit("graph-update", toRFGraph(graph));
      }
    });

    socket.on("delete-graph", (id: string) => {
      console.log(`Deleting graph: ${id}`);
      deleteGraphFile(id);
      graphSelectionState.delete(id);
      if (currentOpenGraphId === id) {
        currentOpenGraphId = pickFallbackGraphId();
      }
      io.emit("graph-list", listGraphs());
    });

    socket.on("select-node", ({ graphId, nodeId }: { graphId: string; nodeId: string | null }) => {
      setSelectedNodeId(graphId, nodeId);
      socket.to(graphId).emit("graph-selection", { graphId, selectedNodeId: nodeId });
    });

    socket.on("sync-graph", ({ graphId, nodes, edges }: { graphId: string; nodes: RFNode[]; edges: RFEdge[] }) => {
      const filePath = getGraphFilePath(graphId);
      if (fs.existsSync(filePath)) {
        const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        graph.nodes = nodes.map(rfNodeToINode);
        graph.edges = edges.map(rfEdgeToIEdge);
        const selectionState = getGraphSelectionState(graphId);
        if (selectionState.selectedNodeId && !graph.nodes.some((node) => node.id === selectionState.selectedNodeId)) {
          setSelectedNodeId(graphId, null);
          io.to(graphId).emit("graph-selection", { graphId, selectedNodeId: null });
        }
        saveGraph(graph);
        pluginManager.emitAppEvent("changed", { type: "changed", data: graph });
        socket.to(graphId).emit("graph-update", toRFGraph(graph));
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  // --- Vite Integration ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
