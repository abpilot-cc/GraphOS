import { IGraph, INode } from 'graphos-core';
import React, { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export type ClientContextValue = {
    socket: Socket | null;
    isConnected: boolean;
    state: ClientState;
    graph: IGraph | null;
    records: AppRecord[];
    tables: ITable[];
    objectSet: Map<string, [IObject[], Map<string, IObject>]>
    focusObject: [IObject, string] | null;
    setFocusObject: (v: [IObject, string] | null) => void;
};

export type ClientState = {
    duration: number;
    current: number;
    scale: number;
    fps: number;
    state: 'running' | 'paused' | 'stopped';
};

export interface IEventSource<T extends IObject> {
    readonly object: T;
    readonly id: string;
    readonly table: string;
}

export interface IEvent<T extends IObject> {
    readonly type: string;
    readonly source: IEventSource<T>;
}

export interface ITable {
    id: string;
    name: string;
    keys: string[];
}

export interface IObject {
    table: string;
    id: string;
}


type AppRecord = {
    time: number;
    type: 'event' | 'get' | 'add' | 'set' | 'del';
    data: IEvent<IObject> | IObject;
    id: number;
};

const ClientContext = createContext<ClientContextValue | undefined>(undefined);

let autoId = 0;

export function ClientProvider({ children }: { children: ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [state, setState] = useState<ClientState>({ duration: 0, current: 0, state: 'stopped', scale: 1.0, fps: 30 });
    const [graph, setGraph] = useState<IGraph | null>(null);
    const [records, setRecords] = useState<AppRecord[]>([]);
    const [objectSet,] = useState<Map<string, [IObject[], Map<string, IObject>]>>(new Map());
    const [tables, setTables] = useState<ITable[]>([]);
    const [focusObject, setFocusObject] = useState<[IObject, string] | null>(null);

    useEffect(() => {
        const newSocket = io({
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

        setSocket(newSocket);

        newSocket.on('connect', () => {
            setIsConnected(true);
            newSocket.emit('world-get-state');
            newSocket.emit('world-get-graph');
        });

        newSocket.on('disconnect', () => setIsConnected(false));

        newSocket.on('world-state', (data: ClientState) => {
            setState(data);

        });

        newSocket.on('world-graph', (data: IGraph) => {
            setGraph(data);
            let variantSet = new Map<string, INode>();
            let tables: ITable[] = [];
            for (let node of data.nodes) {
                if (node.type === "Variant") {
                    variantSet.set(node.id, node);
                } else if (node.type === "Context" || node.type === "World") {
                    let table: ITable = { id: node.id, name: node.properties.name, keys: [] };
                    tables.push(table);
                }
            }

            for (let table of tables) {
                for (let edge of data.edges) {
                    if (edge[0] === table.id) {
                        let node = variantSet.get(edge[1]);
                        if (node) {
                            table.keys.push(node.properties.name);
                        }
                    }
                }
            }

            setTables(tables);

        });

        newSocket.on('world-event-record', (data: AppRecord) => {
            window.dispatchEvent(new CustomEvent('world-event-record', { detail: data }));
            data.id = ++autoId;
            setRecords((prevRecords) => {
                if (data.type === 'event' || prevRecords.length === 0 || prevRecords[0].type === 'event' || (prevRecords[0].data as IObject).table != (data.data as IObject).table) {
                    return [data, ...prevRecords.slice(0, 19)];
                }
                return [data, ...prevRecords.slice(1, 19)];
            });
            if (data.type !== 'event') {
                let object = data.data as IObject;
                let vs = objectSet.get(object.table);
                if (!vs) {
                    objectSet.set(object.table, [[object], new Map([[object.id, object]])]);
                } else {
                    let v = vs[1].get(object.id);
                    if (v) {
                        let i = vs[0].indexOf(v);
                        if (i !== -1) {
                            vs[0][i] = object;
                        } else {
                            vs[0].push(object);
                        }
                        vs[1].set(object.id, object);
                    } else {
                        vs[0].push(object);
                        vs[1].set(object.id, object);
                    }
                }
                setTables((prevTables) => {
                    return [...prevTables];
                });
                setFocusObject((prevFocus) => {
                    if (prevFocus && prevFocus[0].id === object.id && prevFocus[0].table === object.table) {
                        return [object, prevFocus[1]];
                    }
                    return prevFocus;
                });
            }
        });

        newSocket.on('world-event-record-clear', () => {
            window.dispatchEvent(new CustomEvent('world-event-record-clear', {}));
            setRecords([]);
            objectSet.clear();
            setFocusObject(null);
            setTables((prevTables) => {
                return [...prevTables];
            });
        });

        return () => {
            newSocket.close();
        };
    }, [objectSet]);

    const value = useMemo<ClientContextValue>(() => ({ socket, isConnected, state: state, graph: graph, records: records, tables: tables, objectSet: objectSet, focusObject, setFocusObject }),
        [socket, isConnected, state, graph, records, tables, objectSet, focusObject]);

    return React.createElement(ClientContext.Provider, { value }, children);
}

export function useClient(): ClientContextValue {
    const context = useContext(ClientContext);
    if (!context) {
        throw new Error('useClient must be used within a ClientProvider');
    }
    return context;
}
