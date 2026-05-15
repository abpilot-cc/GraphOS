import { useEffect, useState, useRef, useMemo } from 'react';
import { Tablet, Smartphone as Phone, RefreshCw, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type DeviceType = 'iPhone 17' | 'iPhone Pro 17' | 'iPad 17' | 'iPad Pro 17' | 'Pixel 8 Pro' | 'Galaxy S24 Ultra' | 'Pixel Tablet' | 'Galaxy Tab S9';
type Orientation = 'portrait' | 'landscape-left' | 'landscape-right';

const DEVICE_STORAGE_KEY = 'simulator-device';
const ORIENTATION_STORAGE_KEY = 'simulator-orientation';
const DEVICE_INFO_CHANGE_EVENT = 'simulator-device-info-change';

const ORIENTATIONS: Orientation[] = ['portrait', 'landscape-left', 'landscape-right'];

const isValidDevice = (value: string): value is DeviceType => value in DEVICES;
const isValidOrientation = (value: string): value is Orientation => ORIENTATIONS.includes(value as Orientation);

const DEVICES: Record<DeviceType, {
  width: number,
  height: number,
  isTablet: boolean,
  safeArea: {
    portrait: { t: number, r: number, b: number, l: number },
    landscape: { side: number, bottom: number, top: number }
  }
}> = {
  'iPhone 17': {
    width: 390, height: 844, isTablet: false,
    safeArea: {
      portrait: { t: 47, r: 0, b: 34, l: 0 },
      landscape: { side: 47, bottom: 21, top: 0 }
    }
  },
  'iPhone Pro 17': {
    width: 430, height: 932, isTablet: false,
    safeArea: {
      portrait: { t: 47, r: 0, b: 34, l: 0 },
      landscape: { side: 47, bottom: 21, top: 0 }
    }
  },
  'iPad 17': {
    width: 810, height: 1080, isTablet: true,
    safeArea: {
      portrait: { t: 24, r: 0, b: 20, l: 0 },
      landscape: { side: 0, bottom: 20, top: 24 }
    }
  },
  'iPad Pro 17': {
    width: 1024, height: 1366, isTablet: true,
    safeArea: {
      portrait: { t: 24, r: 0, b: 20, l: 0 },
      landscape: { side: 0, bottom: 20, top: 24 }
    }
  },
  'Pixel 8 Pro': {
    width: 448, height: 998, isTablet: false,
    safeArea: {
      portrait: { t: 32, r: 0, b: 24, l: 0 },
      landscape: { side: 32, bottom: 16, top: 0 }
    }
  },
  'Galaxy S24 Ultra': {
    width: 384, height: 832, isTablet: false,
    safeArea: {
      portrait: { t: 28, r: 0, b: 24, l: 0 },
      landscape: { side: 28, bottom: 16, top: 0 }
    }
  },
  'Pixel Tablet': {
    width: 800, height: 1280, isTablet: true,
    safeArea: {
      portrait: { t: 24, r: 0, b: 48, l: 0 },
      landscape: { side: 0, bottom: 48, top: 24 }
    }
  },
  'Galaxy Tab S9': {
    width: 800, height: 1600, isTablet: true,
    safeArea: {
      portrait: { t: 24, r: 0, b: 48, l: 0 },
      landscape: { side: 0, bottom: 48, top: 24 }
    }
  },
};

export function IPadSimulator() {
  const [device, setDevice] = useState<DeviceType>(() => {
    if (typeof window === 'undefined') return 'iPad Pro 17';
    const savedDevice = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    return savedDevice && isValidDevice(savedDevice) ? savedDevice : 'iPad Pro 17';
  });
  const [orientation, setOrientation] = useState<Orientation>(() => {
    if (typeof window === 'undefined') return 'portrait';
    const savedOrientation = window.localStorage.getItem(ORIENTATION_STORAGE_KEY);
    return savedOrientation && isValidOrientation(savedOrientation) ? savedOrientation : 'portrait';
  });
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [url] = useState('/app/');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerSize({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, device);
  }, [device]);

  useEffect(() => {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, orientation);
  }, [orientation]);

  const currentDevice = DEVICES[device];
  const isLandscape = orientation !== 'portrait';

  // Physical dimensions for scaling calculation
  const physWidth = isLandscape ? currentDevice.height : currentDevice.width;
  const physHeight = isLandscape ? currentDevice.width : currentDevice.height;

  // Calculate safe area based on orientation
  const getSafeArea = () => {
    if (orientation === 'portrait') return currentDevice.safeArea.portrait;
    if (orientation === 'landscape-left') {
      return {
        t: currentDevice.safeArea.landscape.top,
        r: 0,
        b: currentDevice.safeArea.landscape.bottom,
        l: currentDevice.safeArea.landscape.side
      };
    }
    return {
      t: currentDevice.safeArea.landscape.top,
      r: currentDevice.safeArea.landscape.side,
      b: currentDevice.safeArea.landscape.bottom,
      l: 0
    };
  };

  const currentSafeArea = useMemo(() => getSafeArea(), [orientation, currentDevice]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(DEVICE_INFO_CHANGE_EVENT, {
      detail: {
        device,
        orientation,
        size: {
          width: physWidth,
          height: physHeight,
          isTablet: currentDevice.isTablet,
        },
        safeArea: currentSafeArea,
      }
    }));
  }, [device, orientation, physWidth, physHeight, currentDevice.isTablet, currentSafeArea]);

  // Calculate scale to fit in container
  const padding = 64;
  const availableWidth = Math.max(containerSize.width - padding, 1);
  const availableHeight = Math.max(containerSize.height - padding, 1);
  const fitScale = Math.min(
    availableWidth / physWidth,
    availableHeight / physHeight,
  );
  const maxScale = isLandscape ? 1.6 : 1;
  const scale = containerSize.width > 0 && containerSize.height > 0
    ? Math.max(0.1, Math.min(fitScale, maxScale))
    : 0.1;

  const cycleOrientation = () => {
    const currentIndex = ORIENTATIONS.indexOf(orientation);
    setOrientation(ORIENTATIONS[(currentIndex + 1) % ORIENTATIONS.length]);
  };

  return (
    <div className="h-full flex flex-col bg-transparent p-4">
      <div className="flex items-center justify-between mb-4 px-2 z-10" id="simulator-controls">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {currentDevice.isTablet ? <Tablet size={14} className="text-blue-500" /> : <Phone size={14} className="text-blue-500" />}
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Device</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              id="select-device"
              value={device}
              onChange={(e) => setDevice(e.target.value as DeviceType)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-[10px] font-mono focus:outline-none text-zinc-600 dark:text-zinc-400 cursor-pointer hover:border-blue-500 transition-colors"
            >
              {Object.keys(DEVICES).map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <button
              id="btn-cycle-orientation"
              onClick={cycleOrientation}
              className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-blue-500 transition-colors flex items-center gap-2"
              title="Cycle Orientation"
            >
              <RefreshCw size={12} className={
                orientation === 'landscape-left' ? 'rotate-90 transition-transform' :
                  orientation === 'landscape-right' ? '-rotate-90 transition-transform' :
                    'transition-transform'
              } />
              <span className="text-[9px] uppercase font-bold min-w-[70px] text-left">{orientation.replace('-', ' ')}</span>
            </button>

            <button
              id="btn-toggle-safe-area"
              onClick={() => setShowSafeArea(!showSafeArea)}
              className={`p-1.5 rounded border flex items-center gap-2 transition-all ${showSafeArea
                ? 'bg-blue-500/10 border-blue-500/50 text-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-blue-500'
                }`}
              title="Toggle Safe Area"
            >
              <Shield size={12} fill={showSafeArea ? "currentColor" : "none"} />
              <span className="text-[9px] uppercase font-bold">Safe Area</span>
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-black/5 dark:bg-white/5 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50" id="simulator-display">
        <motion.div
          animate={{
            scale,
            width: physWidth,
            height: physHeight,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            transformOrigin: 'center center',
          }}
          className="relative rounded-[3rem] p-4 shadow-2xl flex flex-col flex-shrink-0 transition-all duration-500 border-[12px] bg-white border-zinc-300 text-zinc-900 shadow-zinc-200 dark:bg-zinc-900 dark:border-zinc-950 dark:text-white dark:shadow-black/50"
        >
          {/* Hardware Elements: Camera / Notch / Dynamic Island */}
          <div
            className={`absolute z-20 flex items-center justify-center transition-all duration-500 bg-zinc-300 dark:bg-zinc-950
              ${orientation === 'portrait' ? 'top-4 left-1/2 -translate-x-1/2 w-32 h-8 rounded-full' :
                orientation === 'landscape-left' ? 'left-4 top-1/2 -translate-y-1/2 w-8 h-32 rounded-full' :
                  'right-4 top-1/2 -translate-y-1/2 w-8 h-32 rounded-full'}`}
          >
            <div className="w-2 h-2 rounded-full opacity-50 bg-zinc-400 dark:bg-zinc-800" />
          </div>

          <div className="flex-1 bg-white rounded-[2rem] overflow-hidden relative shadow-inner">
            <iframe
              src={url}
              className="w-full h-full border-none"
              title="Device Simulator View"
            />

            {/* Safe Area Visualization */}
            <AnimatePresence>
              {showSafeArea && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 pointer-events-none z-30"
                >
                  {/* Top Safe Area */}
                  <div style={{ height: currentSafeArea.t }} className="absolute top-0 left-0 w-full bg-red-500/10 border-b border-red-500/30 flex items-center justify-center">
                    {currentSafeArea.t > 0 && <span className="text-[8px] text-red-500 font-bold opacity-30">{currentSafeArea.t}px</span>}
                  </div>
                  {/* Bottom Safe Area */}
                  <div style={{ height: currentSafeArea.b }} className="absolute bottom-0 left-0 w-full bg-red-500/10 border-t border-red-500/30 flex items-center justify-center">
                    {currentSafeArea.b > 0 && <span className="text-[8px] text-red-500 font-bold opacity-30">{currentSafeArea.b}px</span>}
                  </div>
                  {/* Left Safe Area */}
                  <div style={{ width: currentSafeArea.l }} className="absolute top-0 left-0 h-full bg-red-500/10 border-r border-red-500/30 flex items-center justify-center">
                    {currentSafeArea.l > 0 && <span className="text-[8px] text-red-500 font-bold opacity-30 rotate-90">{currentSafeArea.l}px</span>}
                  </div>
                  {/* Right Safe Area */}
                  <div style={{ width: currentSafeArea.r }} className="absolute top-0 right-0 h-full bg-red-500/10 border-l border-red-500/30 flex items-center justify-center">
                    {currentSafeArea.r > 0 && <span className="text-[8px] text-red-500 font-bold opacity-90 rotate-90">{currentSafeArea.r}px</span>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* <div className="absolute inset-0 bg-black/5 pointer-events-none flex items-center justify-center">
              <span className="text-xl text-zinc-400 font-mono opacity-20 select-none tracking-[0.5em] uppercase">Simulated View</span>
            </div> */}
          </div>

          <div className={`flex items-center justify-center p-2 transition-all duration-500 
            ${orientation === 'portrait' ? '' :
              orientation === 'landscape-left' ? 'absolute right-2 top-1/2 -translate-y-1/2 h-full' :
                'absolute left-2 top-1/2 -translate-y-1/2 h-full'}`}>
            <div className={`rounded-full transition-colors ${orientation === 'portrait' ? 'w-32 h-1' : 'w-1 h-32'} 
               bg-zinc-200 dark:bg-zinc-800/20`} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
