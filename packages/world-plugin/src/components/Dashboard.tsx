import React, { useState, useEffect, useRef } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { WidgetContainer } from './WidgetContainer';
import { useLayoutHistory } from '../hooks/useLayoutHistory';
import { useTheme } from '../hooks/useTheme';
import {
  Undo2, Redo2, RotateCcw, Moon, Sun, Plus
} from 'lucide-react';
import { useClient } from '../Client';

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function Dashboard() {
  const { state, updateState, undo, redo, reset, canUndo, canRedo } = useLayoutHistory();
  const { theme, toggleTheme } = useTheme();
  const client = useClient();
  const [localLayouts, setLocalLayouts] = useState(state.layouts);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Sync local layouts when state changes (e.g., undo/redo)
  useEffect(() => {
    setLocalLayouts(state.layouts);
  }, [state.layouts]);

  const onLayoutChange = (currentLayout: any, allLayouts: any) => {
    setLocalLayouts(allLayouts);
  };

  const commitLayout = () => {
    updateState({
      ...state,
      layouts: localLayouts,
    });
  };

  return (
    <div
      ref={dashboardRef}
      className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 overflow-x-hidden"
    >
      <header className="w-full mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={client.isConnected ? "w-2 h-2 rounded-full bg-blue-500 animate-pulse" : "w-2 h-2 rounded-full bg-red-500"} />
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-400 dark:text-zinc-600">System Live</span>
          </div>
          <h1 className="text-4xl font-light tracking-tight uppercase">WORLD</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Theme */}
          {/* <div className="flex bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 shadow-sm transition-colors h-10 items-center">
            <button
              onClick={toggleTheme}
              className="p-2 h-8 w-8 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-zinc-600 dark:text-zinc-400"
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div> */}

          {/* Undo/Redo */}
          <div className="flex bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 shadow-sm transition-colors h-10 items-center">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 h-8 w-8 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-20 rounded-md transition-colors text-zinc-600 dark:text-zinc-400"
              title="Undo"
            >
              <Undo2 size={18} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 h-8 w-8 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-20 rounded-md transition-colors text-zinc-600 dark:text-zinc-400"
              title="Redo"
            >
              <Redo2 size={18} />
            </button>
          </div>

          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 h-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-lg shadow-sm font-medium text-sm transition-all active:scale-95 text-zinc-600 dark:text-zinc-400"
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </header>

      <main className="w-full origin-top transition-transform duration-300 ease-out">
        <ResponsiveGridLayout
          className="layout"
          layouts={localLayouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={80}
          draggableHandle=".cursor-move"
          onLayoutChange={onLayoutChange}
          onDragStop={commitLayout}
          onResizeStop={commitLayout}
          margin={[20, 20]}
        >
          {state.widgets.map((widget) => (
            <WidgetContainer key={widget.id} widget={widget} />
          ))}
        </ResponsiveGridLayout>
      </main>

      <footer className="w-full mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-[10px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
        <span>&copy; 2026 Dash System</span>
        <div className="flex gap-4">
          <span>Storage: Local</span>
          <span>Status: Synchronized</span>
        </div>
      </footer>
    </div>
  );
}
