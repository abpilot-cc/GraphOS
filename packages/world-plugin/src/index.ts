import { uuidBase32 } from "./id.js";

export interface IEventSource<T extends IObject> {
    readonly object: T;
    readonly id: string;
    readonly table: string;
}

export interface IEvent<T extends IObject> {
    readonly type: string;
    readonly source: IEventSource<T>;
}

export interface GetEvent<T extends IObject> extends IEvent<T> {
    readonly type: 'get';
}

export interface SetEvent<T extends IObject> extends IEvent<T> {
    readonly type: 'set';
    readonly data: Partial<T>;
}

export interface AddEvent<T extends IObject> extends IEvent<T> {
    readonly type: 'add';
    readonly data: Partial<T>;
}

export interface DelEvent<T extends IObject> extends IEvent<T> {
    readonly type: 'del';
}

export interface IContext {
    trigger<T extends IObject>(event: IEvent<T>): void;
    next_id(): string;
    get<T extends IObject>(type: string, id: string, parent: IObject | null): T | null;
    set<T extends IObject>(type: string, id: string, value: Partial<T>, parent: IObject | null): void;
    del<T extends IObject>(v: T, parent: IObject | null): void;
    create<T extends IObject>(type: string, value: Partial<T>, parent: IObject | null): T;
    getChildren<T extends IObject>(type: string, parent: IObject | null): T[];
}

export interface ICache {
    get<T>(key: string): T | null;
    set<T>(key: string, value: T): void;
    del(key: string): void;
}

export interface IObject {
    table: string;
    id: string;
}

export interface IStorage {
    get(key: string): any;
    set(key: string, value: any): void;
    del(key: string): void;
}

/**
 * 系统接口定义，统一生命周期系统和事件系统的接口规范。
 * @template TContext - 系统操作的上下文类型，通常为对应的 Context 类。
 * @template TEvent - 处理的事件类型，默认为 never（非事件系统时使用）。
 */
export interface ISystem<TContext, TEvent = never> {
    /**
     * 实体生成时调用（可选）。
     * 在实体被创建并添加到世界后触发，用于初始化实体相关的系统状态。
     * @param ctx - 当前实体的上下文对象
     */
    spawn?(ctx: TContext): void;

    /**
     * 每帧更新时调用（可选）。
     * 在游戏主循环中每帧执行，用于处理周期性逻辑（如移动、冷却、碰撞检测等）。
     * @param ctx - 当前实体的上下文对象
     * @param deltaTime - 距上一帧的时间间隔（秒）
     */
    update?(ctx: TContext, deltaTime: number): void;

    /**
     * 数据变化时调用（可选）。
     * 当实体属性被修改（通过 set 方法）后触发，用于响应数据变更。
     * @param ctx - 当前实体的上下文对象
     */
    change?(ctx: TContext): void;

    /**
     * 实体销毁时调用（可选）。
     * 在实体被删除前触发，用于清理系统内部状态和资源。
     * @param ctx - 当前实体的上下文对象
     */
    despawn?(ctx: TContext): void;

    /**
     * 处理事件的方法（可选）。
     * 当事件被触发时调用，用于执行与该事件相关的业务逻辑。
     * @param event - 触发的事件对象，包含事件类型和相关数据
     */
    handle?(event: TEvent): void;
}

/**
 * 生命周期系统类型，用于仅处理实体生命周期的系统。
 * @template TContext - 系统操作的上下文类型
 */
export type ILifecycleSystem<TContext> = Pick<ISystem<TContext>, 'spawn' | 'update' | 'change' | 'despawn'>;

/**
 * 事件系统类型，用于仅处理事件响应的系统。
 * @template TContext - 事件处理所需的上下文类型
 * @template TEvent - 处理的事件类型
 */
export type IEventSystem<TContext, TEvent> = Pick<ISystem<TContext, TEvent>, 'handle'>;


/** @noSelf **/
export type Listener<TEvent extends IEvent<TObject>, TObject extends IObject> = (event: TEvent) => void;

export class Cache implements ICache {
    get<T>(key: string): T | null {
        return this._cache.get(key) as T;
    }
    set<T>(key: string, value: T): void {
        this._cache.set(key, value);
    }
    del(key: string): void {
        this._cache.delete(key);
    }
    private _cache: Map<string, any> = new Map();
}

export class Context implements IContext {

    private _listeners: Map<string, Listener<IEvent<IObject>, IObject>[]> = new Map();
    private _storage: IStorage;

    constructor(storage: IStorage) {
        this._storage = storage;
    }

    trigger<T extends IObject>(event: IEvent<T>): void {
        let listeners = this._listeners.get(event.type);
        if (listeners) {
            for (const listener of listeners) {
                listener(event);
            }
        }
        listeners = this._listeners.get("*");
        if (listeners) {
            for (const listener of listeners) {
                listener(event);
            }
        }
    }

