import { useEffect, useMemo, useState } from 'react';
import { Activity, Code, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useClient } from '@/src/Client';

function JsonValueField({ value, isUpdated }: { value: any, isUpdated: boolean }) {
  const isNumber = typeof value === 'number';
  const isBoolean = typeof value === 'boolean';
  const isString = typeof value === 'string';

  return (
    <motion.span
      initial={false}
      animate={isUpdated ? {
        color: ['#3b82f6', '#2563eb', '#3b82f6'],
        backgroundColor: ['rgba(59, 130, 246, 0)', 'rgba(59, 130, 246, 0.2)', 'rgba(59, 130, 246, 0)'],
        scale: [1, 1.05, 1],
      } : { color: 'inherit', backgroundColor: 'transparent', scale: 1 }}
      transition={{ duration: 0.6 }}
      className={`px-1 rounded font-mono inline-block ${isNumber ? 'text-blue-600 dark:text-blue-400' :
        isBoolean ? 'text-purple-600 dark:text-purple-400' :
          isString ? 'text-emerald-600 dark:text-emerald-300' : 'text-zinc-700 dark:text-zinc-300'
        }`}
    >
      {isString ? `"${value}"` : String(value)}
    </motion.span>
  );
}

function RecursiveJsonNode({
  value,
  name,
  path,
  changedPaths,
  isLast = true
}: {
  value: any,
  name?: string,
  path: string,
  changedPaths: Set<string>,
  isLast?: boolean
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  if (!isObject) {
    return (
      <div className="flex items-start py-0.5 group">
        {name && <span className="text-zinc-500 mr-2 italic">"{name}":</span>}
        <JsonValueField value={value} isUpdated={changedPaths.has(path)} />
        {!isLast && <span className="text-zinc-600">,</span>}
      </div>
    );
  }

  const keys = Object.keys(value);
  const isEmpty = keys.length === 0;

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setIsOpen(!isOpen)} id={`json-node-${path}`}>
        {!isEmpty && (
          <span className="text-zinc-600 group-hover:text-zinc-400">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
        {name && <span className="text-zinc-500 italic">"{name}":</span>}
        <span className="text-zinc-600">{isArray ? '[' : '{'}</span>
        {!isOpen && <span className="text-zinc-700 mx-1">...</span>}
        {!isOpen && <span className="text-zinc-600">{isArray ? ']' : '}'}{!isLast && ','}</span>}
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-l border-zinc-800/50 ml-2 pl-4"
          >
            {keys.map((key, index) => (
              <RecursiveJsonNode
                key={key}
                name={isArray ? undefined : key}
                value={value[key]}
                path={path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key}
                changedPaths={changedPaths}
                isLast={index === keys.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {isOpen && <div className="text-zinc-600">{isArray ? ']' : '}'}{!isLast && ','}</div>}
    </div>
  );
}

export function JsonLiveWidget() {

  const client = useClient();

  const data = useMemo(() => {
    if (client.focusObject) {
      return JSON.stringify((client.focusObject[0] as any)[client.focusObject[1]], null, 2);
    }
    return '{}';
  }, [client.focusObject]);

  const path = useMemo(() => {
    if (client.focusObject) {
      const [obj, key] = client.focusObject;
      return `${obj.table}#${obj.id}.${key}`;
    }
    return '';
  }, [client.focusObject]);


  return (
    <div className="p-5 h-full flex flex-col font-mono bg-transparent rounded-b-xl overflow-hidden text-[11px] leading-relaxed">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-2" id="json-monitor-header">
        <div className="flex items-center gap-2">
          <Code size={12} className="text-blue-600 dark:text-blue-500" />
          <span className="text-[10px] font-bold tracking-widest text-zinc-500">{path}</span>
        </div>
      </div>

      <pre className="flex-1 overflow-auto custom-scrollbar pr-4">
        {data}
      </pre>

    </div>
  );
}
