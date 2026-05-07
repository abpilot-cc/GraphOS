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
  summary: string;
  snapshot: IGraph;
};

export type GraphHistoryEntry = Omit<GraphHistoryRecord, "snapshot">;

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
    return parsed.filter((r) => r && typeof r.id === "string" && typeof r.graphId === "string");
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
  summary?: string,
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
    summary: summary ?? source,
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
