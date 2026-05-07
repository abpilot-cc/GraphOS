import type React from 'react';

interface SchemaEditorTarget {
  nodeId: string;
  key: string;
}

interface SchemaEditorModalProps {
  advancedSchemaTarget: SchemaEditorTarget | null;
  schemaEditorFrameRef: React.RefObject<HTMLIFrameElement | null>;
  schemaEditorFrameDoc: string;
  schemaEditorFrameReady: boolean;
  schemaEditorFrameError: string | null;
  closeModal: () => void;
  applyAdvancedSchema: () => void;
}

export default function SchemaEditorModal({
  advancedSchemaTarget,
  schemaEditorFrameRef,
  schemaEditorFrameDoc,
  schemaEditorFrameReady,
  schemaEditorFrameError,
  closeModal,
  applyAdvancedSchema,
}: SchemaEditorModalProps) {
  if (!advancedSchemaTarget) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[95vh] bg-panel-bg border border-panel-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-panel-border flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">JSON Schema Advanced Editor</h3>
          <button
            type="button"
            onClick={closeModal}
            className="px-2 py-1 rounded-md border border-panel-border text-xs text-text-secondary hover:bg-canvas-bg transition-colors"
          >
            Close
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden bg-canvas-bg">
          <iframe
            key={advancedSchemaTarget.nodeId + ':' + advancedSchemaTarget.key}
            ref={schemaEditorFrameRef}
            title="JSON Schema Advanced Editor"
            srcDoc={schemaEditorFrameDoc}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />

          {!schemaEditorFrameReady && !schemaEditorFrameError && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary bg-canvas-bg/90">
              Loading advanced editor...
            </div>
          )}

          {schemaEditorFrameError && (
            <div className="absolute inset-0 p-4 flex items-center justify-center text-sm text-red-300 bg-canvas-bg/95">
              Failed to load advanced editor: {schemaEditorFrameError}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-panel-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeModal}
            className="px-3 py-2 rounded-lg border border-panel-border text-text-secondary hover:bg-canvas-bg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyAdvancedSchema}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
