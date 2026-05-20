import { z } from "zod";
import fs from "fs";
import path from "path";
import type { IGraph, INode, IEdge, INodeType } from "graphos-core";
import { appendGraphHistory, deleteGraphHistory } from "./history.ts";

// --- IGraph <-> ReactFlow conversion ---

export type RFNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
};

export type RFEdge = {
  id: string;
  source: string;
  target: string;
  [k: string]: any;
};

export function rfNodeToINode(n: RFNode): INode {
  return {
    id: n.id,
    type: n.type ?? "unknown",
    properties: n.data?.properties ?? {},
    position: [n.position?.x ?? 0, n.position?.y ?? 0],
  };
}

export function iNodeToRFNode(n: INode & { position: any; data?: any }): RFNode {
  let x: number, y: number;
  if (Array.isArray(n.position)) {
    x = n.position[0] ?? 0;
    y = n.position[1] ?? 0;
  } else if (n.position && typeof n.position === "object") {
    x = (n.position as any).x ?? 0;
    y = (n.position as any).y ?? 0;
  } else {
    x = 0;
    y = 0;
  }
  const properties =
    n.properties && Object.keys(n.properties).length > 0
      ? n.properties
      : (n.data?.properties ?? {});
  return {
    id: n.id,
    type: n.type,
    position: { x, y },
    data: { type: n.type, properties },
  };
}

export function rfEdgeToIEdge(e: RFEdge): IEdge {
  return [e.source, e.target];
}

export function iEdgeToRFEdge(e: IEdge, idx: number): RFEdge {
  return { id: `edge_${idx}_${e[0]}_${e[1]}`, source: e[0], target: e[1] };
}

export function toRFGraph(g: IGraph): { id: string; name: string; nodes: RFNode[]; edges: RFEdge[] } {
  return {
    id: g.id,
    name: g.name,
    nodes: g.nodes.map(iNodeToRFNode),
    edges: g.edges.map(iEdgeToRFEdge),
  };
}

// --- Types & Schemas ---

export const OperationSchema = z.discriminatedUnion("op", [
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

export const TransactionSchema = z.object({
  ops: z.array(OperationSchema),
});

export type GraphData = IGraph;

export type GraphSelectionState = {
  selectedNodeId: string | null;
};

export type SaveGraphOptions = {
  source?: string;
  title?: string;
  summary?: string;
  skipHistory?: boolean;
};

// --- Filesystem Helpers ---

export const GRAPH_EXT = ".graph.json";
export const WORKING_DIR_ENV_KEY = "GRAPHOS_WORKING_DIR";

function normalizeGraphFileName(name: string) {
  const trimmed = (name ?? "").trim();
  const fallback = trimmed.length > 0 ? trimmed : "untitled";
  // Keep names readable while avoiding invalid path characters.
  return fallback.replace(/[\\/:*?"<>|]/g, "_");
}

function readGraphFile(filePath: string): GraphData | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as GraphData;
  } catch {
    return undefined;
  }
}

function findGraphFilePathsById(graphId: string): string[] {
  const workingDir = getWorkingDir();
  const matchedPaths: string[] = [];
  for (const fileName of fs.readdirSync(workingDir)) {
    if (!fileName.endsWith(GRAPH_EXT)) continue;
    const filePath = path.join(workingDir, fileName);
    const graph = readGraphFile(filePath);
    if (graph?.id === graphId) {
      matchedPaths.push(filePath);
    }
  }
  return matchedPaths;
}

function findGraphFilePathByName(graphName: string): string | undefined {
  const workingDir = getWorkingDir();
  const normalizedName = normalizeGraphFileName(graphName);
  const normalizedPath = path.join(workingDir, `${normalizedName}${GRAPH_EXT}`);
  if (fs.existsSync(normalizedPath)) {
    return normalizedPath;
  }

  const rawPath = path.join(workingDir, `${graphName}${GRAPH_EXT}`);
  if (fs.existsSync(rawPath)) {
    return rawPath;
  }

  return undefined;
}

export function getWorkingDir() {
  const configured = process.env[WORKING_DIR_ENV_KEY];
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured);
  }
  return process.cwd();
}

