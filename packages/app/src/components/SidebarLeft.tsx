import type React from 'react';

import { Activity, Copy, History, Languages, Moon, Pencil, Plus, RotateCcw, Sun, Trash2, Zap } from 'lucide-react';

import type { GraphHistoryEntry, NodeType } from '../types/graph';
import { getNodeTypeColor, hexToRgba } from '../utils/nodeType';

interface GraphInfo {
  id: string;
  name: string;
}

interface SidebarLeftProps {
  t: (key: string) => string;
  graphList: GraphInfo[];
  currentGraphId: string;
  editingGraphId: string | null;
  tempGraphName: string;
  setTempGraphName: (name: string) => void;
  createNewGraph: () => void;
  setCurrentGraphId: (id: string) => void;
  duplicateGraph: (id: string, e: React.MouseEvent) => void;
  startRenaming: (graph: GraphInfo, e: React.MouseEvent) => void;
  submitRename: (id: string) => void;
  deleteGraph: (id: string, e: React.MouseEvent) => void;
  graphHistory: GraphHistoryEntry[];
  restoringHistoryId: string | null;
  restoreHistory: (recordId: string) => void;
  nodeTypeRegistry: NodeType[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  language: string;
  changeLanguage: (lang: string) => void;
}

export default function SidebarLeft({
  t,
  graphList,
  currentGraphId,
  editingGraphId,
  tempGraphName,
  setTempGraphName,
  createNewGraph,
  setCurrentGraphId,
  duplicateGraph,
  startRenaming,
  submitRename,
  deleteGraph,
  graphHistory,
  restoringHistoryId,
  restoreHistory,
  nodeTypeRegistry,
  theme,
  toggleTheme,
  language,
  changeLanguage,
}: SidebarLeftProps) {
  return (
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
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">{t('sidebar.graphs')}</h2>
            <button onClick={createNewGraph} className="p-1 hover:bg-canvas-bg rounded text-text-secondary transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {graphList.map((g) => (
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
                    <button onClick={(e) => duplicateGraph(g.id, e)} className="p-1 hover:bg-black/10 rounded transition-colors text-current" title={t('sidebar.duplicate')}>
                      <Copy className="w-3 h-3" />
                    </button>
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
                      y: event.clientY - rect.top,
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

        <div>
          <div className="flex items-center gap-2 mb-4 px-2">
            <History className="w-3 h-3 text-text-secondary" />
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">{t('sidebar.history')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {graphHistory.length === 0 && (
              <div className="text-xs text-text-secondary px-2 py-3 rounded-lg border border-panel-border bg-canvas-bg/50">
                {t('sidebar.history_empty')}
              </div>
            )}

            {graphHistory.map((entry) => {
              const isRestoring = restoringHistoryId === entry.id;
              const displayTitle = entry.title || entry.summary || entry.source;
              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-panel-border p-2.5 bg-canvas-bg/35"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-text-primary leading-snug break-words">{displayTitle}</div>
                      {!!entry.summary && (
                        <div className="text-[10px] text-text-secondary mt-1 truncate">{entry.summary}</div>
                      )}
                      <div className="text-[10px] text-text-secondary truncate">{entry.source}</div>
                    </div>
                    <button
                      onClick={() => restoreHistory(entry.id)}
                      disabled={isRestoring}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-panel-border hover:bg-panel-bg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {isRestoring ? t('sidebar.restoring') : t('sidebar.restore')}
                    </button>
                  </div>
                  <div className="text-[10px] text-text-secondary mt-1.5">
                    {new Date(entry.createdAt).toLocaleString()}
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
              value={language}
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
  );
}
