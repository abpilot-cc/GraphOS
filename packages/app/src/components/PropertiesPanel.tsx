import type React from 'react';

import { Monitor } from 'lucide-react';
import type { Node } from 'reactflow';

import type { NodePropertyDef, NodeType } from '../types/graph';
import {
  formatPropertyName,
  isPropertyVisible,
  resolvePropertyEditor,
} from '../utils/nodeType';
import { makeJsonSchemaDraftKey } from '../utils/schemaEditor';

interface PropertiesPanelProps {
  selectedNode: Node | undefined;
  nodeTypeRegistry: NodeType[];
  nodeValidationErrors: Record<string, string | undefined>;
  jsonSchemaDrafts: Record<string, string>;
  setJsonSchemaDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateNodeProperty: (id: string, key: string, value: unknown) => void;
  openAdvancedSchemaEditor: (nodeId: string, key: string, value: unknown) => void;
}

export default function PropertiesPanel({
  selectedNode,
  nodeTypeRegistry,
  nodeValidationErrors,
  jsonSchemaDrafts,
  setJsonSchemaDrafts,
  updateNodeProperty,
  openAdvancedSchemaEditor,
}: PropertiesPanelProps) {
  return (
    <aside className={`border-l border-panel-border bg-panel-bg flex flex-col z-10 transition-all duration-300 relative shadow-2xl ${selectedNode ? 'w-80' : 'w-0 opacity-0 overflow-hidden border-none'}`}>
      <div className="w-80 flex-shrink-0 flex flex-col h-full">
        <div className="p-6 border-b border-panel-border">
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <Monitor className="w-4 h-4" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Properties</h2>
          </div>
          <p className="text-[10px] text-text-secondary uppercase tracking-widest">{selectedNode?.id}</p>
        </div>

        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {selectedNode && (() => {
            const nodeTypeDef = nodeTypeRegistry.find((nt) => nt.type === selectedNode.type);
            const props: Record<string, unknown> = (selectedNode.data as any)?.properties ?? {};

            const renderField = (key: string, def: NodePropertyDef) => {
              if (!isPropertyVisible(def, props)) {
                return null;
              }

              const value = props[key] ?? def.defaultValue ?? '';
              const inputClass = 'w-full px-3 py-2 rounded-lg border border-panel-border bg-canvas-bg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm';
              const editor = resolvePropertyEditor(def);
              const displayName = formatPropertyName(key);
              const label = (
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1">
                  {displayName}
                  {def.required && <span className="text-red-400">*</span>}
                </label>
              );

              if (editor === 'select' && Array.isArray(def.type)) {
                return (
                  <div key={key} className="space-y-1">
                    {label}
                    <select
                      value={String(value)}
                      onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
                      className={inputClass}
                    >
                      {!def.required && <option value="">-</option>}
                      {def.type.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {def.description && <p className="text-[10px] text-text-secondary">{def.description}</p>}
                  </div>
                );
              }

              if (editor === 'checkbox') {
                return (
                  <div key={key} className="space-y-1">
                    {label}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-panel-border bg-canvas-bg">
                      <input
                        id={`prop-${key}`}
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.checked)}
                        className="accent-blue-500"
                      />
                      <label htmlFor={`prop-${key}`} className="text-sm cursor-pointer">{def.description || displayName}</label>
                    </div>
                  </div>
                );
              }

              if (editor === 'json') {
                const draftKey = makeJsonSchemaDraftKey(selectedNode.id, key);
                const baseRaw = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
                const raw = jsonSchemaDrafts[draftKey] ?? baseRaw;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      {label}
                      <button
                        type="button"
                        onClick={() => openAdvancedSchemaEditor(selectedNode.id, key, raw)}
                        className="px-2 py-1 rounded-md border border-panel-border text-[10px] font-bold uppercase tracking-wide text-text-secondary hover:bg-canvas-bg transition-colors"
                      >
                        Advanced Editor
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={raw}
                      onChange={(e) => {
                        const nextRaw = e.target.value;
                        setJsonSchemaDrafts((prev) => ({ ...prev, [draftKey]: nextRaw }));
                        try {
                          updateNodeProperty(selectedNode.id, key, JSON.parse(nextRaw));
                        } catch {
                          // Allow partial edits; commit only on valid JSON.
                        }
                      }}
                      onBlur={() => {
                        try {
                          updateNodeProperty(selectedNode.id, key, JSON.parse(raw));
                          setJsonSchemaDrafts((prev) => {
                            const next = { ...prev };
                            delete next[draftKey];
                            return next;
                          });
                        } catch {
                          // Keep draft text if JSON is still invalid.
                        }
                      }}
                      spellCheck={false}
                      className={`${inputClass} font-mono text-xs resize-y`}
                    />
                    {def.description && <p className="text-[10px] text-text-secondary">{def.description}</p>}
                  </div>
                );
              }

              if (editor === 'textarea') {
                return (
                  <div key={key} className="space-y-1">
                    {label}
                    <textarea
                      rows={4}
                      value={String(value)}
                      onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
                      className={`${inputClass} resize-y`}
                    />
                    {def.description && <p className="text-[10px] text-text-secondary">{def.description}</p>}
                  </div>
                );
              }

              const inputType = editor === 'number' || def.type === 'float' || def.type === 'integer' ? 'number' : 'text';
              const step = def.type === 'float' ? 'any' : def.type === 'integer' ? '1' : undefined;
              return (
                <div key={key} className="space-y-1">
                  {label}
                  <input
                    type={inputType}
                    step={step}
                    value={String(value)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const coerced = def.type === 'integer'
                        ? (raw === '' ? '' : parseInt(raw, 10))
                        : def.type === 'float'
                          ? (raw === '' ? '' : parseFloat(raw))
                          : raw;
                      updateNodeProperty(selectedNode.id, key, coerced);
                    }}
                    className={inputClass}
                  />
                  {def.description && <p className="text-[10px] text-text-secondary">{def.description}</p>}
                </div>
              );
            };

            return (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Type</label>
                  <div className="px-3 py-2 rounded-lg bg-canvas-bg border border-panel-border text-xs font-mono text-text-secondary">
                    {selectedNode.type}
                  </div>
                </div>

                {nodeTypeDef && Object.keys(nodeTypeDef.properties).length > 0 && (
                  <div className="border-t border-panel-border pt-4">
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Properties</p>
                    <div className="space-y-4">
                      {Object.entries(nodeTypeDef.properties).map(([key, def]) => renderField(key, def))}
                    </div>
                  </div>
                )}

                {!nodeTypeDef && (
                  <p className="text-xs text-text-secondary italic">No property schema found for this node type.</p>
                )}

                <div className="border-t border-panel-border pt-4">
                  <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-2">Validation</p>
                  {nodeValidationErrors[selectedNode.id] ? (
                    <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-mono break-words">
                      {nodeValidationErrors[selectedNode.id]}
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-xs font-mono">
                      ✓ All properties valid
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </aside>
  );
}
