import type { IEvent, IObject, ISendEvent } from "./types.js";

export class SpawnEvent extends Event {
    constructor(public readonly object: IObject) {
        super("spawn");
    }
}

export class DespawnEvent extends Event {
    constructor(public readonly object: IObject) {
        super("despawn");
    }
}

export class ChangeEvent extends Event {
    constructor(public readonly object: IObject, public readonly changes: Partial<IObject>) {
        super("change");
    }
}

type AppRecord = {
    time: number;
    type: 'event' | 'get' | 'add' | 'set' | 'del';
    data: IEvent<IObject> | IObject;
};

type WsEnvelope<T = unknown> = {
    type: string;
    payload?: T;
};

type ObjectIterator<T> = IterableIterator<T>;

export function getDeviceId(): string {
    let id = localStorage.getItem('device-id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('device-id', id);
    }
    return id;
}

export class Client extends EventTarget {

    private _window: Window | null = null;
    private _socket: WebSocket | null = null;
    private _isConnected: boolean = false;
    private _objects: Map<string, Map<string, IObject>> = new Map();

    constructor(public readonly url: string = "ws://127.0.0.1:3411/ws") {
        super();
        let w: Window | null = window;
        while ((w as any).GRAPHOS_WORLD_PLUGIN_CLIENT_VERSION === undefined) {
            if (w.parent && w.parent !== w) {
                w = w.parent;
            } else {
                w = null;
                break;
            }
        }
        this._window = w;
        if (w) {
            w.addEventListener('world-event-record-clear', this.onWorldEventRecordClear.bind(this));
            w.addEventListener('world-event-record', this.onWorldEventRecord.bind(this));
        } else {
            this.onSocketConnect();
        }
    }

    private onSocketConnect() {
        if (this._socket) {
            this._socket.close();
            this._socket = null;
        }
        this._socket = new WebSocket(this.url);
        console.log('Connecting to WebSocket...');
        this._socket.onmessage = (e) => {
            let envelope: WsEnvelope | null = null;
            try {
                envelope = JSON.parse(e.data) as WsEnvelope;
            } catch {
                envelope = null;
            }
            if (!envelope) return;
            if (envelope.type === 'world-event-record') {
                let record = envelope.payload as AppRecord;
                this.onWorldEventRecord(new CustomEvent('world-event-record', { detail: record }));
            } else if (envelope.type === 'world-event-record-clear') {
                this.onWorldEventRecordClear();
            }
        };
        this._socket.onopen = () => {
            console.log('WebSocket connected');
            this._isConnected = true;
            let envelope: WsEnvelope<any> = {
                type: 'world-device',
                payload: {
                    id: getDeviceId(),
                    type: 'cocos',
                    platform: "web",
                    language: navigator.language,
                    os: navigator.platform,
                    osVersion: navigator.userAgent,
                },
            };
            this._socket!.send(JSON.stringify(envelope));
            console.log('WebSocket connected');
        };
        this._socket.onclose = () => {
            this._isConnected = false;
            console.log('WebSocket disconnected');
            setTimeout(() => { this.onSocketConnect(); }, 3000);
        };
    }

    private onWorldEventRecordClear() {
        this._objects.clear();
    }

    protected onDataBindingChange(object: IObject, v: Partial<IObject>) {

    }

    private onWorldEventRecord(e: Event) {
        let record = (e as CustomEvent).detail;
        if (record.type === 'get' || record.type === 'add') {
            let v = record.data as IObject;
            let vs = this._objects.get(v.table);
            if (!vs) {
                vs = new Map();
                this._objects.set(v.table, vs);
            }
            let old = vs.get(v.id);
            if (old) {
                this.dispatchEvent(new DespawnEvent(old));
            }
            vs.set(v.id, v);
            this.dispatchEvent(new SpawnEvent(v));
        } else if (record.type === 'set') {
            let v = record.data as Partial<IObject> & { table: string; id: string };
            let vs = this._objects.get(v.table);
            if (!vs) return;
            let old = vs.get(v.id);
            if (!old) return;
            Object.assign(old, v);
            this.dispatchEvent(new ChangeEvent(old, v));
        } else if (record.type === 'del') {
            let v = record.data as IObject;
            let vs = this._objects.get(v.table);
            if (!vs) return;
            let old = vs.get(v.id);
            if (!old) return;
            vs.delete(v.id);
            this.dispatchEvent(new DespawnEvent(old));
        }
    }

    close() {
        if (this._window) {
            this._window.removeEventListener('world-event-record-clear', this.onWorldEventRecordClear.bind(this));
            this._window.removeEventListener('world-event-record', this.onWorldEventRecord.bind(this));
        } else if (this._socket) {
            this._socket.close();
            this._socket = null;
        }
    }

    sendEvent(event: ISendEvent) {
        if (this._window) {
            this._window.dispatchEvent(new CustomEvent('world-send-event', { detail: event }));
        } else if (this._isConnected && this._socket) {
            let envelope: WsEnvelope<ISendEvent> = {
                type: 'world-send-event',
                payload: event,
            };
            this._socket.send(JSON.stringify(envelope));
        }
    }

    objects(): ObjectIterator<IObject> {
        const self = this;
        return (function* () {
            for (const tableObjects of self._objects.values()) {
                for (const object of tableObjects.values()) {
                    yield object;
                }
            }
        })() as ObjectIterator<IObject>;
    }

    getObjectsByTable(table: string): ObjectIterator<IObject> {
        const self = this;
        return (function* () {
            const tableObjects = self._objects.get(table);
            if (!tableObjects) return;
            for (const object of tableObjects.values()) {
                yield object;
            }
        })() as ObjectIterator<IObject>;
    }
    getObjectByTable(table: string): IObject | null {
        const tableObjects = this._objects.get(table);
        if (!tableObjects) return null;
        for (const object of tableObjects.values()) {
            return object;
        }
        return null;
    }
}

