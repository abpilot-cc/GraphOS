import type React from 'react';

import { Activity, Cpu, GitBranch, Globe, Zap } from 'lucide-react';
import type { Node } from 'reactflow';

import type { ApiNodeType, NodeData, NodePropertyDef, NodeType } from '../types/graph';

const NODE_TYPE_ICON_COMPONENTS = [Globe, GitBranch, Cpu, Activity, Zap];

const NODE_TYPE_COLOR_LIST = [
  '#60a5fa',
  '#2dd4bf',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#22d3ee',
  '#a3e635',
  '#fb923c',
  '#34d399',
  '#f472b6',
  '#38bdf8',
  '#c084fc',
];

export function normalizeTypeKey(type: string | undefined): string {
  return (type ?? '').trim().toLowerCase();
}

const NODE_TYPE_INDEX_MAP = new Map<string, number>();
let nextNodeTypeIndex = 0;

function getNodeTypeIndex(type: string): number {
  const key = normalizeTypeKey(type) || 'unknown';
  const existing = NODE_TYPE_INDEX_MAP.get(key);
  if (existing !== undefined) return existing;

  const index = nextNodeTypeIndex;
  NODE_TYPE_INDEX_MAP.set(key, index);
  nextNodeTypeIndex += 1;
  return index;
}

export function getNodeTypeColor(type: string): string {
  const idx = getNodeTypeIndex(type) % NODE_TYPE_COLOR_LIST.length;
  return NODE_TYPE_COLOR_LIST[idx];
}

export function getNodeTypeIcon(type: string): React.ReactNode {
  const idx = getNodeTypeIndex(type) % NODE_TYPE_ICON_COMPONENTS.length;
  const Icon = NODE_TYPE_ICON_COMPONENTS[idx];
  return <Icon className="w-4 h-4" />;
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function toNodeType(api: ApiNodeType): NodeType {
  return {
    type: api.type,
    label: api.type,
    description: api.description,
    icon: getNodeTypeIcon(api.type),
    properties: api.properties ?? {},
    inTypes: api.inTypes ?? '*',
    outTypes: api.outTypes ?? '*',
  };
}

export function resolvePropertyEditor(def: NodePropertyDef) {
  if (def.editor) return def.editor;
  if (Array.isArray(def.type)) return 'select';

  switch (def.type) {
    case 'boolean':
      return 'checkbox';
    case 'float':
    case 'integer':
      return 'number';
    case 'JSONSchema':
      return 'json';
    case 'string':
    default:
      return 'text';
  }
}

export function isPropertyVisible(def: NodePropertyDef, values: Record<string, unknown>): boolean {
  if (!def.visible) return true;
  return Object.entries(def.visible).every(([relatedKey, expectedValue]) => values[relatedKey] === expectedValue);
}

export function formatPropertyName(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toUpperCase();
}

export function attachNodeIOFromRegistry(nodes: Node[], registry: NodeType[]): Node[] {
  if (registry.length === 0) return nodes;

  const byType = new Map(registry.map((nt) => [normalizeTypeKey(nt.type), nt]));
  let changed = false;

  const nextNodes = nodes.map((node) => {
    const nodeTypeKey = node.type ?? ((node.data as NodeData | undefined)?.type);
    if (!nodeTypeKey) return node;

    const nodeType = byType.get(normalizeTypeKey(nodeTypeKey));
    if (!nodeType) return node;

    const data = (node.data ?? {}) as NodeData;
    const nextData: NodeData = {
      ...data,
      type: data.type ?? node.type,
      inTypes: nodeType.inTypes,
      outTypes: nodeType.outTypes,
    };

    if (data.type === nextData.type && data.inTypes === nextData.inTypes && data.outTypes === nextData.outTypes) {
      return node;
    }

    changed = true;
    return { ...node, data: nextData };
  });

  return changed ? nextNodes : nodes;
}

export function generateNodeName(type: string, existingNodes: Node[]): string {
  const base = type.split('.').pop() ?? type;
  const baseName = base.charAt(0).toUpperCase() + base.slice(1);
  const sameTypeCount = existingNodes.filter((n) => n.type === type).length;
  if (sameTypeCount === 0) return baseName;

  const usedNames = new Set<string>(
    existingNodes.flatMap((n) => {
      const name = (n.data as NodeData | undefined)?.properties?.name;
      return typeof name === 'string' ? [name] : [];
    })
  );

  if (!usedNames.has(baseName)) return baseName;

  let i = 2;
  while (usedNames.has(`${baseName}-${i}`)) i += 1;
  return `${baseName}-${i}`;
}
