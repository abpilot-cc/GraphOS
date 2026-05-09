import { Activity } from 'lucide-react';
import { ITable, useClient, ClientContextValue, IObject } from '@/src/Client';
import { useMemo, useState } from 'react';


function showValue(value: any): string {
  const t = typeof value;
  if (t === 'object') {
    if (Array.isArray(value)) {
      return '[...]';
    } else {
      return '{...}';
    }
  }
  if (t === 'number') {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(4);
  }
  return String(value);
}

function TableView({ table, client }: { table: ITable, client: ClientContextValue }) {
  const vs = client.objectSet.get(table.name);
  const rows: IObject[] = vs ? vs[0] : [];
  const keys = table.keys;

  return <div className="flex-1 overflow-auto" id="market-table-container">
    <table className="w-full text-left border-collapse" id="market-table">
      <thead className="sticky top-0 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-sm z-20">
        <tr className="border-b border-zinc-100 dark:border-zinc-800">
          <th className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold">ID</th>
          {keys.map((key) => (
            <th key={key} className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-semibold">
              {key}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
        {rows.map((item) => (
          <tr key={item.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
            <td className={`px-4 py-3 text-xs font-medium cursor-pointer relative transition-all ${client.focusObject && client.focusObject[0].id === item.id && client.focusObject[1] === 'id' ? 'bg-blue-500' : 'text-zinc-700 dark:text-zinc-300'}`} onClick={() => client.setFocusObject([item, 'id'])}>
              {item.id}
            </td>
            {keys.map((key) => (
              <td
                key={key}
                className={`px-4 py-3 text-xs font-medium cursor-pointer relative transition-all ${client.focusObject && client.focusObject[0].id === item.id && client.focusObject[1] === key ? 'bg-blue-500' : 'text-zinc-700 dark:text-zinc-300'}`}
                onClick={() => client.setFocusObject([item, key])}
              >
                {showValue((item as any)[key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
}

export function RealTimeTable() {

  const client = useClient();
  const [selectedTableName, setSelectedTableName] = useState<string>(client.tables[0]?.name || '');

  const table = useMemo(() => {

    if (client.tables.length === 0) {
      return null;
    }

    let table = client.tables.find((t) => t.name === selectedTableName);
    if (!table) {
      table = client.tables[0];
      setSelectedTableName(table.name);
    }
    return table;

  }, [selectedTableName, client.tables]);

  return (
    <div className="h-full flex flex-col pt-4 overflow-auto custom-scrollbar">
      <div className="px-4 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-blue-500 animate-pulse" />
          <select
            id="select-device"
            value={selectedTableName}
            onChange={(e) => setSelectedTableName(e.target.value)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-[10px] font-mono focus:outline-none text-zinc-600 dark:text-zinc-400 cursor-pointer hover:border-blue-500 transition-colors"
          >
            {client.tables.map((table) => <option key={table.name} value={table.name}>{table.name}</option>)}
          </select>

        </div>
      </div>
      {table && <TableView key={table.name} table={table} client={client} />}
    </div>
  );
}
