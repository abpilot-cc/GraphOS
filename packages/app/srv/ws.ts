import fs from "fs";
import type { Server } from "socket.io";
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

export function registerSocketHandlers(io: Server, pluginManager: PluginManager) {
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    pluginManager.emitAppEvent("socket", { type: "socket", socket });

    socket.on("get-graph-list", () => {
      const list = listGraphs();
      console.log("Sending graph list:", list.length, "items");
      socket.emit("graph-list", list);
    });

    socket.on("join-graph", (graphId: string) => {
      const requestedGraphId = typeof graphId === "string" ? graphId.trim() : "";
      const resolvedGraphId =
        requestedGraphId && loadGraph(requestedGraphId)
          ? requestedGraphId
          : pickFallbackGraphId();

      if (!resolvedGraphId) {
        socket.emit("graph-error", { message: "No graph available" });
        return;
      }

      console.log(`Socket ${socket.id} joining graph: ${resolvedGraphId}`);
      setCurrentOpenGraphId(resolvedGraphId);
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
        pluginManager.emitAppEvent("open", { type: "open", data: graph });
      } else {
        console.warn(`Graph file not found: ${filePath}`);
      }
    });

    socket.on("create-graph", (name: string) => {
      console.log(`Creating graph: ${name}`);
      const id = `graph_${Date.now()}`;
      const newGraph: GraphData = { id, name, nodes: [], edges: [] };
      saveGraph(newGraph, { source: "ui.create-graph", summary: `create:${name}` });
      setCurrentOpenGraphId(id);
      io.emit("graph-list", listGraphs());
      io.to(id).emit("graph-history-updated", {
        graphId: id,
        history: listGraphHistory(getWorkingDir(), id),
      });
      socket.emit("graph-created", newGraph);
      pluginManager.emitAppEvent("open", { type: "open", data: newGraph });
    });

    socket.on("duplicate-graph", (id: string) => {
      const sourceGraph = loadGraph(id);
      if (!sourceGraph) {
        socket.emit("graph-error", { message: `Graph not found: ${id}` });
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

      io.emit("graph-list", listGraphs());
      io.to(nextId).emit("graph-history-updated", {
        graphId: nextId,
        history: listGraphHistory(getWorkingDir(), nextId),
      });
      socket.emit("graph-created", duplicatedGraph);
      pluginManager.emitAppEvent("open", { type: "open", data: duplicatedGraph });
    });

    socket.on("rename-graph", ({ id, name }: { id: string; name: string }) => {
      console.log(`Renaming graph ${id} to ${name}`);
      const filePath = getGraphFilePath(id);
      if (fs.existsSync(filePath)) {
        const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        graph.name = name;
        saveGraph(graph, { source: "ui.rename-graph", summary: `rename:${name}` });
        io.emit("graph-list", listGraphs());
        io.to(id).emit("graph-update", toRFGraph(graph));
        io.to(id).emit("graph-history-updated", {
          graphId: id,
          history: listGraphHistory(getWorkingDir(), id),
        });
      }
    });

    socket.on("delete-graph", (id: string) => {
      console.log(`Deleting graph: ${id}`);
      deleteGraphFile(id);
      graphSelectionState.delete(id);
      if (getCurrentOpenGraphId() === id) {
        pickFallbackGraphId();
      }
      io.emit("graph-list", listGraphs());
    });

    socket.on(
      "select-node",
      ({ graphId, nodeId }: { graphId: string; nodeId: string | null }) => {
        setSelectedNodeId(graphId, nodeId);
        socket.to(graphId).emit("graph-selection", { graphId, selectedNodeId: nodeId });
      },
    );

    socket.on(
      "sync-graph",
      ({ graphId, nodes, edges }: { graphId: string; nodes: RFNode[]; edges: RFEdge[] }) => {
        const filePath = getGraphFilePath(graphId);
        if (fs.existsSync(filePath)) {
          const graph: IGraph = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          graph.nodes = nodes.map(rfNodeToINode);
          graph.edges = edges.map(rfEdgeToIEdge);
          const selectionState = getGraphSelectionState(graphId);
          if (
            selectionState.selectedNodeId &&
            !graph.nodes.some((node) => node.id === selectionState.selectedNodeId)
          ) {
            setSelectedNodeId(graphId, null);
            io.to(graphId).emit("graph-selection", { graphId, selectedNodeId: null });
          }
          saveGraph(graph, { source: "ui.sync-graph", summary: "sync" });
          pluginManager.emitAppEvent("changed", { type: "changed", data: graph });
          io.to(graphId).emit("graph-history-updated", {
            graphId,
            history: listGraphHistory(getWorkingDir(), graphId),
          });
          socket.to(graphId).emit("graph-update", toRFGraph(graph));
        }
      },
    );

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
