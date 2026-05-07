import { Ajv } from 'ajv';
import type { AnySchema } from 'ajv';

export interface INode {
    readonly id: string;
    readonly type: string;
    readonly properties: Record<string, any>;
    readonly position: [number, number]; // [x, y]
}

export type NodePropertyType = 'string' | 'float' | 'integer' | 'boolean' | 'JSONSchema' | string[];
export type NodePropertyEditor = 'text' | 'number' | 'checkbox' | 'select' | 'textarea' | 'json' | string;

export type NodeProperty = {
    type: NodePropertyType;
    description: string;
    defaultValue?: any;
    required?: boolean;
    editor?: NodePropertyEditor;
    visible?: Record<string, any>; // Conditional visibility based on other property values
}

export interface INodeType {
    type: string;
    description: string;
    properties: Record<string, NodeProperty>;
    inTypes: string[] | '*';
    outTypes: string[] | '*';
}

export type IEdge = [string, string] // [sourceNodeId, targetNodeId];

export interface IGraph {
    id: string;
    name: string;
    nodes: INode[];
    edges: IEdge[];
}

export interface IAppEventChanged {
    type: 'changed';
    data: IGraph;
}

export interface IAppEvents {
    changed: IAppEventChanged;
}

export type AppEvent = keyof IAppEvents;

export interface IApp {
    addNodeType(node: INodeType): IApp;
    on<K extends AppEvent>(event: K, on: (event: IAppEvents[K]) => void): IApp;
}


const SUPPORTED_SCALAR_TYPES = new Set(['string', 'float', 'integer', 'boolean', 'JSONSchema']);
const jsonSchemaValidator = new Ajv({
    allErrors: true,
    strict: false,
    validateSchema: true,
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJsonSchema(schema: unknown): string | undefined {
    if (!(typeof schema === 'boolean' || isPlainObject(schema))) {
        return 'is not a valid JSON Schema: schema must be an object or boolean';
    }

    const valid = jsonSchemaValidator.validateSchema(schema as AnySchema);
    if (!valid) {
        const detail = jsonSchemaValidator.errorsText(jsonSchemaValidator.errors, { separator: '; ' });
        return `is not a valid JSON Schema${detail ? `: ${detail}` : ''}`;
    }

    return undefined;
}

function validateNodePropertyDefinition(key: string, property: NodeProperty): string | undefined {
    if (!property || typeof property !== 'object') {
        return `property definition "${key}" is invalid`;
    }

    if (typeof property.description !== 'string') {
        return `property definition "${key}" must have a string description`;
    }

    if (property.required !== undefined && typeof property.required !== 'boolean') {
        return `property definition "${key}" has invalid required flag`;
    }

    if (property.visible !== undefined && !isPlainObject(property.visible)) {
        return `property definition "${key}" has invalid visible rule`;
    }

    if (Array.isArray(property.type)) {
        if (property.type.length === 0) {
            return `property definition "${key}" must have at least one allowed value`;
        }
        if (!property.type.every((v) => typeof v === 'string')) {
            return `property definition "${key}" has invalid enum values`;
        }
        return undefined;
    }

    if (!SUPPORTED_SCALAR_TYPES.has(property.type)) {
        return `property definition "${key}" has unsupported type "${String(property.type)}"`;
    }

    return undefined;
}

function isNodePropertyVisible(property: NodeProperty, nodeProperties: Record<string, unknown>): boolean {
    if (property.visible === undefined) {
        return true;
    }

    if (!isPlainObject(property.visible)) {
        return false;
    }

    return Object.entries(property.visible).every(([relatedKey, expectedValue]) => nodeProperties[relatedKey] === expectedValue);
}

function validateNodePropertyValue(key: string, value: unknown, property: NodeProperty): string | undefined {
    if (Array.isArray(property.type)) {
        if (typeof value !== 'string') {
            return `property "${key}" must be one of: ${property.type.join(', ')}`;
        }
        if (!property.type.includes(value)) {
            return `property "${key}" must be one of: ${property.type.join(', ')}`;
        }
        return undefined;
    }

    switch (property.type) {
        case 'string':
            if (typeof value !== 'string') {
                return `property "${key}" must be a string`;
            }
            return undefined;
        case 'float':
            if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
                return `property "${key}" must be a finite number`;
            }
            return undefined;
        case 'integer':
            if (typeof value !== 'number' || !Number.isInteger(value)) {
                return `property "${key}" must be an integer`;
            }
            return undefined;
        case 'boolean':
            if (typeof value !== 'boolean') {
                return `property "${key}" must be a boolean`;
            }
            return undefined;
        case 'JSONSchema': {
            const schemaError = validateJsonSchema(value);
            if (schemaError) {
                return `property "${key}" ${schemaError}`;
            }
            return undefined;
        }
        default:
            return `property "${key}" has unsupported type`;
    }
}


export function validateNode(node: INode, nodeType: INodeType): [boolean, string | undefined] {
    if (node.type !== nodeType.type) {
        return [false, `node type mismatch: expected "${nodeType.type}", got "${node.type}"`];
    }

    if (!isPlainObject(node.properties)) {
        return [false, 'node properties must be an object'];
    }

    for (const [key, property] of Object.entries(nodeType.properties)) {
        const definitionError = validateNodePropertyDefinition(key, property);
        if (definitionError) {
            return [false, definitionError];
        }

        if (!isNodePropertyVisible(property, node.properties)) {
            continue;
        }

        const value = node.properties[key];
        const hasValue = value !== undefined;

        if (!hasValue) {
            if (property.required) {
                return [false, `missing required property "${key}"`];
            }
            continue;
        }

        const valueError = validateNodePropertyValue(key, value, property);
        if (valueError) {
            return [false, valueError];
        }
    }

    return [true, undefined];
}
