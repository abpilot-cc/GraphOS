import type React from 'react';

import type { NodePropertyEditor } from 'graphos-core';

export type NodePropertyType = 'string' | 'float' | 'integer' | 'boolean' | 'JSONSchema' | string[];

export interface NodePropertyDef {
  type: NodePropertyType;
  description: string;
  defaultValue?: unknown;
  required?: boolean;
  editor?: NodePropertyEditor;
  visible?: Record<string, unknown>;
}

export interface NodeType {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  properties: Record<string, NodePropertyDef>;
  inTypes: string[] | '*';
  outTypes: string[] | '*';
}

export interface ApiNodeType {
  type: string;
  description: string;
  properties?: Record<string, NodePropertyDef>;
  inTypes?: string[] | '*';
  outTypes?: string[] | '*';
}

export interface GraphHistoryEntry {
  id: string;
  graphId: string;
  graphName: string;
  createdAt: string;
  source: string;
  title: string;
  summary: string;
}

export interface PluginTab {
  id: string;
  label: string;
  url: string;
}

export interface ApiPluginSummary {
  name: string;
  status: 'loaded' | 'error' | 'unloaded';
  error?: string;
  nodeTypeCount: number;
  tabs?: PluginTab[];
}

export type SchemaEditorFrameMessage = {
  source: 'gso-json-schema-editor';
  type: 'ready' | 'change' | 'error';
  payload?: unknown;
};

export interface NodeData {
  type: string;
  label?: string;
  description?: string;
  properties?: Record<string, unknown>;
  inTypes?: string[] | '*';
  outTypes?: string[] | '*';
}
