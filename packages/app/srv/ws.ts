import fs from "fs";
import type { RawData, WebSocketServer } from "ws";
import type { IGraph, INode } from "graphos-core";
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

function getNodeDisplayName(node: INode | undefined) {
  if (!node) return "Unknown node";

  const rawName = node.properties?.name;
  if (typeof rawName === "string" && rawName.trim().length > 0) {
    return rawName.trim();
  }

  return `${node.type} (${node.id})`;
}

function describeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeSyncHistoryHint(value: unknown): { title?: string; summary?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;

  const hint = value as { title?: unknown; summary?: unknown };
  const title = typeof hint.title === "string" && hint.title.trim().length > 0
    ? hint.title.trim()
    : undefined;
  const summary = typeof hint.summary === "string" && hint.summary.trim().length > 0
    ? hint.summary.trim()
    : undefined;

  if (!title && !summary) return undefined;
  return { title, summary };
}

function getChangedPropertyKeys(previousNode: INode, nextNode: INode) {
  const previousProperties = previousNode.properties ?? {};
  const nextProperties = nextNode.properties ?? {};
  const keys = new Set([...Object.keys(previousProperties), ...Object.keys(nextProperties)]);

  return [...keys].filter((key) => {
    return JSON.stringify(previousProperties[key]) !== JSON.stringify(nextProperties[key]);
  });
}

