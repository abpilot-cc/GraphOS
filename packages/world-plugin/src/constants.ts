import { DashboardState, Widget } from './types';

export const DEFAULT_LAYOUTS: { [key: string]: any[] } = {
  lg: [
    { "w": 12, "h": 1, "x": 0, "y": 0, "i": "control-1" },
    { "w": 4, "h": 5, "x": 4, "y": 1, "i": "send-event-1" },
    { "w": 4, "h": 5, "x": 8, "y": 6, "i": "json-1" },
    { "w": 12, "h": 2, "x": 0, "y": 16, "i": "logs-1" },
    { "w": 4, "h": 5, "x": 8, "y": 1, "i": "table-1" },
    { "w": 4, "h": 10, "x": 0, "y": 1, "i": "ipad-1" },
    { "w": 4, "h": 5, "x": 4, "y": 6, "i": "device-list-1" }
  ],
};

export const INITIAL_WIDGETS: Widget[] = [

  { id: 'control-1', type: 'control', title: 'Simulation Control' },
  { id: 'send-event-1', type: 'send-event', title: 'Send Event' },
  { id: 'json-1', type: 'json', title: 'Live Simulation Data' },
  { id: 'logs-1', type: 'logs', title: 'System Logs' },
  { id: 'table-1', type: 'table', title: 'Live Market Feed' },
  { id: 'ipad-1', type: 'ipad', title: 'iPad Simulator' },
  { id: 'device-list-1', type: 'device-list', title: 'Devices' },

];

export const INITIAL_STATE: DashboardState = {
  layouts: DEFAULT_LAYOUTS,
  widgets: INITIAL_WIDGETS,
};

export const STORAGE_KEY = 'dashboard-layout-v2';
