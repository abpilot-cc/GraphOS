import fs from "fs";
import type { RawData, WebSocketServer } from "ws";
import type { IGraph } from "graphos-core";
import type { PluginManager } from "./plugin-manager.ts";
import {
  getCurrentOpenGraphId,
  getGraphFilePath,
  getGraphSelectionState,
  getWorkingDir,
  graphSelectionState,
  listGraphs,
  loadGraph,
  pickFallbackGraphId,
  saveGraph,
  deleteGraphFile,
  setCurrentOpenGraphId,
  setSelectedNodeId,
  toRFGraph,
  rfNodeToINode,
  rfEdgeToIEdge,
  type RFNode,
  type RFEdge,
  type GraphData,
} from "./core.ts";
import { listGraphHistory } from "./history.ts";
import {
  createRealtimeServer,
  type RealtimeClient,
  type RealtimeEnvelope,
  type RealtimeServer,
} from "./realtime.ts";

function buildDuplicatedGraphName(sourceName: string) {
  const existingNames = new Set(listGraphs().map((graph) => graph.name));
  const baseName = sourceName.trim().length > 0 ? sourceName.trim() : "Untitled Graph";
  let candidate = `${baseName} Copy`;
  let suffix = 2;

  while (existingNames.has(candidate)) {
    candidate = `${baseName} Copy ${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function sendGraphList(realtime: RealtimeServer, client: RealtimeClient) {
  const list = listGraphs();
  console.log("Sending graph list:", list.length, "items");
  realtime.sendToClient(client, "graph-list", list);
}

function handleJoinGraph(realtime: RealtimeServer, client: RealtimeClient, graphId: unknown, pluginManager: PluginManager) {
  const requestedGraphId = asString(graphId).trim();
  const resolvedGraphId =
    requestedGraphId && loadGraph(requestedGraphId)
      ? requestedGraphId
      : pickFallbackGraphId();

  if (!resolvedGraphId) {
    realtime.sendToClient(client, "graph-error", { message: "No graph available" });
    return;
  }

  console.log(`Socket ${client.id} joining graph: ${resolvedGraphId}`);
  setCurrentOpenGraphId(resolvedGraphId);
  realtime.setClientGraph(client.id, resolvedGraphId);
  realtime.sendToClient(client, "graph-selection", {
    graphId: resolvedGraphId,
    selectedNodeId: getGraphSelectionState(resolvedGraphId).selectedNodeId,
  });

  const filePath = getGraphFilePath(resolvedGraphId);
  if (fs.existsSync(filePath)) {
    const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    realtime.sendToClient(client, "graph-initial", toRFGraph(graph));
    pluginManager.emitAppEvent("open", { type: "open", data: graph });
  } else {
    console.warn(`Graph file not found: ${filePath}`);
  }
}

function handleCreateGraph(realtime: RealtimeServer, client: RealtimeClient, name: unknown, pluginManager: PluginManager) {
  const graphName = asString(name) || "Untitled Graph";
  console.log(`Creating graph: ${graphName}`);
  const id = `graph_${Date.now()}`;
  const newGraph: GraphData = { id, name: graphName, nodes: [], edges: [] };
  saveGraph(newGraph, { source: "ui.create-graph", summary: `create:${graphName}` });
  setCurrentOpenGraphId(id);
  realtime.setClientGraph(client.id, id);

  realtime.broadcastAll("graph-list", listGraphs());
  realtime.broadcastGraph(id, "graph-history-updated", {
    graphId: id,
    history: listGraphHistory(getWorkingDir(), id),
  });
  realtime.sendToClient(client, "graph-created", newGraph);
  pluginManager.emitAppEvent("open", { type: "open", data: newGraph });
}

function handleDuplicateGraph(realtime: RealtimeServer, client: RealtimeClient, id: unknown, pluginManager: PluginManager) {
  const sourceGraphId = asString(id);
  const sourceGraph = loadGraph(sourceGraphId);
  if (!sourceGraph) {
    realtime.sendToClient(client, "graph-error", { message: `Graph not found: ${sourceGraphId}` });
    return;
  }

  const nextId = `graph_${Date.now()}`;
  const duplicatedGraph: GraphData = {
    ...sourceGraph,
    id: nextId,
    name: buildDuplicatedGraphName(sourceGraph.name),
    nodes: sourceGraph.nodes.map((node) => ({
      ...node,
      properties: { ...(node.properties ?? {}) },
      position: [...node.position] as [number, number],
    })),
    edges: sourceGraph.edges.map((edge) => [...edge] as [string, string]),
  };

  saveGraph(duplicatedGraph, {
    source: "ui.duplicate-graph",
    summary: `duplicate:${sourceGraph.id}`,
  });
  setCurrentOpenGraphId(nextId);
  realtime.setClientGraph(client.id, nextId);

  realtime.broadcastAll("graph-list", listGraphs());
  realtime.broadcastGraph(nextId, "graph-history-updated", {
    graphId: nextId,
    history: listGraphHistory(getWorkingDir(), nextId),
  });
  realtime.sendToClient(client, "graph-created", duplicatedGraph);
  pluginManager.emitAppEvent("open", { type: "open", data: duplicatedGraph });
}

function handleRenameGraph(realtime: RealtimeServer, payload: unknown) {
  const data = payload as { id?: unknown; name?: unknown };
  const id = asString(data?.id);
  const name = asString(data?.name);
  console.log(`Renaming graph ${id} to ${name}`);

  const filePath = getGraphFilePath(id);
  if (!fs.existsSync(filePath)) return;

  const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  graph.name = name;
  saveGraph(graph, { source: "ui.rename-graph", summary: `rename:${name}` });

  realtime.broadcastAll("graph-list", listGraphs());
  realtime.broadcastGraph(id, "graph-update", toRFGraph(graph));
  realtime.broadcastGraph(id, "graph-history-updated", {
    graphId: id,
    history: listGraphHistory(getWorkingDir(), id),
  });
}

function handleDeleteGraph(realtime: RealtimeServer, id: unknown) {
  const graphId = asString(id);
  console.log(`Deleting graph: ${graphId}`);
  deleteGraphFile(graphId);
  graphSelectionState.delete(graphId);
  if (getCurrentOpenGraphId() === graphId) {
    pickFallbackGraphId();
  }
  realtime.broadcastAll("graph-list", listGraphs());
}

function handleSelectNode(realtime: RealtimeServer, client: RealtimeClient, payload: unknown) {
  const data = payload as { graphId?: unknown; nodeId?: unknown };
  const graphId = asString(data?.graphId);
  const nodeId = asNullableString(data?.nodeId);

  setSelectedNodeId(graphId, nodeId);
  realtime.broadcastGraphExcept(graphId, client.id, "graph-selection", {
    graphId,
    selectedNodeId: nodeId,
  });
}

function handleSyncGraph(realtime: RealtimeServer, client: RealtimeClient, payload: unknown, pluginManager: PluginManager) {
  const data = payload as { graphId?: unknown; nodes?: unknown; edges?: unknown };
  const graphId = asString(data?.graphId);
  const nodes = (Array.isArray(data?.nodes) ? data.nodes : []) as RFNode[];
  const edges = (Array.isArray(data?.edges) ? data.edges : []) as RFEdge[];

  const filePath = getGraphFilePath(graphId);
  if (!fs.existsSync(filePath)) return;

  const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  graph.nodes = nodes.map(rfNodeToINode);
  graph.edges = edges.map(rfEdgeToIEdge);

  const selectionState = getGraphSelectionState(graphId);
  if (
    selectionState.selectedNodeId &&
    !graph.nodes.some((node) => node.id === selectionState.selectedNodeId)
  ) {
    setSelectedNodeId(graphId, null);
    realtime.broadcastGraph(graphId, "graph-selection", { graphId, selectedNodeId: null });
  }

  saveGraph(graph, { source: "ui.sync-graph", summary: "sync" });
  pluginManager.emitAppEvent("changed", { type: "changed", data: graph });
  realtime.broadcastGraph(graphId, "graph-history-updated", {
    graphId,
    history: listGraphHistory(getWorkingDir(), graphId),
  });
  realtime.broadcastGraphExcept(graphId, client.id, "graph-update", toRFGraph(graph));
}

function parseEnvelope(raw: RawData): RealtimeEnvelope | null {
  try {
    const asString = (() => {
      if (typeof raw === "string") return raw;
      if (Array.isArray(raw)) return Buffer.concat(raw).toString();
      if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw)).toString();
      return raw.toString();
    })();
    const parsed = JSON.parse(asString) as RealtimeEnvelope;
    if (!parsed || typeof parsed.type !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function registerSocketHandlers(wss: WebSocketServer, pluginManager: PluginManager) {
  const realtime = createRealtimeServer();

  wss.on("connection", (socket) => {
    const client = realtime.registerClient(socket);
    console.log("Client connected:", client.id);

    pluginManager.emitAppEvent("socket", { type: "socket", socket });

    socket.on("message", (raw) => {
      const envelope = parseEnvelope(raw);
      if (!envelope) return;

      switch (envelope.type) {
        case "get-graph-list":
          sendGraphList(realtime, client);
          break;
        case "join-graph":
          handleJoinGraph(realtime, client, envelope.payload, pluginManager);
          break;
        case "create-graph":
          handleCreateGraph(realtime, client, envelope.payload, pluginManager);
          break;
        case "duplicate-graph":
          handleDuplicateGraph(realtime, client, envelope.payload, pluginManager);
          break;
        case "rename-graph":
          handleRenameGraph(realtime, envelope.payload);
          break;
        case "delete-graph":
          handleDeleteGraph(realtime, envelope.payload);
          break;
        case "select-node":
          handleSelectNode(realtime, client, envelope.payload);
          break;
        case "sync-graph":
          handleSyncGraph(realtime, client, envelope.payload, pluginManager);
          break;
        default:
          break;
      }
    });

    socket.on("close", () => {
      realtime.unregisterClient(client.id);
      console.log("Client disconnected:", client.id);
    });
  });

  return realtime;
}