export function getGraphFilePath(idOrName: string) {
  const key = typeof idOrName === "string" ? idOrName.trim() : "";
  if (key.length === 0) {
    return path.join(getWorkingDir(), `${normalizeGraphFileName("untitled")}${GRAPH_EXT}`);
  }

  const byName = findGraphFilePathByName(key);
  if (byName) {
    return byName;
  }

  const byIdPaths = findGraphFilePathsById(key);
  if (byIdPaths.length > 0) {
    return byIdPaths[0];
  }

  return path.join(getWorkingDir(), `${normalizeGraphFileName(key)}${GRAPH_EXT}`);
}

export function listGraphs(): { id: string; name: string }[] {
  try {
    const workingDir = getWorkingDir();
    const files = fs.readdirSync(workingDir);
    return files
      .filter((f) => f.endsWith(GRAPH_EXT))
      .map((f) => {
        const filePath = path.join(workingDir, f);
        const fileStem = f.replace(GRAPH_EXT, "");
        const content = readGraphFile(filePath);
        if (!content) {
          return { id: fileStem, name: fileStem };
        }
        return {
          id: content.id || fileStem,
          name: content.name || fileStem,
        };
      })
      .filter((g) => g.id && g.name);
  } catch (e) {
    console.error("Error listing graphs:", e);
    return [];
  }
}

export function saveGraph(graph: GraphData, options: SaveGraphOptions = {}) {
  const normalizedName = normalizeGraphFileName(graph.name || graph.id);
  const targetFilePath = path.join(getWorkingDir(), `${normalizedName}${GRAPH_EXT}`);
  const existingFilePaths = findGraphFilePathsById(graph.id);

  fs.writeFileSync(targetFilePath, JSON.stringify(graph, null, 2));

  if (!options.skipHistory) {
    appendGraphHistory(getWorkingDir(), graph, options.source ?? "unknown", {
      title: options.title,
      summary: options.summary,
    });
  }

  for (const existingFilePath of existingFilePaths) {
    if (existingFilePath !== targetFilePath && fs.existsSync(existingFilePath)) {
      fs.unlinkSync(existingFilePath);
    }
  }
}

export function deleteGraphFile(idOrName: string) {
  const filePath = getGraphFilePath(idOrName);
  const existing = loadGraph(idOrName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (existing?.id) {
    deleteGraphHistory(getWorkingDir(), existing.id);
  }
}

export function loadGraph(idOrName: string): GraphData | undefined {
  const filePath = getGraphFilePath(idOrName);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return readGraphFile(filePath);
}

// --- Graph Analysis Helpers ---

export function buildNodeRelationMaps(graph: GraphData) {
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

export function describeNodeForAI(
  node: INode,
  graph: GraphData,
  nodeTypesByType: Map<string, INodeType>,
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
    connectedEdgeCount: graph.edges.filter(
      ([source, target]) => source === node.id || target === node.id,
    ).length,
  };
}

// --- State Management ---

export const graphSelectionState = new Map<string, GraphSelectionState>();
let currentOpenGraphId: string | null = null;

export function getCurrentOpenGraphId(): string | null {
  return currentOpenGraphId;
}

export function setCurrentOpenGraphId(id: string | null) {
  currentOpenGraphId = id;
}

export function getGraphSelectionState(graphId: string): GraphSelectionState {
  const existing = graphSelectionState.get(graphId);
  if (existing) {
    return existing;
  }
  const created: GraphSelectionState = { selectedNodeId: null };
  graphSelectionState.set(graphId, created);
  return created;
}

export function setSelectedNodeId(graphId: string, selectedNodeId: string | null) {
  graphSelectionState.set(graphId, { selectedNodeId });
}

export function pickFallbackGraphId(): string {
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

export function resolveGraphId(graphIdQuery: unknown): string {
  const requestedGraphId = typeof graphIdQuery === "string" ? graphIdQuery.trim() : "";
  if (requestedGraphId && loadGraph(requestedGraphId)) {
    return requestedGraphId;
  }
  return pickFallbackGraphId();
}

// --- Initialization ---

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