function buildSyncHistoryDescription(previousGraph: IGraph, nextGraph: IGraph) {
  const previousNodes = new Map(previousGraph.nodes.map((node) => [node.id, node]));
  const nextNodes = new Map(nextGraph.nodes.map((node) => [node.id, node]));
  const previousEdges = new Set(previousGraph.edges.map(([source, target]) => `${source}->${target}`));
  const nextEdges = new Set(nextGraph.edges.map(([source, target]) => `${source}->${target}`));

  const addedNodes = nextGraph.nodes.filter((node) => !previousNodes.has(node.id));
  const removedNodes = previousGraph.nodes.filter((node) => !nextNodes.has(node.id));
  const movedNodes = nextGraph.nodes.filter((node) => {
    const previousNode = previousNodes.get(node.id);
    return !!previousNode && (
      previousNode.position[0] !== node.position[0] || previousNode.position[1] !== node.position[1]
    );
  });
  const renamedNodes = nextGraph.nodes.filter((node) => {
    const previousNode = previousNodes.get(node.id);
    const previousName = previousNode?.properties?.name;
    const nextName = node.properties?.name;
    return (
      !!previousNode &&
      typeof previousName === "string" &&
      typeof nextName === "string" &&
      previousName.trim() !== nextName.trim()
    );
  });
  const propertyUpdates = nextGraph.nodes.flatMap((node) => {
    const previousNode = previousNodes.get(node.id);
    if (!previousNode) return [];

    const changedKeys = getChangedPropertyKeys(previousNode, node);
    const nonNameKeys = changedKeys.filter((key) => key !== "name");
    if (nonNameKeys.length === 0) return [];

    return [{
      node,
      changedKeys: nonNameKeys,
    }];
  });

  const addedEdges = nextGraph.edges.filter(
    ([source, target]) => !previousEdges.has(`${source}->${target}`),
  );
  const removedEdges = previousGraph.edges.filter(
    ([source, target]) => !nextEdges.has(`${source}->${target}`),
  );

  const totalChanges = [
    addedNodes.length,
    removedNodes.length,
    movedNodes.length,
    renamedNodes.length,
    propertyUpdates.length,
    addedEdges.length,
    removedEdges.length,
  ].reduce((sum, count) => sum + count, 0);

  if (totalChanges === 1) {
    if (addedNodes.length === 1) {
      const node = addedNodes[0];
      return {
        title: `Added node: ${getNodeDisplayName(node)}`,
        summary: `add-node:${node.type}:${node.id}`,
      };
    }

    if (removedNodes.length === 1) {
      const node = removedNodes[0];
      return {
        title: `Deleted node: ${getNodeDisplayName(node)}`,
        summary: `delete-node:${node.type}:${node.id}`,
      };
    }

    if (movedNodes.length === 1) {
      const node = movedNodes[0];
      return {
        title: `Moved node: ${getNodeDisplayName(node)}`,
        summary: `move-node:${node.id}`,
      };
    }

    if (renamedNodes.length === 1) {
      const node = renamedNodes[0];
      const previousNode = previousNodes.get(node.id);
      return {
        title: `Renamed node: ${getNodeDisplayName(previousNode)} -> ${getNodeDisplayName(node)}`,
        summary: `rename-node:${node.id}`,
      };
    }

    if (propertyUpdates.length === 1) {
      const update = propertyUpdates[0];
      if (update.changedKeys.length === 1) {
        const key = update.changedKeys[0];
        return {
          title: `Updated property: ${getNodeDisplayName(update.node)}.${key}`,
          summary: `update-property:${update.node.id}:${key}`,
        };
      }

      return {
        title: `Updated ${update.changedKeys.length} properties: ${getNodeDisplayName(update.node)}`,
        summary: `update-properties:${update.node.id}:${update.changedKeys.join(",")}`,
      };
    }

    if (addedEdges.length === 1) {
      const [source, target] = addedEdges[0];
      return {
        title: `Connected: ${getNodeDisplayName(nextNodes.get(source))} -> ${getNodeDisplayName(nextNodes.get(target))}`,
        summary: `connect:${source}->${target}`,
      };
    }

    if (removedEdges.length === 1) {
      const [source, target] = removedEdges[0];
      return {
        title: `Disconnected: ${getNodeDisplayName(previousNodes.get(source))} -> ${getNodeDisplayName(previousNodes.get(target))}`,
        summary: `disconnect:${source}->${target}`,
      };
    }
  }

  const titleParts: string[] = [];
  const summaryParts: string[] = [];

  if (addedNodes.length > 0) {
    titleParts.push(`added ${describeCount(addedNodes.length, "node")}`);
    summaryParts.push(`added ${addedNodes.slice(0, 3).map((node) => getNodeDisplayName(node)).join(", ")}`);
  }
  if (removedNodes.length > 0) {
    titleParts.push(`deleted ${describeCount(removedNodes.length, "node")}`);
    summaryParts.push(`deleted ${removedNodes.slice(0, 3).map((node) => getNodeDisplayName(node)).join(", ")}`);
  }
  if (movedNodes.length > 0) {
    titleParts.push(`moved ${describeCount(movedNodes.length, "node")}`);
    summaryParts.push(`moved ${movedNodes.slice(0, 3).map((node) => getNodeDisplayName(node)).join(", ")}`);
  }
  if (renamedNodes.length > 0) {
    titleParts.push(`renamed ${describeCount(renamedNodes.length, "node")}`);
    summaryParts.push(`renamed ${renamedNodes.slice(0, 3).map((node) => getNodeDisplayName(node)).join(", ")}`);
  }
  if (propertyUpdates.length > 0) {
    titleParts.push(`updated ${describeCount(propertyUpdates.length, "node")}`);
    summaryParts.push(`updated ${propertyUpdates.slice(0, 3).map((update) => `${getNodeDisplayName(update.node)}.${update.changedKeys.join("/")}`).join(", ")}`);
  }
  if (addedEdges.length > 0) {
    titleParts.push(`connected ${describeCount(addedEdges.length, "edge")}`);
    summaryParts.push(`connected ${addedEdges.slice(0, 3).map(([source, target]) => `${getNodeDisplayName(nextNodes.get(source))} -> ${getNodeDisplayName(nextNodes.get(target))}`).join(", ")}`);
  }
  if (removedEdges.length > 0) {
    titleParts.push(`disconnected ${describeCount(removedEdges.length, "edge")}`);
    summaryParts.push(`disconnected ${removedEdges.slice(0, 3).map(([source, target]) => `${getNodeDisplayName(previousNodes.get(source))} -> ${getNodeDisplayName(previousNodes.get(target))}`).join(", ")}`);
  }

  return {
    title: titleParts.length > 0 ? `Canvas updated: ${titleParts.join(", ")}` : "Canvas changes synced",
    summary: summaryParts.length > 0 ? summaryParts.join("; ") : "sync",
  };
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
  saveGraph(newGraph, {
    source: "ui.create-graph",
    title: `Created graph: ${graphName}`,
    summary: `create:${graphName}`,
  });
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
    title: `Duplicated from: ${sourceGraph.name}`,
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
  const previousName = graph.name;
  graph.name = name;
  saveGraph(graph, {
    source: "ui.rename-graph",
    title: `Title updated: ${previousName} -> ${name}`,
    summary: `rename:${name}`,
  });

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
  const data = payload as {
    graphId?: unknown;
    nodes?: unknown;
    edges?: unknown;
    historyHint?: unknown;
  };
  const graphId = asString(data?.graphId);
  const nodes = (Array.isArray(data?.nodes) ? data.nodes : []) as RFNode[];
  const edges = (Array.isArray(data?.edges) ? data.edges : []) as RFEdge[];
  const historyHint = normalizeSyncHistoryHint(data?.historyHint);

  const filePath = getGraphFilePath(graphId);
  if (!fs.existsSync(filePath)) return;

  const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const previousGraph = JSON.parse(JSON.stringify(graph)) as IGraph;
  graph.nodes = nodes.map(rfNodeToINode);
  graph.edges = edges.map(rfEdgeToIEdge);
  const historyDescription = buildSyncHistoryDescription(previousGraph, graph);

  const selectionState = getGraphSelectionState(graphId);
  if (
    selectionState.selectedNodeId &&
    !graph.nodes.some((node) => node.id === selectionState.selectedNodeId)
  ) {
    setSelectedNodeId(graphId, null);
    realtime.broadcastGraph(graphId, "graph-selection", { graphId, selectedNodeId: null });
  }

  saveGraph(graph, {
    source: "ui.sync-graph",
    title: historyHint?.title ?? historyDescription.title,
    summary: historyHint?.summary ?? historyDescription.summary,
  });
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
