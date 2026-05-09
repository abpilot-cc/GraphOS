import type React from 'react';

import { LayoutGrid } from 'lucide-react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';

interface GraphCanvasProps {
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
  nodes: Node[];
  edges: Edge[];
  nodeTypes: Record<string, React.ComponentType<any>>;
  isConnectionAllowed: (connection: Connection) => boolean;
  onGraphNodesChange: (changes: NodeChange[]) => void;
  onGraphEdgesChange: (changes: EdgeChange[]) => void;
  onNodeDragStop: () => void;
  onConnect: (connection: Connection) => void;
  onSelectionChange: ({ nodes }: { nodes: Node[] }) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onInit: () => void;
  t: (key: string) => string;
}

export default function GraphCanvas({
  reactFlowWrapper,
  nodes,
  edges,
  nodeTypes,
  isConnectionAllowed,
  onGraphNodesChange,
  onGraphEdgesChange,
  onNodeDragStop,
  onConnect,
  onSelectionChange,
  onDrop,
  onDragOver,
  onInit,
  t,
}: GraphCanvasProps) {
  return (
    <main className="relative h-full w-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        isValidConnection={isConnectionAllowed}
        onNodesChange={onGraphNodesChange}
        onEdgesChange={onGraphEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
      >
        <Background color="var(--canvas-grid)" gap={20} />
        <Controls className="!bg-panel-bg !border-panel-border !shadow-lg !rounded-lg overflow-hidden" />
        <MiniMap
          className="!bg-panel-bg !border-panel-border !rounded-xl !shadow-2xl overflow-hidden"
          nodeStrokeColor={(n) => (n.type === 'input' ? '#0041d0' : '#ff0072')}
          nodeColor={(n) => {
            if (n.type === 'text') return '#3b82f6';
            return '#64748b';
          }}
          maskColor="rgba(var(--canvas-bg-rgb), 0.7)"
        />

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
            <div className="text-center">
              <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-text-secondary" />
              <p className="text-sm font-medium">{t('graph.empty')}</p>
            </div>
          </div>
        )}
      </ReactFlow>
    </main>
  );
}
