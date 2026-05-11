import type { Request, Response } from "express";
import type { PluginManager } from "../plugin-manager.ts";
import type { RealtimeServer } from "../realtime.ts";
import {
  getGraphSelectionState,
  getWorkingDir,
  listGraphs,
  loadGraph,
  resolveGraphId,
  saveGraph,
  setSelectedNodeId,
  toRFGraph,
} from "../core.ts";
import { getGraphHistorySnapshot, listGraphHistory } from "../history.ts";

export function handleGetGraphHistory() {
  return (req: Request, res: Response) => {
    const graphId = resolveGraphId(req.query?.graphId);
    const graph = loadGraph(graphId);

    if (!graph) {
      res.status(404).json({
        success: false,
        message: `Graph not found: ${graphId}`,
      });
      return;
    }

    res.json({
      success: true,
      graphId,
      history: listGraphHistory(getWorkingDir(), graphId),
    });
  };
}

export function handlePostGraphHistoryRestore(realtime: RealtimeServer, pluginManager: PluginManager) {
  return (req: Request, res: Response) => {
    const graphId = resolveGraphId(req.body?.graphId);
    const recordId = typeof req.body?.recordId === "string" ? req.body.recordId.trim() : "";

    if (!recordId) {
      res.status(400).json({
        success: false,
        message: "recordId is required",
      });
      return;
    }

    const snapshot = getGraphHistorySnapshot(getWorkingDir(), graphId, recordId);
    if (!snapshot) {
      res.status(404).json({
        success: false,
        message: `History record not found: ${recordId}`,
      });
      return;
    }

    snapshot.id = graphId;
    saveGraph(snapshot, {
      source: "history.restore",
      summary: `restore:${recordId}`,
      skipHistory: true,
    });

    const selectionState = getGraphSelectionState(graphId);
    if (
      selectionState.selectedNodeId &&
      !snapshot.nodes.some((node) => node.id === selectionState.selectedNodeId)
    ) {
      setSelectedNodeId(graphId, null);
      realtime.broadcastGraph(graphId, "graph-selection", { graphId, selectedNodeId: null });
    }

    const rfGraph = toRFGraph(snapshot);
    const history = listGraphHistory(getWorkingDir(), graphId);
    realtime.broadcastGraph(graphId, "graph-update", rfGraph);
    realtime.broadcastGraph(graphId, "graph-history-updated", { graphId, history });
    realtime.broadcastAll("graph-list", listGraphs());
    pluginManager.emitAppEvent("changed", { type: "changed", data: snapshot });

    res.json({
      success: true,
      graphId,
      graph: rfGraph,
      history,
    });
  };
}