    on<TEvent extends IEvent<TObject>, TObject extends IObject>(type: string, listener: Listener<TEvent, TObject>): void {
        let vs = this._listeners.get(type);
        if (!vs) {
            vs = [];
            this._listeners.set(type, vs);
        }
        vs.push(listener as any);
    }

    next_id(): string {
        return uuidBase32();
    }

    get<T extends IObject>(type: string, id: string, parent: IObject | null): T | null {
        return this._storage.get(`${type}:id:${id}`);
    }

    set<T extends IObject>(type: string, id: string, value: Partial<T>, parent: IObject | null): void {
        let v = this._storage.get(`${type}:id:${id}`);
        if (v === undefined) return;
        Object.assign(v, value);
        this._storage.set(`${type}:id:${id}`, v);
    }

    del<T extends IObject>(v: T, parent: IObject | null): void {
        this._storage.del(`${v.table}:id:${v.id}`);
        if (parent) {
            let ids = this._storage.get(`${parent.table}:children:${v.table}`) as any[] || [];
            ids = ids.filter(id => id !== v.id);
            this._storage.set(`${parent.table}:children:${v.table}`, ids);
        }
    }

    create<T extends IObject>(type: string, value: Partial<T>, parent: IObject | null): T {
        let id: string | undefined = (value as any).id;
        if (!id) {
            id = uuidBase32();
            (value as any).id = id;
        }
        (value as any).table = type;
        this._storage.set(`${type}:id:${id}`, value);
        if (parent) {
            let vs = this._storage.get(`${parent.table}:children:${type}`) as any[] || [];
            vs.push(id);
            this._storage.set(`${parent.table}:children:${type}`, vs);
        }
        return value as T;
    }

    getChildren<T extends IObject>(type: string, parent: IObject | null): T[] {
        if (!parent) return [];
        let vs = this._storage.get(`${parent.table}:children:${type}`) as string[] || [];
        return vs.map(id => this._storage.get(`${type}:id:${id}`));
    }

}


export class App {

    readonly ctx: Context;
    readonly cache: Cache;
    private _systems: Map<string, ILifecycleSystem<any>[]> = new Map();
    private _eventSystems: Map<string, IEventSystem<any, any>[]> = new Map();
    private _addedKeys: Set<string> = new Set();
    private _removedKeys: Set<string> = new Set();

    constructor(storage: IStorage) {
        this.cache = new Cache();
        this.ctx = new Context(storage);

        this.ctx.on<GetEvent<IObject>, IObject>('get', (event) => {
            this._addedKeys.add(`${event.source.table}:${event.source.id}`);
            let vs = this._systems.get(event.source.table);
            if (vs) {
                for (const s of vs) {
                    if (s.spawn) {
                        s.spawn(event.source);
                    }
                }
            }
        });


        this.ctx.on<SetEvent<IObject>, IObject>('set', (event) => {
            let vs = this._systems.get(event.source.table);
            if (vs) {
                for (const s of vs) {
                    if (s.change) {
                        s.change(event.source);
                    }
                }
            }
        });

        this.ctx.on<AddEvent<IObject>, IObject>('add', (event) => {
            this._addedKeys.add(`${event.source.table}:${event.source.id}`);
            let vs = this._systems.get(event.source.table);
            if (vs) {
                for (const s of vs) {
                    if (s.spawn) {
                        s.spawn(event.source);
                    }
                }
            }
        });

        this.ctx.on<DelEvent<IObject>, IObject>('del', (event) => {
            this._addedKeys.delete(`${event.source.table}:${event.source.id}`);
            let vs = this._systems.get(event.source.table);
            if (vs) {
                for (const s of vs) {
                    if (s.despawn) {
                        s.despawn(event.source);
                    }
                }
            }
        });

        this.ctx.on('*', (event) => {
            let vs = this._eventSystems.get(event.type);
            if (vs) {
                for (const s of vs) {
                    if (s.handle) {
                        s.handle(event);
                    }
                }
            }
        });

    }

    addSystem<TContext>(type: string, system: ILifecycleSystem<TContext>): void {
        let vs = this._systems.get(type);
        if (!vs) {
            vs = []
            this._systems.set(type, vs);
        }
        vs.push(system);
    }

    addEventSystem<TContext, TEvent>(type: string, system: IEventSystem<TContext, TEvent>): void {
        let vs = this._eventSystems.get(type);
        if (!vs) {
            vs = []
            this._eventSystems.set(type, vs);
        }
        vs.push(system);
    }

    trigger<T extends IObject>(event: IEvent<T>): void {
        this.ctx.trigger(event);
    }

    update(deltaTime: number): void {

        for (let key of this._addedKeys) {
            let ctx = this.cache.get(key) as IEventSource<IObject> | undefined;
            if (!ctx) {
                this._removedKeys.add(key);
                continue;
            }
            let vs = this._systems.get(ctx.table);
            if (vs) {
                for (const s of vs) {
                    if (s.update) {
                        s.update(ctx, deltaTime);
                    }
                }
            }
        }

        for (let key of this._removedKeys) {
            this._addedKeys.delete(key);
        }

        this._removedKeys.clear();
    }

}