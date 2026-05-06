import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { z } from "zod";
import fs from "fs";
import { PluginManager } from "./srv/plugin-manager.ts";
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

  // --- Socket.IO Handling ---

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("get-graph-list", () => {
      const list = listGraphs();
      console.log("Sending graph list:", list.length, "items");
      socket.emit("graph-list", list);
    });

    socket.on("join-graph", (graphId: string) => {
      console.log(`Socket ${socket.id} joining graph: ${graphId}`);
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(graphId);
      
      const filePath = getGraphFilePath(graphId);
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
      io.emit("graph-list", listGraphs());
    });

    socket.on("sync-graph", ({ graphId, nodes, edges }: { graphId: string; nodes: RFNode[]; edges: RFEdge[] }) => {
      const filePath = getGraphFilePath(graphId);
      if (fs.existsSync(filePath)) {
        const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        graph.nodes = nodes.map(rfNodeToINode);
        graph.edges = edges.map(rfEdgeToIEdge);
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
