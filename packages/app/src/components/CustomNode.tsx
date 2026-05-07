import { Handle, Position } from 'reactflow';

import type { NodeData } from '../types/graph';
import { getNodeTypeColor, getNodeTypeIcon, hexToRgba } from '../utils/nodeType';

interface CustomNodeProps {
  data: NodeData;
  selected: boolean;
}

export default function CustomNode({ data, selected }: CustomNodeProps) {
  const displayLabel = (data.properties?.name as string | undefined) ?? data.label ?? data.type;
  const nodeType = data.type ?? 'Unknown';
  const accentColor = getNodeTypeColor(nodeType);
  const icon = getNodeTypeIcon(nodeType);
  const hasIn = data.inTypes === '*' || (Array.isArray(data.inTypes) && data.inTypes.length > 0);
  const hasOut = data.outTypes === '*' || (Array.isArray(data.outTypes) && data.outTypes.length > 0);

  return (
    <div
      className="rounded-xl transition-all bg-panel-bg/95 min-w-[260px] relative overflow-visible p-3"
      style={{
        border: `1px solid ${hexToRgba(accentColor, selected ? 0.75 : 0.38)}`,
        boxShadow: selected
          ? `0 0 0 2px ${hexToRgba(accentColor, 0.22)}, 0 8px 16px ${hexToRgba(accentColor, 0.12)}`
          : `0 8px 16px ${hexToRgba(accentColor, 0.12)}`,
      }}
    >
      {hasIn && (
        <Handle
          type="target"
          position={Position.Top}
          className="size-3 !border-panel-bg !-top-1.5"
          style={{
            backgroundColor: accentColor,
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      <div className="relative min-w-0 flex items-center gap-3">
        <div
          className="p-2 rounded-lg"
          style={{
            backgroundColor: hexToRgba(accentColor, 0.22),
            color: accentColor,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate">{displayLabel}</div>
          <div className="text-[10px] text-text-secondary leading-tight truncate">{nodeType}</div>
        </div>
      </div>

      {hasOut && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="size-3 !border-panel-bg !-bottom-1.5"
          style={{
            backgroundColor: accentColor,
            left: '50%',
            transform: 'translate(-50%, 50%)',
          }}
        />
      )}
    </div>
  );
}
