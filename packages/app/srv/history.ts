import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { IGraph } from "graphos-core";

const HISTORY_DIR_NAME = "graphos-history";
const MAX_HISTORY = 20;

export type GraphHistoryRecord = {
  id: string;
  graphId: string;
  graphName: string;
  createdAt: string;
  source: string;
  title: string;
  summary: string;
  snapshot: IGraph;
};

export type GraphHistoryEntry = Omit<GraphHistoryRecord, "snapshot">;

export type AppendGraphHistoryOptions = {
  title?: string;
  summary?: string;
};

function normalizeHistoryTitle(
  source: string,
  providedTitle: string | undefined,
  previousSnapshot: IGraph | undefined,
  nextSnapshot: IGraph,
): string {
  if (providedTitle && providedTitle.trim().length > 0) {
    return providedTitle.trim();
  }

  const previousName = (previousSnapshot?.name ?? "").trim();
  const nextName = (nextSnapshot.name ?? "").trim();
  if (previousSnapshot && previousName !== nextName) {
    const from = previousName || "(untitled)";
    const to = nextName || "(untitled)";
    return `Title updated: ${from} -> ${to}`;
  }

  if (source === "ui.create-graph") {
    return `Created graph: ${nextName || nextSnapshot.id}`;
  }

  if (source === "ui.duplicate-graph") {
    return `Duplicated graph: ${nextName || nextSnapshot.id}`;
  }

  if (source === "api.apply") {
    return "Applied graph operations";
  }

  if (source === "ui.sync-graph") {
    return "Canvas changes synced";
  }

  return source;
}

function normalizeHistorySummary(source: string, summary: string | undefined): string {
  if (summary && summary.trim().length > 0) {
    return summary.trim();
  }
  return source;
}

function toWorkingDirKey(workingDir: string): string {
  return crypto.createHash("sha1").update(path.resolve(workingDir)).digest("hex");
}

function getHistoryRootDir(workingDir: string): string {
  return path.join(os.tmpdir(), HISTORY_DIR_NAME, toWorkingDirKey(workingDir));
}

function getGraphHistoryFilePath(workingDir: string, graphId: string): string {
  return path.join(getHistoryRootDir(workingDir), `${graphId}.history.json`);
}

function ensureHistoryDir(workingDir: string) {
  fs.mkdirSync(getHistoryRootDir(workingDir), { recursive: true });
}

function readRecords(workingDir: string, graphId: string): GraphHistoryRecord[] {
  const filePath = getGraphHistoryFilePath(workingDir, graphId);
  if (!fs.existsSync(filePath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as GraphHistoryRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.id === "string" && typeof r.graphId === "string")
      .map((r) => {
        const summary = normalizeHistorySummary(
          typeof r.source === "string" ? r.source : "unknown",
          typeof r.summary === "string" ? r.summary : undefined,
        );
        const title =
          typeof r.title === "string" && r.title.trim().length > 0
            ? r.title.trim()
            : summary;

        return {
          ...r,
          source: typeof r.source === "string" ? r.source : "unknown",
          summary,
          title,
        };
      });
  } catch {
    return [];
  }
}

function writeRecords(workingDir: string, graphId: string, records: GraphHistoryRecord[]) {
  ensureHistoryDir(workingDir);
  const filePath = getGraphHistoryFilePath(workingDir, graphId);
  fs.writeFileSync(filePath, JSON.stringify(records.slice(0, MAX_HISTORY), null, 2));
}

export function listGraphHistory(workingDir: string, graphId: string): GraphHistoryEntry[] {
  return readRecords(workingDir, graphId).map(({ snapshot: _snapshot, ...entry }) => entry);
}

export function appendGraphHistory(
  workingDir: string,
  graph: IGraph,
  source: string,
  options: AppendGraphHistoryOptions = {},
): GraphHistoryEntry[] {
  const current = readRecords(workingDir, graph.id);
  const snapshot = JSON.parse(JSON.stringify(graph)) as IGraph;
  const lastSnapshot = current[0]?.snapshot;

  // Skip writing duplicate records when snapshot content has not changed.
  if (lastSnapshot && JSON.stringify(lastSnapshot) === JSON.stringify(snapshot)) {
    return listGraphHistory(workingDir, graph.id);
  }

  const record: GraphHistoryRecord = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    graphId: graph.id,
    graphName: graph.name,
    createdAt: new Date().toISOString(),
    source,
    title: normalizeHistoryTitle(source, options.title, lastSnapshot, snapshot),
    summary: normalizeHistorySummary(source, options.summary),
    snapshot,
  };

  const next = [record, ...current].slice(0, MAX_HISTORY);
  writeRecords(workingDir, graph.id, next);
  return next.map(({ snapshot: _snap, ...entry }) => entry);
}

export function getGraphHistorySnapshot(
  workingDir: string,
  graphId: string,
  recordId: string,
): IGraph | undefined {
  const records = readRecords(workingDir, graphId);
  const found = records.find((r) => r.id === recordId);
  if (!found) return undefined;
  return JSON.parse(JSON.stringify(found.snapshot)) as IGraph;
}

export function deleteGraphHistory(workingDir: string, graphId: string) {
  const filePath = getGraphHistoryFilePath(workingDir, graphId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
