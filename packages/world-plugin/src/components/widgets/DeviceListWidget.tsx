import { Activity } from 'lucide-react';
import { useClient } from '@/src/Client';



export function DeviceListWidget() {

  const client = useClient();

  return (
    <div className="h-full flex flex-col pt-4 overflow-auto custom-scrollbar">
      <div className="px-4 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-blue-500 animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Devices</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto" id="market-table-container">
        <table className="w-full text-left border-collapse" id="market-table">
          <thead className="sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-sm z-20">
            <tr className="border-b border-zinc-100 dark:border-zinc-800">
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold">ID</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold">TYPE</th>
              <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold">PLATFORM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
            {client.devices.map((item) => (
              <tr key={item.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                <td className="px-4 py-3 text-xs font-medium cursor-pointer relative transition-all text-zinc-700 dark:text-zinc-300">
                  {item.id}
                </td>
                <td className="px-4 py-3 text-xs font-medium cursor-pointer relative transition-all text-zinc-700 dark:text-zinc-300">
                  {item.type}
                </td>
                <td className="px-4 py-3 text-xs font-medium cursor-pointer relative transition-all text-zinc-700 dark:text-zinc-300">
                  {item.platform}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
