import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Connection,
  EdgeChange,
  Edge,
  Node,
  NodeChange,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider,
  Handle,
  Position,
  MiniMap,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import {
  LayoutGrid,
  Activity,
  Monitor,
  Moon,
  Sun,
  Languages,
  Zap,
  Globe,
  Cpu,
  GitBranch,
  Plus,
  Trash2,
  Pencil
} from 'lucide-react';
import './i18n';

// --- Types ---

type NodePropertyType = 'string' | 'float' | 'integer' | 'boolean' | 'JSONSchema' | string[];

interface NodePropertyDef {
  type: NodePropertyType;
  description: string;
  defaultValue?: unknown;
  required?: boolean;
}

interface NodeType {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  properties: Record<string, NodePropertyDef>;
  inTypes: string[] | '*';
  outTypes: string[] | '*';
}

interface ApiNodeType {
  type: string;
  description: string;
  properties?: Record<string, NodePropertyDef>;
  inTypes?: string[] | '*';
  outTypes?: string[] | '*';
}

const LAST_GRAPH_ID_STORAGE_KEY = 'gso-last-graph-id';

const NODE_TYPE_ICON_COMPONENTS = [
  Globe,
  GitBranch,
  Cpu,
  Activity,
  Zap
];

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

function normalizeTypeKey(type: string | undefined): string {
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

function getNodeTypeColor(type: string): string {
  const idx = getNodeTypeIndex(type) % NODE_TYPE_COLOR_LIST.length;
  return NODE_TYPE_COLOR_LIST[idx];
}

function getNodeTypeIcon(type: string): React.ReactNode {
  const idx = getNodeTypeIndex(type) % NODE_TYPE_ICON_COMPONENTS.length;
  const Icon = NODE_TYPE_ICON_COMPONENTS[idx];
  return <Icon className="w-4 h-4" />;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toNodeType(api: ApiNodeType): NodeType {
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

// --- Custom Node Components ---

interface NodeData {
  type: string;
  label?: string;
  description?: string;
  properties?: Record<string, unknown>;
  inTypes?: string[] | '*';
  outTypes?: string[] | '*';
}

function attachNodeIOFromRegistry(nodes: Node[], registry: NodeType[]): Node[] {
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

const CustomNode = ({ data, selected }: { data: NodeData, selected: boolean }) => {
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
};

// --- Helpers ---

function generateNodeName(type: string, existingNodes: Node[]): string {
  const base = (type.split('.').pop() ?? type);
  const baseName = base.charAt(0).toUpperCase() + base.slice(1);
  const sameTypeCount = existingNodes.filter(n => n.type === type).length;
  if (sameTypeCount === 0) return baseName;
  const usedNames = new Set<string>(
    existingNodes.flatMap(n => {
      const name = n.data?.properties?.name;
      return typeof name === 'string' ? [name] : [];
    })
  );
  // If baseName (no suffix) is still free, use it for the first duplicate too
  if (!usedNames.has(baseName)) return baseName;
  let i = 2;
  while (usedNames.has(`${baseName}-${i}`)) i++;
  return `${baseName}-${i}`;
}

// --- Main App ---

function GraphOS() {
  const { t, i18n } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentGraphId, setCurrentGraphId] = useState(() => {
    return localStorage.getItem(LAST_GRAPH_ID_STORAGE_KEY) || 'main';
  });
  const [graphList, setGraphList] = useState<{ id: string, name: string }[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingGraphId, setEditingGraphId] = useState<string | null>(null);
  const [tempGraphName, setTempGraphName] = useState("");
  const [nodeTypeRegistry, setNodeTypeRegistry] = useState<NodeType[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('gso-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<Node | null>(null);
  const nodeTypeRegistryRef = useRef<NodeType[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  // --- Theme Management ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gso-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // --- Language Management ---
  useEffect(() => {
    const savedLang = localStorage.getItem('gso-lang') || 'en';
    if (i18n.language !== savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, [i18n]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('gso-lang', lang);
  };

  // --- Real-time Sync ---

  useEffect(() => {
    const newSocket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('graph-initial', (state) => {
      const hydratedNodes = attachNodeIOFromRegistry(state.nodes, nodeTypeRegistryRef.current);
      nodesRef.current = hydratedNodes as Node[];
      edgesRef.current = state.edges as Edge[];
      setNodes(hydratedNodes);
      setEdges(state.edges);
    });

    newSocket.on('graph-update', (state) => {
      const hydratedNodes = attachNodeIOFromRegistry(state.nodes, nodeTypeRegistryRef.current);
      nodesRef.current = hydratedNodes as Node[];
      edgesRef.current = state.edges as Edge[];
      setNodes(hydratedNodes);
      setEdges(state.edges);
    });

    newSocket.on('graph-list', (list) => {
      setGraphList(list);
    });

    newSocket.on('graph-created', (newGraph) => {
      setCurrentGraphId(newGraph.id);
    });

    newSocket.on('node-types:updated', (apiTypes: ApiNodeType[]) => {
      setNodeTypeRegistry(apiTypes.map(toNodeType));
    });

    return () => {
      newSocket.close();
    };
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (socket) {
      socket.emit('join-graph', currentGraphId);
      socket.emit('get-graph-list');
    }
  }, [socket, currentGraphId]);

  useEffect(() => {
    localStorage.setItem(LAST_GRAPH_ID_STORAGE_KEY, currentGraphId);
  }, [currentGraphId]);

  useEffect(() => {
    if (graphList.length === 0) return;

    setCurrentGraphId((prev) => {
      if (graphList.some((g) => g.id === prev)) return prev;

      const saved = localStorage.getItem(LAST_GRAPH_ID_STORAGE_KEY);
      if (saved && graphList.some((g) => g.id === saved)) return saved;

      return graphList[0].id;
    });
  }, [graphList]);

  useEffect(() => {
    nodeTypeRegistryRef.current = nodeTypeRegistry;
    setNodes((prev) => attachNodeIOFromRegistry(prev as Node[], nodeTypeRegistry));
  }, [nodeTypeRegistry, setNodes]);

  useEffect(() => {
    nodesRef.current = nodes as Node[];
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges as Edge[];
  }, [edges]);

  // Fetch node types from API on mount, refresh when socket reconnects
  useEffect(() => {
    fetch('/api/node-types')
      .then((r) => r.json())
      .then((apiTypes: ApiNodeType[]) => setNodeTypeRegistry(apiTypes.map(toNodeType)))
      .catch((e) => console.error('[GraphOS] Failed to fetch node types:', e));
  }, [isConnected]);

  // Build ReactFlow nodeTypes map from registry — memoised to keep stable reference
  const nodeTypes = useMemo(() => {
    const map: Record<string, typeof CustomNode> = {};
    for (const nt of nodeTypeRegistry) {
      map[nt.type] = CustomNode;
    }
    return map;
  }, [nodeTypeRegistry]);

  // --- Graph Handlers ---

  const getNodeConnectionMeta = useCallback((node: Node | undefined) => {
    const data = (node?.data ?? {}) as NodeData;
    const type = node?.type ?? data.type;
    const fallback = type
      ? nodeTypeRegistry.find((nt) => normalizeTypeKey(nt.type) === normalizeTypeKey(type))
      : undefined;

    return {
      type,
      inTypes: data.inTypes ?? fallback?.inTypes,
      outTypes: data.outTypes ?? fallback?.outTypes,
    };
  }, [nodeTypeRegistry]);

  const allowsType = useCallback((allowed: string[] | '*' | undefined, otherType: string | undefined) => {
    if (!otherType) return false;
    if (allowed === '*') return true;
    if (!Array.isArray(allowed)) return false;
    const otherKey = normalizeTypeKey(otherType);
    return allowed.some((t) => normalizeTypeKey(t) === otherKey);
  }, []);

  const isConnectionAllowed = useCallback((params: Connection) => {
    if (!params.source || !params.target) return false;

    const sourceNode = nodes.find((n) => n.id === params.source);
    const targetNode = nodes.find((n) => n.id === params.target);
    if (!sourceNode || !targetNode) return false;

    const sourceMeta = getNodeConnectionMeta(sourceNode);
    const targetMeta = getNodeConnectionMeta(targetNode);

    return allowsType(sourceMeta.outTypes, targetMeta.type) && allowsType(targetMeta.inTypes, sourceMeta.type);
  }, [nodes, getNodeConnectionMeta, allowsType]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!isConnectionAllowed(params)) return;
      const newEdge = addEdge(params, edgesRef.current);
      setEdges(newEdge);
      edgesRef.current = newEdge;
      socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nodesRef.current, edges: newEdge });
    },
    [socket, currentGraphId, setEdges, isConnectionAllowed]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const { type, offset } = JSON.parse(event.dataTransfer.getData('application/reactflow'));
      if (!type || !reactFlowWrapper.current) return;

      const position = screenToFlowPosition({
        x: event.clientX - (offset?.x || 0),
        y: event.clientY - (offset?.y || 0),
      });

      const newName = generateNodeName(type, nodes);
      const ntDef = nodeTypeRegistry.find(nt => nt.type === type);
      const newNode: Node = {
        id: `node_${Date.now()}`,
        type,
        position,
        data: {
          type,
          properties: { name: newName },
          inTypes: ntDef?.inTypes,
          outTypes: ntDef?.outTypes,
        },
      };

      const nextNodes = nodes.concat(newNode);
      setNodes(nextNodes);
      socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });
    },
    [nodes, edges, socket, currentGraphId, setNodes, screenToFlowPosition, t]
  );

  const onGraphNodesChange = useCallback((changes: NodeChange[]) => {
    let nextNodes: Node[] = nodesRef.current;
    setNodes((prev) => {
      nextNodes = applyNodeChanges(changes, prev as Node[]);
      nodesRef.current = nextNodes;
      return nextNodes;
    });

    // Keep interaction-only changes local (selection, measurements, dragging positions).
    const hasOnlyLocalChanges = changes.every((change) =>
      change.type === 'position' ||
      change.type === 'select' ||
      change.type === 'dimensions'
    );
    if (hasOnlyLocalChanges) return;

    socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges: edgesRef.current });
  }, [setNodes, socket, currentGraphId]);

  const onNodeDragStop = useCallback(() => {
    socket?.emit('sync-graph', {
      graphId: currentGraphId,
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
  }, [socket, currentGraphId]);

  const onGraphEdgesChange = useCallback((changes: EdgeChange[]) => {
    let nextEdges: Edge[] = edgesRef.current;
    setEdges((prev) => {
      nextEdges = applyEdgeChanges(changes, prev as Edge[]);
      edgesRef.current = nextEdges;
      return nextEdges;
    });
    socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nodesRef.current, edges: nextEdges });
  }, [setEdges, socket, currentGraphId]);

  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    setSelectedNodeId(nodes[0]?.id || null);
  }, []);

  const updateNodeLabel = (id: string, label: string) => {
    const nextNodes = nodes.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n);
    setNodes(nextNodes);
    socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });
  };

  const updateNodeProperty = (id: string, key: string, value: unknown) => {
    const nextNodes = nodes.map(n =>
      n.id === id
        ? { ...n, data: { ...n.data, properties: { ...(n.data.properties ?? {}), [key]: value } } }
        : n
    );
    setNodes(nextNodes);
    socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });
  };

  // --- Copy / Paste ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node) clipboardRef.current = node;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const src = clipboardRef.current;
        if (!src || !src.type) return;
        const newName = generateNodeName(src.type, nodes);
        const newNode: Node = {
          id: `node_${Date.now()}`,
          type: src.type,
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          data: {
            ...src.data,
            properties: { ...(src.data.properties ?? {}), name: newName },
          },
        };
        const nextNodes = nodes.concat(newNode);
        setNodes(nextNodes);
        socket?.emit('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, socket, currentGraphId, selectedNodeId, setNodes]);

  const createNewGraph = () => {
    socket?.emit('create-graph', "Untitled Graph");
  };

  const startRenaming = (g: { id: string, name: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGraphId(g.id);
    setTempGraphName(g.name);
  };

  const submitRename = (id: string) => {
    if (tempGraphName.trim()) {
      socket?.emit('rename-graph', { id, name: tempGraphName });
    }
    setEditingGraphId(null);
  };

  const deleteGraph = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Use socket to request delete
    socket?.emit('delete-graph', id);

    // Optimistically update UI if deleting current
    if (id === currentGraphId) {
      const next = graphList.find(g => g.id !== id);
      if (next) setCurrentGraphId(next.id);
      else setCurrentGraphId('main');
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // --- UI Components ---

  return (
    <div className="flex h-screen w-full bg-canvas-bg overflow-hidden font-sans">
      {/* Sidebar Left: Library & Graphs */}
      <aside className="w-72 border-r border-panel-border bg-panel-bg flex flex-col z-10 transition-colors">
        <div className="p-6 border-b border-panel-border flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-500/20">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t('app.title')}</h1>
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold">{t('app.description')}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          {/* Graphs List */}
          <div>
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">{t('sidebar.graphs')}</h2>
              <button onClick={createNewGraph} className="p-1 hover:bg-canvas-bg rounded text-text-secondary transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {graphList.map(g => (
                <div
                  key={g.id}
                  onClick={() => editingGraphId !== g.id && setCurrentGraphId(g.id)}
                  className={`group relative w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 cursor-pointer ${currentGraphId === g.id
                    ? 'bg-blue-500 text-white font-semibold shadow-md'
                    : 'hover:bg-canvas-bg text-text-primary'
                    }`}
                >
                  <Activity className={`w-3 h-3 flex-shrink-0 ${currentGraphId === g.id ? 'text-white' : 'text-blue-500'}`} />

                  {editingGraphId === g.id ? (
                    <input
                      autoFocus
                      className="flex-1 bg-white/20 text-white border-none outline-none px-1 rounded text-sm min-w-0"
                      value={tempGraphName}
                      onChange={(e) => setTempGraphName(e.target.value)}
                      onBlur={() => submitRename(g.id)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename(g.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate flex-1 pr-12">{g.name}</span>
                  )}

                  {!editingGraphId && (
                    <div className={`absolute right-2 flex items-center gap-1 transition-opacity ${currentGraphId === g.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button onClick={(e) => startRenaming(g, e)} className="p-1 hover:bg-black/10 rounded transition-colors text-current">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => deleteGraph(g.id, e)} className={`p-1 rounded transition-colors ${currentGraphId === g.id ? 'hover:bg-white/20' : 'hover:bg-red-500/20'}`}>
                        <Trash2 className={`w-3 h-3 ${currentGraphId === g.id ? 'text-white' : 'text-red-500'}`} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Node Library */}
          <div>
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4 px-2">{t('sidebar.nodes')}</h2>
            <div className="grid grid-cols-1 gap-2">
              {nodeTypeRegistry.map((item) => {
                const accentColor = getNodeTypeColor(item.type);
                return (
                  <div
                    key={item.type}
                    className="group flex items-center gap-3 p-3 rounded-xl border hover:bg-canvas-bg cursor-grab active:cursor-grabbing transition-colors"
                    style={{
                      borderColor: hexToRgba(accentColor, 0.42),
                      boxShadow: `0 8px 16px ${hexToRgba(accentColor, 0.12)}`,
                    }}
                    onDragStart={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offset = {
                        x: event.clientX - rect.left,
                        y: event.clientY - rect.top
                      };
                      event.dataTransfer.setData(
                        'application/reactflow',
                        JSON.stringify({ type: item.type, offset })
                      );
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    draggable
                  >
                    <div
                      className="p-2 rounded-lg transition-colors"
                      style={{
                        backgroundColor: hexToRgba(accentColor, 0.22),
                        color: accentColor,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t(item.label)}</div>
                      <div className="text-[10px] text-text-secondary leading-tight">{t(item.description)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-panel-border flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex-1 p-2 rounded-lg border border-panel-border hover:bg-canvas-bg flex items-center justify-center transition-colors text-text-primary"
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="flex-[2] relative">
              <select
                value={i18n.language}
                onChange={(e) => changeLanguage(e.target.value)}
                className="w-full h-full p-2 rounded-lg border border-panel-border bg-panel-bg hover:bg-canvas-bg transition-colors font-bold text-xs uppercase appearance-none cursor-pointer flex items-center justify-center text-center text-text-primary outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="en">English (US)</option>
                <option value="zh">中文 (简体)</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
                <Languages className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 relative" ref={reactFlowWrapper}>
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
          onInit={() => socket?.emit('join-graph', currentGraphId)}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
        >
          <Background color="var(--canvas-grid)" gap={20} />
          <Controls className="!bg-panel-bg !border-panel-border !shadow-lg !rounded-lg overflow-hidden" />
          <MiniMap
            className="!bg-panel-bg !border-panel-border !rounded-xl !shadow-2xl overflow-hidden"
            nodeStrokeColor={(n) => n.type === 'input' ? '#0041d0' : '#ff0072'}
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

      {/* Sidebar Right: Properties */}
      <aside className={`border-l border-panel-border bg-panel-bg flex flex-col z-10 transition-all duration-300 relative shadow-2xl ${selectedNode ? 'w-80' : 'w-0 opacity-0 overflow-hidden border-none'}`}>
        <div className="w-80 flex-shrink-0 flex flex-col h-full">
          <div className="p-6 border-b border-panel-border">
            <div className="flex items-center gap-2 text-blue-500 mb-1">
              <Monitor className="w-4 h-4" />
              <h2 className="text-sm font-bold uppercase tracking-wider">{t('sidebar.properties')}</h2>
            </div>
            <p className="text-[10px] text-text-secondary uppercase tracking-widest">{selectedNode?.id}</p>
          </div>

          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {selectedNode && (() => {
              const nodeTypeDef = nodeTypeRegistry.find(nt => nt.type === selectedNode.type);
              const props: Record<string, unknown> = selectedNode.data.properties ?? {};

              const renderField = (key: string, def: NodePropertyDef) => {
                const value = props[key] ?? def.defaultValue ?? '';
                const inputClass = "w-full px-3 py-2 rounded-lg border border-panel-border bg-canvas-bg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm";
                const label = (
                  <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1">
                    {key}
                    {def.required && <span className="text-red-400">*</span>}
                  </label>
                );

                // enum (string[])
                if (Array.isArray(def.type)) {
                  return (
                    <div key={key} className="space-y-1">
                      {label}
                      <select
                        value={String(value)}
                        onChange={e => updateNodeProperty(selectedNode.id, key, e.target.value)}
                        className={inputClass}
                      >
                        {!def.required && <option value="">—</option>}
                        {def.type.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      {def.description && <p className="text-[10px] text-text-secondary">{def.description}</p>}
                    </div>
                  );
                }

                if (def.type === 'boolean') {
                  return (
                    <div key={key} className="space-y-1">
                      {label}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-panel-border bg-canvas-bg">
                        <input
                          id={`prop-${key}`}
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={e => updateNodeProperty(selectedNode.id, key, e.target.checked)}
                          className="accent-blue-500"
                        />
                        <label htmlFor={`prop-${key}`} className="text-sm cursor-pointer">{def.description || key}</label>
                      </div>
                    </div>
                  );
                }

                if (def.type === 'JSONSchema') {
                  const raw = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                  return (
                    <div key={key} className="space-y-1">
                      {label}
                      <textarea
                        rows={5}
                        value={raw}
                        onChange={e => {
                          try {
                            updateNodeProperty(selectedNode.id, key, JSON.parse(e.target.value));
                          } catch {
                            /* allow partial edits — commit on valid JSON only */
                          }
                        }}
                        spellCheck={false}
                        className={`${inputClass} font-mono text-xs resize-y`}
                      />
                      {def.description && <p className="text-[10px] text-text-secondary">{def.description}</p>}
                    </div>
                  );
                }

                // string / float / integer
                const inputType = def.type === 'float' || def.type === 'integer' ? 'number' : 'text';
                const step = def.type === 'float' ? 'any' : def.type === 'integer' ? '1' : undefined;
                return (
                  <div key={key} className="space-y-1">
                    {label}
                    <input
                      type={inputType}
                      step={step}
                      value={String(value)}
                      onChange={e => {
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
                  {/* Type badge */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Type</label>
                    <div className="px-3 py-2 rounded-lg bg-canvas-bg border border-panel-border text-xs font-mono text-text-secondary">
                      {selectedNode.type}
                    </div>
                  </div>

                  {/* Dynamic properties from node type definition */}
                  {nodeTypeDef && Object.keys(nodeTypeDef.properties).length > 0 && (
                    <>
                      <div className="border-t border-panel-border pt-4">
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Properties</p>
                        <div className="space-y-4">
                          {Object.entries(nodeTypeDef.properties).map(([key, def]) => renderField(key, def))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Fallback when no nodeType definition */}
                  {!nodeTypeDef && (
                    <p className="text-xs text-text-secondary italic">No property schema found for this node type.</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </aside>
    </div>
  );
}
export default function App() {
  return (
    <ReactFlowProvider>
      <GraphOS />
    </ReactFlowProvider>
  );
}
