import { IGraph, INode } from 'graphos-core';
import React, { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';


type WsEnvelope<T = unknown> = {
    type: string;
    payload?: T;
};


(window as any).GRAPHOS_WORLD_PLUGIN_CLIENT_VERSION = '1.0.6';

export interface IDevice {
    type: string;
    [key: string]: any;
}

export type ClientContextValue = {
    socket: WebSocket | null;
    emit: (type: string, payload?: unknown) => void;
    isConnected: boolean;
    state: ClientState;
    graph: IGraph | null;
    records: AppRecord[];
    tables: ITable[];
    objectSet: Map<string, [IObject[], Map<string, IObject>]>
    focusObject: [IObject, string] | null;
    setFocusObject: (v: [IObject, string] | null) => void;
    devices: IDevice[];
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
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [state, setState] = useState<ClientState>({ duration: 0, current: 0, state: 'stopped', scale: 1.0, fps: 30 });
    const [graph, setGraph] = useState<IGraph | null>(null);
    const [records, setRecords] = useState<AppRecord[]>([]);
    const [objectSet,] = useState<Map<string, [IObject[], Map<string, IObject>]>>(new Map());
    const [tables, setTables] = useState<ITable[]>([]);
    const [focusObject, setFocusObject] = useState<[IObject, string] | null>(null);
    const [devices, setDevices] = useState<IDevice[]>([]);

    const emit = (type: string, payload?: unknown) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const message: WsEnvelope = { type, payload };
        socket.send(JSON.stringify(message));
    };

    useEffect(() => {
        let shouldReconnect = true;
        let reconnectAttempts = 0;
        let reconnectTimer: number | undefined;
        let activeSocket: WebSocket | null = null;

        const send = (ws: WebSocket, type: string, payload?: unknown) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const message: WsEnvelope = { type, payload };
            ws.send(JSON.stringify(message));
        };

        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
            activeSocket = ws;
            setSocket(ws);

            ws.addEventListener('open', () => {
                reconnectAttempts = 0;
                setIsConnected(true);
                send(ws, 'world-get-state');
                send(ws, 'world-get-graph');
                send(ws, 'world-get-devices');
            });

            ws.addEventListener('message', (event) => {
                if (typeof event.data !== 'string') return;

                let envelope: WsEnvelope | null = null;
                try {
                    envelope = JSON.parse(event.data) as WsEnvelope;
                } catch {
                    envelope = null;
                }

                if (!envelope || typeof envelope.type !== 'string') return;

                if (envelope.type === 'world-state') {
                    setState(envelope.payload as ClientState);
                    return;
                }

                if (envelope.type === 'world-graph') {
                    const data = envelope.payload as IGraph;
                    setGraph(data);
                    let variantSet = new Map<string, INode>();
                    let tables: ITable[] = [];
                    for (let node of data.nodes) {
                        if (node.type === 'Variant') {
                            variantSet.set(node.id, node);
                        } else if (node.type === 'Context' || node.type === 'World') {
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
                    return;
                }

                if (envelope.type === 'world-device-list') {
                    const data = envelope.payload as IDevice[];
                    setDevices(data);
                    return;
                }

                if (envelope.type === 'world-event-record') {
                    const data = envelope.payload as AppRecord;
                    window.dispatchEvent(new CustomEvent('world-event-record', { detail: data }));
                    data.id = ++autoId;
                    setRecords((prevRecords) => {
                        if (data.type === 'event' || prevRecords.length === 0 || prevRecords[0].type === 'event' || (prevRecords[0].data as IObject).table != (data.data as IObject).table || data.type !== prevRecords[0].type) {
                            return [data, ...prevRecords.slice(0, 19)];
                        }
                        if (data.type === 'set') {
                            Object.assign(prevRecords[0].data, data.data);
                            return [...prevRecords];
                        }
                        return [data, ...prevRecords.slice(1, 19)];
                    });
                    if (data.type !== 'event') {
                        let object = data.data as IObject;
                        if (data.type === 'add') {
                            let vs = objectSet.get(object.table);
                            if (!vs) {
                                object = { ...object };
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
                        } else if (data.type === 'set') {
                            let vs = objectSet.get(object.table);
                            if (vs) {
                                let v = vs[1].get(object.id);
                                if (v) {
                                    Object.assign(v, object);
                                    object = v;
                                }
                            }
                        } else if (data.type === 'del') {
                            let vs = objectSet.get(object.table);
                            if (vs) {
                                let v = vs[1].get(object.id);
                                if (v) {
                                    let i = vs[0].indexOf(v);
                                    if (i !== -1) {
                                        vs[0].splice(i, 1);
                                    }
                                    vs[1].delete(object.id);
                                }
                            }
                        }

                        setTables((prevTables) => {
                            return [...prevTables];
                        });
                        setFocusObject((prevFocus) => {
                            if (prevFocus && prevFocus[0].id === object.id && prevFocus[0].table === object.table) {
                                if (data.type === 'del') {
                                    return null;
                                }
                                return [object, prevFocus[1]];
                            }
                            return prevFocus;
                        });
                    }
                    return;
                }

                if (envelope.type === 'world-event-record-clear') {
                    window.dispatchEvent(new CustomEvent('world-event-record-clear', {}));
                    setRecords([]);
                    objectSet.clear();
                    setFocusObject(null);
                    setTables((prevTables) => {
                        return [...prevTables];
                    });
                }
            });

            ws.addEventListener('close', () => {
                if (activeSocket === ws) {
                    activeSocket = null;
                    setSocket((prev) => (prev === ws ? null : prev));
                }

                setIsConnected(false);
                if (!shouldReconnect) return;
                if (reconnectAttempts >= 10) return;

                reconnectAttempts += 1;
                reconnectTimer = window.setTimeout(connect, 2000);
            });

            ws.addEventListener('error', () => {
                ws.close();
            });
        };

        connect();

        const onSendEvent = (e: any) => {
            if (e.detail) {
                const ws = activeSocket;
                if (!ws) return;
                send(ws, 'world-send-event', e.detail);
            }
        };

        window.addEventListener('world-send-event', onSendEvent);

        return () => {
            shouldReconnect = false;
            if (reconnectTimer !== undefined) {
                window.clearTimeout(reconnectTimer);
            }
            window.removeEventListener('world-send-event', onSendEvent);
            if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) {
                activeSocket.close();
            }
            setSocket(null);
            setIsConnected(false);
        };
    }, [objectSet]);

    const value = useMemo<ClientContextValue>(() => ({ socket, emit, isConnected, state: state, graph: graph, records: records, tables: tables, objectSet: objectSet, focusObject, setFocusObject, devices }),
        [socket, isConnected, state, graph, records, tables, objectSet, focusObject, devices]);

    return React.createElement(ClientContext.Provider, { value }, children);
}

export function useClient(): ClientContextValue {
    const context = useContext(ClientContext);
    if (!context) {
        throw new Error('useClient must be used within a ClientProvider');
    }
    return context;
}
