import { useClient } from '@/src/Client';

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'get': return 'text-emerald-500';
    case 'set': return 'text-amber-500';
    case 'del': return 'text-red-500';
    case 'add': return 'text-zinc-500';
    default: return 'text-blue-500';
  }
};

export function LogsWidget() {

  const client = useClient();


  return (
    <div className="h-full flex flex-col bg-transparent p-0" id="logs-widget">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/80">
        <input
          type="text"
          value={client.logKeyword}
          onChange={(event) => client.setLogKeyword(event.target.value)}
          placeholder="Filter by type or data"
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        />
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar" id="logs-table-container">
        <table className="w-full text-left border-collapse border-spacing-0" id="logs-table">
          <thead className="sticky top-0 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md z-10">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-24">Time</th>
              <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-24">Type</th>
              <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-24">Event/Table</th>
              <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {client.records.map((item) => (
              <tr
                key={item.id}
                className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <td className="px-4 py-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                  {formatTime(item.time)}
                </td>
                <td className={`px-4 py-2 font-mono text-[10px] font-bold tracking-tight uppercase ${getTypeColor(item.type)}`}>
                  {item.type}
                </td>
                <td className={`px-4 py-2 font-mono text-[10px] font-bold tracking-tight`}>
                  {(item.data as any).type || (item.data as any).table}
                </td>
                <td className="px-4 py-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {JSON.stringify(item.data)}
                </td>
              </tr>
            ))}
            {client.records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
                  No logs match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
