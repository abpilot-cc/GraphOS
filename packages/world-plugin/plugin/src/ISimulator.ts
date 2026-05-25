
export interface IObject {
    [key: string]: unknown;
    table: string;
    id: string;
}

export interface IEvent {
    type: string;
    [key: string]: unknown;
}

export interface ISimulator extends EventTarget {
    on(event: 'spawn', listener: (event: CustomEvent<{ object: IObject }>) => void): void;
    on(event: 'despawn', listener: (event: CustomEvent<{ object: IObject }>) => void): void;
    on(event: 'change', listener: (event: CustomEvent<{ object: IObject }>) => void): void;
    on(event: 'reset', listener: (event: CustomEvent<{}>) => void): void;
    emit(event: IEvent): void;
    update(dt: number): void;
    exit(): void;
}