import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTranslation } from 'react-i18next';
import { validateNode } from 'graphos-core';

import './i18n';
import CustomNode from './components/CustomNode';
import GraphCanvas from './components/GraphCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import SchemaEditorModal from './components/SchemaEditorModal';
import SidebarLeft from './components/SidebarLeft';
import type {
  ApiPluginSummary,
  ApiNodeType,
  NodeData,
  NodeType,
  PluginTab,
  SchemaEditorFrameMessage,
} from './types/graph';
import type { GraphHistoryEntry } from './types/graph';
import {
  attachNodeIOFromRegistry,
  generateNodeName,
  normalizeTypeKey,
  toNodeType,
} from './utils/nodeType';
import {
  buildSchemaEditorIframeDoc,
  LAST_GRAPH_ID_STORAGE_KEY,
  makeJsonSchemaDraftKey,
} from './utils/schemaEditor';

type WsEnvelope<T = unknown> = {
  type: string;
  payload?: T;
};

function GraphOS() {
  const { t, i18n } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentGraphId, setCurrentGraphId] = useState(() => {
    return localStorage.getItem(LAST_GRAPH_ID_STORAGE_KEY) || 'main';
  });
  const [graphList, setGraphList] = useState<{ id: string; name: string }[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingGraphId, setEditingGraphId] = useState<string | null>(null);
  const [tempGraphName, setTempGraphName] = useState('');
  const [nodeTypeRegistry, setNodeTypeRegistry] = useState<NodeType[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<Node | null>(null);
  const nodeTypeRegistryRef = useRef<NodeType[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const selectionGraphIdRef = useRef(currentGraphId);
  const schemaEditorFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [schemaEditorFrameReady, setSchemaEditorFrameReady] = useState(false);
  const [schemaEditorFrameError, setSchemaEditorFrameError] = useState<string | null>(null);
  const [advancedSchemaTarget, setAdvancedSchemaTarget] = useState<{ nodeId: string; key: string } | null>(null);
  const [advancedSchemaDraft, setAdvancedSchemaDraft] = useState<unknown>(null);
  const [jsonSchemaDrafts, setJsonSchemaDrafts] = useState<Record<string, string>>({});
  const [nodeValidationErrors, setNodeValidationErrors] = useState<Record<string, string | undefined>>({});
  const [graphHistory, setGraphHistory] = useState<GraphHistoryEntry[]>([]);
  const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null);
  const [pluginTabs, setPluginTabs] = useState<PluginTab[]>([]);
  const [activeTabId, setActiveTabId] = useState('graph');
  const currentGraphIdRef = useRef(currentGraphId);
  const graphTab = useMemo(() => ({ id: 'graph', label: 'Graph', kind: 'graph' as const }), []);

  const sendWs = useCallback((type: string, payload?: unknown) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const message: WsEnvelope = { type, payload };
    socket.send(JSON.stringify(message));
  }, [socket]);

  const tabs = useMemo(() => {
    const pluginTabItems = pluginTabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      kind: 'iframe' as const,
      url: tab.url,
    }));

    return [graphTab, ...pluginTabItems];
  }, [graphTab, pluginTabs]);

  const activeTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId) ?? graphTab;
  }, [tabs, activeTabId, graphTab]);

  const isGraphTabActive = activeTab?.kind === 'graph';

  const normalizeSchemaValue = useCallback((raw: unknown): unknown => {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw ?? {};
  }, []);

  const openAdvancedSchemaEditor = useCallback((nodeId: string, key: string, value: unknown) => {
    setAdvancedSchemaTarget({ nodeId, key });
    setAdvancedSchemaDraft(normalizeSchemaValue(value));
    setSchemaEditorFrameReady(false);
    setSchemaEditorFrameError(null);
  }, [normalizeSchemaValue]);

  const schemaEditorFrameDoc = useMemo(() => {
    if (!advancedSchemaTarget) return '';
    return buildSchemaEditorIframeDoc(advancedSchemaDraft ?? {});
  }, [advancedSchemaDraft, advancedSchemaTarget]);

  const fetchGraphHistory = useCallback(async (graphId: string) => {
    try {
      const response = await fetch(`/api/graph/history?graphId=${encodeURIComponent(graphId)}`);
      if (!response.ok) return;
      const payload = await response.json() as { history?: GraphHistoryEntry[] };
      setGraphHistory(Array.isArray(payload.history) ? payload.history : []);
    } catch (e) {
      console.error('[GraphOS] Failed to fetch graph history:', e);
    }
  }, []);

  const fetchPluginTabs = useCallback(async () => {
    try {
      const response = await fetch('/api/plugins');
      if (!response.ok) {
        setPluginTabs([]);
        return;
      }

      const payload = await response.json() as ApiPluginSummary[];
      if (!Array.isArray(payload)) {
        setPluginTabs([]);
        return;
      }

      const nextTabs = payload
        .flatMap((plugin) => (Array.isArray(plugin.tabs) ? plugin.tabs : []))
        .filter((tab): tab is PluginTab => {
          return (
            typeof tab.id === 'string' && tab.id.trim().length > 0 &&
            typeof tab.label === 'string' && tab.label.trim().length > 0 &&
            typeof tab.url === 'string' && tab.url.trim().length > 0
          );
        });

      setPluginTabs(nextTabs);
    } catch (e) {
      console.error('[GraphOS] Failed to fetch plugin tabs:', e);
      setPluginTabs([]);
    }
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!advancedSchemaTarget) return;
      const frameWindow = schemaEditorFrameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const data = event.data as SchemaEditorFrameMessage | undefined;
      if (!data || data.source !== 'gso-json-schema-editor') return;

      if (data.type === 'ready') {
        setSchemaEditorFrameReady(true);
        return;
      }

      if (data.type === 'error') {
        const message = typeof data.payload === 'string' ? data.payload : 'Unknown iframe error';
        setSchemaEditorFrameError(message);
        return;
      }

      if (data.type === 'change') {
        setAdvancedSchemaDraft(normalizeSchemaValue(data.payload));
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [advancedSchemaTarget, normalizeSchemaValue]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
    window.dispatchEvent(new Event('app-theme'));
  }, [theme]);

  useEffect(() => {
    currentGraphIdRef.current = currentGraphId;
  }, [currentGraphId]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const savedLang = localStorage.getItem('app-lang') || 'en';
    if (i18n.language !== savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, [i18n]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('app-lang', lang);
    window.dispatchEvent(new Event('app-lang'));
  };

  useEffect(() => {
    let shouldReconnect = true;
    let reconnectAttempts = 0;
    let reconnectTimer: number | undefined;
    let activeSocket: WebSocket | null = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      activeSocket = ws;
      setSocket(ws);

      ws.addEventListener('open', () => {
        reconnectAttempts = 0;
        setIsConnected(true);
      });

      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;

        let envelope: WsEnvelope | null = null;
        try {
          envelope = JSON.parse(event.data) as WsEnvelope;
        } catch {
          envelope = null;
        }

        if (!envelope || typeof envelope.type !== 'string') return;

        switch (envelope.type) {
          case 'graph-initial': {
            const state = envelope.payload as { nodes: Node[]; edges: Edge[] };
            const hydratedNodes = attachNodeIOFromRegistry(state.nodes, nodeTypeRegistryRef.current);
            nodesRef.current = hydratedNodes as Node[];
            edgesRef.current = state.edges as Edge[];
            setNodes(hydratedNodes);
            setEdges(state.edges);
            break;
          }
          case 'graph-update': {
            const state = envelope.payload as { nodes: Node[]; edges: Edge[] };
            const hydratedNodes = attachNodeIOFromRegistry(state.nodes, nodeTypeRegistryRef.current);
            nodesRef.current = hydratedNodes as Node[];
            edgesRef.current = state.edges as Edge[];
            setNodes(hydratedNodes);
            setEdges(state.edges);
            break;
          }
          case 'graph-list': {
            const list = Array.isArray(envelope.payload) ? envelope.payload as { id: string; name: string }[] : [];
            setGraphList(list);
            break;
          }
          case 'graph-created': {
            const graph = envelope.payload as { id?: string };
            if (typeof graph?.id === 'string') {
              setCurrentGraphId(graph.id);
            }
            break;
          }
          case 'node-types:updated': {
            const apiTypes = Array.isArray(envelope.payload) ? envelope.payload as ApiNodeType[] : [];
            setNodeTypeRegistry(apiTypes.map(toNodeType));
            break;
          }
          case 'graph-selection': {
            const payload = envelope.payload as { selectedNodeId: string | null };
            setSelectedNodeId(payload?.selectedNodeId ?? null);
            break;
          }
          case 'graph-history-updated': {
            const payload = envelope.payload as { graphId: string; history: GraphHistoryEntry[] };
            if (payload.graphId !== currentGraphIdRef.current) return;
            setGraphHistory(Array.isArray(payload.history) ? payload.history : []);
            break;
          }
          default:
            break;
        }
      });

      ws.addEventListener('close', () => {
        if (activeSocket === ws) {
          activeSocket = null;
          setSocket((prev) => (prev === ws ? null : prev));
        }

        setIsConnected(false);
        if (!shouldReconnect) return;
        if (reconnectAttempts >= 10) return;

        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(connect, 2000);
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) {
        activeSocket.close();
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!currentGraphId) return;
    void fetchGraphHistory(currentGraphId);
  }, [currentGraphId, fetchGraphHistory]);

  useEffect(() => {
    if (!isConnected) return;
    void fetchPluginTabs();
  }, [isConnected, nodeTypeRegistry, fetchPluginTabs]);

  useEffect(() => {
    if (tabs.some((tab) => tab.id === activeTabId)) return;
    setActiveTabId('graph');
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (isGraphTabActive) return;
    setSelectedNodeId(null);
  }, [isGraphTabActive]);

  useEffect(() => {
    if (socket && isConnected) {
      sendWs('join-graph', currentGraphId);
      sendWs('get-graph-list');
    }
  }, [socket, currentGraphId, sendWs, isConnected]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    if (selectionGraphIdRef.current !== currentGraphId) {
      selectionGraphIdRef.current = currentGraphId;
      return;
    }

    sendWs('select-node', { graphId: currentGraphId, nodeId: selectedNodeId });
  }, [socket, currentGraphId, selectedNodeId, sendWs, isConnected]);

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

  useEffect(() => {
    setJsonSchemaDrafts({});
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setNodeValidationErrors({});
      return;
    }

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    if (!selectedNode || !selectedNode.type) return;

    const nodeTypeDef = nodeTypeRegistry.find((nt) => nt.type === selectedNode.type);
    if (!nodeTypeDef) return;

    const [, error] = validateNode(
      {
        id: selectedNode.id,
        type: selectedNode.type,
        properties: (selectedNode.data as NodeData).properties ?? {},
        position: [selectedNode.position.x, selectedNode.position.y],
      },
      {
        type: nodeTypeDef.type,
        description: nodeTypeDef.description,
        properties: nodeTypeDef.properties,
        inTypes: nodeTypeDef.inTypes,
        outTypes: nodeTypeDef.outTypes,
      }
    );
    setNodeValidationErrors((prev) => ({
      ...prev,
      [selectedNodeId]: error,
    }));
  }, [selectedNodeId, nodes, nodeTypeRegistry]);

  useEffect(() => {
    fetch('/api/node-types')
      .then((r) => r.json())
      .then((apiTypes: ApiNodeType[]) => setNodeTypeRegistry(apiTypes.map(toNodeType)))
      .catch((e) => console.error('[GraphOS] Failed to fetch node types:', e));
  }, [isConnected]);

  const nodeTypes = useMemo(() => {
    const map: Record<string, typeof CustomNode> = {};
    for (const nt of nodeTypeRegistry) {
      map[nt.type] = CustomNode;
    }
    return map;
  }, [nodeTypeRegistry]);

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
    return allowed.some((v) => normalizeTypeKey(v) === otherKey);
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

  const onConnect = useCallback((params: Connection) => {
    if (!isConnectionAllowed(params)) return;
    const newEdge = addEdge(params, edgesRef.current);
    setEdges(newEdge);
    edgesRef.current = newEdge;
    sendWs('sync-graph', { graphId: currentGraphId, nodes: nodesRef.current, edges: newEdge });
  }, [currentGraphId, setEdges, isConnectionAllowed, sendWs]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const { type, offset } = JSON.parse(event.dataTransfer.getData('application/reactflow'));
    if (!type || !reactFlowWrapper.current) return;

    const position = screenToFlowPosition({
      x: event.clientX - (offset?.x || 0),
      y: event.clientY - (offset?.y || 0),
    });

    const newName = generateNodeName(type, nodes);
    const ntDef = nodeTypeRegistry.find((nt) => nt.type === type);
    const defaultProps: Record<string, unknown> = { name: newName };
    if (ntDef?.properties) {
      for (const [key, def] of Object.entries(ntDef.properties)) {
        if (def.defaultValue !== undefined) {
          defaultProps[key] = def.defaultValue;
        }
      }
    }
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type,
      position,
      data: {
        type,
        properties: defaultProps,
        inTypes: ntDef?.inTypes,
        outTypes: ntDef?.outTypes,
      },
    };

    const nextNodes = nodes.concat(newNode);
    setNodes(nextNodes);
    sendWs('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });
  }, [nodes, edges, currentGraphId, setNodes, screenToFlowPosition, nodeTypeRegistry, sendWs]);

  const onGraphNodesChange = useCallback((changes: NodeChange[]) => {
    let nextNodes: Node[] = nodesRef.current;
    setNodes((prev) => {
      nextNodes = applyNodeChanges(changes, prev as Node[]);
      nodesRef.current = nextNodes;
      return nextNodes;
    });

    const hasOnlyLocalChanges = changes.every((change) =>
      change.type === 'position' ||
      change.type === 'select' ||
      change.type === 'dimensions'
    );
    if (hasOnlyLocalChanges) return;

    sendWs('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges: edgesRef.current });
  }, [setNodes, currentGraphId, sendWs]);

  const onNodeDragStop = useCallback(() => {
    sendWs('sync-graph', {
      graphId: currentGraphId,
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
  }, [currentGraphId, sendWs]);

  const onGraphEdgesChange = useCallback((changes: EdgeChange[]) => {
    let nextEdges: Edge[] = edgesRef.current;
    setEdges((prev) => {
      nextEdges = applyEdgeChanges(changes, prev as Edge[]);
      edgesRef.current = nextEdges;
      return nextEdges;
    });
    sendWs('sync-graph', { graphId: currentGraphId, nodes: nodesRef.current, edges: nextEdges });
  }, [setEdges, currentGraphId, sendWs]);

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const nextSelectedNodeId = selectedNodes[0]?.id || null;
    setSelectedNodeId(nextSelectedNodeId);
    sendWs('select-node', { graphId: currentGraphId, nodeId: nextSelectedNodeId });
  }, [currentGraphId, sendWs]);

  const updateNodeProperty = (id: string, key: string, value: unknown) => {
    const nextNodes = nodes.map((n) =>
      n.id === id
        ? { ...n, data: { ...n.data, properties: { ...((n.data as NodeData).properties ?? {}), [key]: value } } }
        : n
    );
    setNodes(nextNodes);
    sendWs('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });

    const updatedNode = nextNodes.find((n) => n.id === id);
    if (updatedNode && updatedNode.type) {
      const nodeTypeDef = nodeTypeRegistry.find((nt) => nt.type === updatedNode.type);
      if (nodeTypeDef) {
        const [, error] = validateNode(
          {
            id: updatedNode.id,
            type: updatedNode.type,
            properties: (updatedNode.data as NodeData).properties ?? {},
            position: [updatedNode.position.x, updatedNode.position.y],
          },
          {
            type: nodeTypeDef.type,
            description: nodeTypeDef.description,
            properties: nodeTypeDef.properties,
            inTypes: nodeTypeDef.inTypes,
            outTypes: nodeTypeDef.outTypes,
          }
        );
        setNodeValidationErrors((prev) => ({
          ...prev,
          [id]: error,
        }));
      }
    }
  };

  const isEditingShortcutTarget = (target: EventTarget | null) => {
    const element = target instanceof HTMLElement
      ? target
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (!element) return false;

    if (element.closest('input, textarea, select, [contenteditable="true"]')) {
      return true;
    }

    return Boolean(element.closest('.monaco-editor'));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingShortcutTarget(e.target) || isEditingShortcutTarget(document.activeElement)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (node) clipboardRef.current = node;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const src = clipboardRef.current;
        if (!src || !src.type) return;

        const newName = generateNodeName(src.type, nodes);
        const srcData = (src.data ?? {}) as NodeData;
        const newNode: Node = {
          id: `node_${Date.now()}`,
          type: src.type,
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          data: {
            ...srcData,
            properties: { ...(srcData.properties ?? {}), name: newName },
          },
        };
        const nextNodes = nodes.concat(newNode);
        setNodes(nextNodes);
        sendWs('sync-graph', { graphId: currentGraphId, nodes: nextNodes, edges });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, currentGraphId, selectedNodeId, setNodes, sendWs]);

  const createNewGraph = () => {
    sendWs('create-graph', 'Untitled Graph');
  };

  const duplicateGraph = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sendWs('duplicate-graph', id);
  };

  const startRenaming = (g: { id: string; name: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGraphId(g.id);
    setTempGraphName(g.name);
  };

  const submitRename = (id: string) => {
    if (tempGraphName.trim()) {
      sendWs('rename-graph', { id, name: tempGraphName });
    }
    setEditingGraphId(null);
  };

  const deleteGraph = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    sendWs('delete-graph', id);

    if (id === currentGraphId) {
      const next = graphList.find((g) => g.id !== id);
      if (next) setCurrentGraphId(next.id);
      else setCurrentGraphId('main');
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const closeSchemaModal = () => {
    setAdvancedSchemaTarget(null);
  };

  const applyAdvancedSchema = () => {
    if (!advancedSchemaTarget) return;
    const draftKey = makeJsonSchemaDraftKey(advancedSchemaTarget.nodeId, advancedSchemaTarget.key);
    updateNodeProperty(advancedSchemaTarget.nodeId, advancedSchemaTarget.key, advancedSchemaDraft ?? {});
    setJsonSchemaDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
    setAdvancedSchemaTarget(null);
  };

  const restoreHistory = useCallback(async (recordId: string) => {
    if (!recordId) return;

    setRestoringHistoryId(recordId);
    try {
      const response = await fetch('/api/graph/history/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphId: currentGraphId, recordId }),
      });

      if (!response.ok) {
        throw new Error(`Restore failed with status ${response.status}`);
      }

      const payload = await response.json() as {
        graph?: { nodes?: Node[]; edges?: Edge[] };
        history?: GraphHistoryEntry[];
      };

      const restoredNodes = Array.isArray(payload.graph?.nodes) ? payload.graph.nodes : [];
      const restoredEdges = Array.isArray(payload.graph?.edges) ? payload.graph.edges : [];
      const hydratedNodes = attachNodeIOFromRegistry(restoredNodes, nodeTypeRegistry);
      setNodes(hydratedNodes);
      nodesRef.current = hydratedNodes as Node[];
      setEdges(restoredEdges as Edge[]);
      edgesRef.current = restoredEdges as Edge[];

      setGraphHistory(Array.isArray(payload.history) ? payload.history : []);
    } catch (e) {
      console.error('[GraphOS] Failed to restore graph history:', e);
    } finally {
      setRestoringHistoryId(null);
    }
  }, [currentGraphId, nodeTypeRegistry, setEdges, setNodes]);

  return (
    <div className="flex h-screen w-full bg-canvas-bg overflow-hidden font-sans">
      <SidebarLeft
        t={t}
        graphList={graphList}
        currentGraphId={currentGraphId}
        editingGraphId={editingGraphId}
        tempGraphName={tempGraphName}
        setTempGraphName={setTempGraphName}
        createNewGraph={createNewGraph}
        setCurrentGraphId={setCurrentGraphId}
        duplicateGraph={duplicateGraph}
        startRenaming={startRenaming}
        submitRename={submitRename}
        deleteGraph={deleteGraph}
        graphHistory={graphHistory}
        restoringHistoryId={restoringHistoryId}
        restoreHistory={restoreHistory}
        nodeTypeRegistry={nodeTypeRegistry}
        theme={theme}
        toggleTheme={toggleTheme}
        language={i18n.language}
        changeLanguage={changeLanguage}
      />

      <section className="flex-1 min-w-0 flex flex-col border-r border-panel-border">
        <div className="h-14 border-b border-panel-border bg-panel-bg px-3 flex items-end gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeTab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`h-10 px-4 rounded-t-lg border border-b-0 text-sm font-semibold whitespace-nowrap transition-colors ${active
                  ? 'bg-canvas-bg text-text-primary border-panel-border'
                  : 'bg-transparent text-text-secondary border-transparent hover:bg-canvas-bg/60 hover:text-text-primary'
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 relative">
          {isGraphTabActive ? (
            <GraphCanvas
              reactFlowWrapper={reactFlowWrapper}
              nodes={nodes as Node[]}
              edges={edges as Edge[]}
              nodeTypes={nodeTypes}
              isConnectionAllowed={isConnectionAllowed}
              onGraphNodesChange={onGraphNodesChange}
              onGraphEdgesChange={onGraphEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onInit={() => sendWs('join-graph', currentGraphId)}
              t={t}
            />
          ) : (
            <iframe
              title={activeTab.label}
              src={activeTab.url}
              className="absolute inset-0 h-full w-full border-0 bg-panel-bg"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </section>

      <PropertiesPanel
        selectedNode={isGraphTabActive ? (selectedNode as Node | undefined) : undefined}
        nodeTypeRegistry={nodeTypeRegistry}
        nodeValidationErrors={nodeValidationErrors}
        jsonSchemaDrafts={jsonSchemaDrafts}
        setJsonSchemaDrafts={setJsonSchemaDrafts}
        updateNodeProperty={updateNodeProperty}
        openAdvancedSchemaEditor={openAdvancedSchemaEditor}
      />

      <SchemaEditorModal
        advancedSchemaTarget={advancedSchemaTarget}
        schemaEditorFrameRef={schemaEditorFrameRef}
        schemaEditorFrameDoc={schemaEditorFrameDoc}
        schemaEditorFrameReady={schemaEditorFrameReady}
        schemaEditorFrameError={schemaEditorFrameError}
        closeModal={closeSchemaModal}
        applyAdvancedSchema={applyAdvancedSchema}
      />
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
