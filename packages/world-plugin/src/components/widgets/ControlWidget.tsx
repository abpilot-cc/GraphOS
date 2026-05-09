import { useEffect, useState, useRef } from 'react';
import { Clock, Activity, Play, Pause, RotateCcw, FastForward, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useClient } from '@/src/Client';

export function ControlWidget() {
  const lastUpdateRef = useRef<number>(0);
  const client = useClient();

  // useEffect(() => {
  //   let requestRef: number;

  //   const animate = (time: number) => {
  //     if (isPlaying) {
  //       if (lastUpdateRef.current !== 0) {
  //         const deltaTime = ((time - lastUpdateRef.current) / 1000) * timeScale;
  //         setGameTime(prev => {
  //           const nextTime = prev + deltaTime;
  //           setMaxGameTime(curr => Math.max(curr, nextTime));
  //           return nextTime;
  //         });
  //       }
  //       lastUpdateRef.current = time;
  //     } else {
  //       lastUpdateRef.current = 0;
  //     }
  //     requestRef = requestAnimationFrame(animate);
  //   };

  //   requestRef = requestAnimationFrame(animate);
  //   return () => cancelAnimationFrame(requestRef);
  // }, [isPlaying]);

  const handleReset = () => {
    lastUpdateRef.current = 0;
    if (client.socket) {
      client.socket.emit('world-reset');
    }
  };

  const setTimeScale = (scale: number) => {
    if (client.socket) {
      client.socket.emit('world-set-timescale', scale);
    }
  };

  const setFps = (fps: number) => {
    if (client.socket) {
      client.socket.emit('world-set-fps', fps);
    }
  };

  const setPlaying = () => {
    if (client.socket) {
      if (client.state.state === 'stopped') {
        client.socket.emit('world-start');
      } else if (client.state.state === 'running') {
        client.socket.emit('world-pause');
      } else {
        client.socket.emit('world-resume');
      }
    }
  };

  const setCurrent = (time: number) => {
    if (client.socket) {
      client.socket.emit('world-set-current', time);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
  };

  return (
    <div className="h-full flex flex-col px-4 py-2 bg-transparent rounded-b-xl">
      <div className="flex items-center gap-12 flex-1">
        {/* Playback Controls */}
        <div className="flex flex-col" id="playback-controls">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest leading-none mb-1 flex items-center gap-1">
            <Activity size={10} />
            Simulation
          </span>
          <div className="flex items-center gap-2">
            <motion.button
              id="btn-play-pause"
              whileTap={{ scale: 0.95 }}
              onClick={setPlaying}
              className={`p-1.5 rounded-lg flex items-center gap-2 px-3 font-bold text-xs uppercase tracking-wider transition-all duration-300 ${client.state.state === 'running'
                ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)]'
                }`}
            >
              {client.state.state === 'running' ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              {client.state.state === 'running' ? 'Pause' : 'Start'}
            </motion.button>

            <motion.button
              id="btn-reset"
              whileTap={{ scale: 0.95 }}
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              title="Reset Simulation"
            >
              <RotateCcw size={12} />
            </motion.button>
          </div>
        </div>

        {/* Settings Inputs */}
        <div className="flex items-center gap-8" id="sim-settings">
          {/* FPS Input */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest leading-none mb-1 flex items-center gap-1">
              <FastForward size={10} />
              Sim Precision
            </span>
            <div className="flex items-center gap-3 group">
              <input
                id="input-fps"
                type="number"
                value={client.state.fps}
                onChange={(e) => setFps(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-0.5 text-xs font-mono w-16 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-zinc-900 dark:text-zinc-100 text-center"
              />
              <span className="text-[10px] text-zinc-400 group-focus-within:text-blue-500 font-bold">FPS</span>
            </div>
          </div>

          {/* Time Scale Input */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest leading-none mb-1 flex items-center gap-1">
              <TrendingUp size={10} />
              Time Scale
            </span>
            <div className="flex items-center gap-3 group">
              <input
                id="input-timescale"
                type="number"
                step="0.1"
                min="0"
                value={client.state.scale}
                onChange={(e) => setTimeScale(Math.max(0, parseFloat(e.target.value) || 0))}
                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-0.5 text-xs font-mono w-16 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-zinc-900 dark:text-zinc-100 text-center"
              />
              <span className="text-[10px] text-zinc-400 group-focus-within:text-blue-500 font-bold text-xs">x</span>
            </div>
          </div>
        </div>

        {/* Timeline Scrubbing */}
        <div className="flex-1 flex flex-col px-4" id="sim-timeline">
          <span className={`text-[10px] uppercase font-bold tracking-widest leading-none mb-2 flex items-center gap-1 transition-colors ${client.state.state === 'running' ? 'text-zinc-400' : 'text-blue-500/70'}`}>
            <TrendingUp size={10} />
            {client.state.state === 'running' ? 'Simulation Running' : 'Seek Timeline'}
          </span>
          <div className="relative flex items-center group">
            <input
              id="slider-timeline"
              type="range"
              min="0"
              max={client.state.state === 'running' ? 100 : (client.state.duration || 0.01)}
              step="0.01"
              value={client.state.state === 'running' ? 100 : client.state.current}
              disabled={client.state.state === 'running'}
              onChange={(e) => setCurrent(parseFloat(e.target.value))}
              className={`w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none transition-all ${client.state.state === 'running'
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer accent-blue-500 hover:accent-blue-600'
                }`}
            />
            <div
              className={`absolute left-0 h-1.5 rounded-l-lg pointer-events-none transition-all ${client.state.state === 'running' ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${client.state.state === 'running' ? 100 : (client.state.duration > 0 ? (client.state.current / client.state.duration) * 100 : 0)}%` }}
            />
          </div>
        </div>

        {/* Game Clock Display */}
        <div className="flex flex-col items-start ml-auto" id="sim-clock">
          <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-widest leading-none mb-1 flex items-center gap-1">
            <Clock size={10} />
            Runtime
          </span>
          <div className="bg-zinc-100 dark:bg-black rounded-lg px-3 py-0.5 border border-zinc-200 dark:border-zinc-800 shadow-inner">
            <span className="text-base font-mono text-emerald-600 dark:text-emerald-500 tabular-nums font-bold tracking-tight glow-text-emerald">
              {formatTime(client.state.current)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
