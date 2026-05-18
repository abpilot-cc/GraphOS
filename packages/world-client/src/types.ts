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
    [key: string]: any;
}

export interface ISendEvent {
    readonly type: string;
    [key: string]: any;
}

export interface Vec2 {
    x: number;
    y: number;
}
