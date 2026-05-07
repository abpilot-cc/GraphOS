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
