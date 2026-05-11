import { Layout } from 'react-grid-layout';

export interface Widget {
  id: string;
  type: 'table' | 'json' | 'control' | 'logs' | 'ipad' | 'send-event' | 'device-list';
  title: string;
}

export interface DashboardState {
  layouts: { [key: string]: Layout[] };
  widgets: Widget[];
}
