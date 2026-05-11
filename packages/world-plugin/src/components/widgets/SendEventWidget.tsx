import { useCallback, useEffect, useMemo, useState } from 'react';
import { Send, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useClient } from '@/src/Client';
import { INode } from 'graphos-core';



type Event = {
    id: string;
    type: string;
    data: any;
};

function generateDefaultFromSchema(schema: any): any {
    if (!schema) return null;

    try {
        // If schema is a string, parse it as JSON
        let parsedSchema = schema;
        if (typeof schema === 'string') {
            parsedSchema = JSON.parse(schema);
        }

        // If parsed schema has a default value, use it
        if (parsedSchema.default !== undefined) {
            return parsedSchema.default;
        }

        // Handle different schema types
        switch (parsedSchema.type) {
            case 'string':
                return '';
            case 'number':
            case 'integer':
                return 0;
            case 'boolean':
                return false;
            case 'array':
                // If items schema exists, generate one default item
                if (parsedSchema.items) {
                    return [generateDefaultFromSchema(parsedSchema.items)];
                }
                return [];
            case 'object':
                // Generate default values for all properties
                const obj: any = {};
                if (parsedSchema.properties) {
                    for (const [key, propSchema] of Object.entries(parsedSchema.properties)) {
                        obj[key] = generateDefaultFromSchema(propSchema);
                    }
                }
                return obj;
            case 'null':
                return null;
            default:
                // If no type specified, try to infer from properties
                if (parsedSchema.properties) {
                    const obj: any = {};
                    for (const [key, propSchema] of Object.entries(parsedSchema.properties)) {
                        obj[key] = generateDefaultFromSchema(propSchema);
                    }
                    return obj;
                }
                return null;
        }
    } catch (error) {
        console.error('Error generating default value from schema:', error);
        return null;
    }
}

function getDefaultValue(variantNode: INode): any {
    try {
        const type = variantNode.properties.type;
        switch (type) {
            case 'string':
                return '';
            case 'number':
                return 0;
            case 'integer':
                return 0;
            case 'float':
                return 0;
            case 'boolean':
                return false;
            case 'array':
                return [];
            case 'object':
                return {};
            case 'JSONSchema':
                if (variantNode.properties.jsonSchema) {
                    return generateDefaultFromSchema(variantNode.properties.jsonSchema);
                }
                return null;
            default:
                return null;
        }
    } catch (error) {
        console.error('Error getting default value:', error);
        return null;
    }
}

export function SendEventWidget() {
    const [isValidJson, setIsValidJson] = useState<boolean>(true);
    const [inputEventData, setInputEventData] = useState<string | undefined>();
    const client = useClient();

    const events = useMemo(() => {
        let events: Event[] = [];

        try {
            if (client.graph) {
                let nodeSet = new Map<string, INode>();
                for (const node of client.graph.nodes) {
                    nodeSet.set(node.id, node);
                    if (node.type === 'Event') {
                        events.push({
                            id: node.id,
                            type: node.properties.name || 'Event',
                            data: {
                                "type": node.properties.name || 'Event',
                            }
                        });
                    }
                }
                for (let event of events) {
                    for (let edge of client.graph.edges) {
                        if (edge[0] === event.id) {
                            let node = nodeSet.get(edge[1]);
                            if (node && node.type === 'Variant') {
                                event.data[node.properties.name] = getDefaultValue(node);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error building events from graph:', error);
        }

        return events;
    }, [client.graph]);

    const [selectedEventType, setSelectedEventType] = useState<string>(events.length > 0 ? events[0].id : '');

    useEffect(() => {

        if (selectedEventType === '' && events.length > 0) {
            setSelectedEventType(events[0].id);
        }

    }, [events, selectedEventType]);

    const eventData = useMemo(() => {

        let event = events.find(e => e.id === selectedEventType);
        if (event) {
            return JSON.stringify(event.data, null, 2);
        }
        return '{\n  \n}';

    }, [selectedEventType, events]);

    const handleEventDataChange = (value: string) => {
        setInputEventData(value);
        try {
            JSON.parse(value);
            setIsValidJson(true);
        } catch (e) {
            setIsValidJson(false);
        }
    };

    const handleSendEvent = useCallback(() => {
        if (!isValidJson) return;

        try {
            const data = JSON.parse(inputEventData || eventData || '{}');
            client.emit('world-send-event', data);
        } catch (e) {
            console.error('Error parsing JSON or sending event:', e);
        }
    }, [isValidJson, inputEventData, eventData, client]);

    return (
        <div className="h-full flex flex-col px-4 py-2 bg-transparent rounded-b-xl gap-3">
            {/* Header */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest leading-none flex items-center gap-1">
                    <Zap size={10} />
                    Send Event
                </span>
            </div>

            {/* Event Type Selector */}
            <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-bold text-zinc-500 dark:text-zinc-400 tracking-wider">
                    Event Type
                </label>
                <select
                    value={selectedEventType}
                    onChange={(e) => setSelectedEventType(e.target.value)}
                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-zinc-900 dark:text-zinc-100 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600"
                >
                    {events.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.type}
                        </option>
                    ))}
                </select>
            </div>

            {/* JSON Input */}
            <div className="flex flex-col gap-1 flex-1 min-h-0">
                <div className="flex items-center justify-between">
                    <label className="text-[9px] uppercase font-bold text-zinc-500 dark:text-zinc-400 tracking-wider">
                        Event Data (JSON)
                    </label>
                    {!isValidJson && (
                        <span className="text-[9px] font-semibold text-red-500 dark:text-red-400">
                            Invalid JSON
                        </span>
                    )}
                </div>
                <textarea
                    value={inputEventData || eventData || ''}
                    onChange={(e) => handleEventDataChange(e.target.value)}
                    className={`flex-1 bg-white dark:bg-zinc-800 border-2 rounded px-3 py-2 text-xs font-mono focus:outline-none transition-all resize-none font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 ${isValidJson
                        ? 'border-zinc-200 dark:border-zinc-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
                        : 'border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        }`}
                    placeholder='{\n  "key": "value"\n}'
                />
            </div>

            {/* Send Button */}
            <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleSendEvent}
                disabled={!isValidJson}
                className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all duration-300 ${isValidJson
                    ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-[0_4px_12px_rgba(59,130,246,0.3)] cursor-pointer'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed opacity-50'
                    }`}
            >
                <Send size={12} />
                Send Event
            </motion.button>
        </div>
    );
}
