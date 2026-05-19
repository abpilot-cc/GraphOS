import type { IGraph, INode, IEdge } from "graphos-core";

export interface CodeFile {
    name: string;
    content: string;
}

export function genCocosCreator(graph: IGraph): CodeFile[] {
    return [{ name: `${graph.name}.ts`, content: generateCocosCreator(graph) }];
}


function generateCocosCreator(graph: IGraph): string {
    const nodeMap: Map<string, INode> = new Map();
    const contextNodes: INode[] = [];
    const eventNodes: INode[] = [];
    const worldNodes: INode[] = [];
    const viewNodes: INode[] = [];

    // Build node map and collect context nodes
    for (const node of graph.nodes) {
        nodeMap.set(node.id, node);
        if (node.type === 'Context' || node.type === 'World') {
            contextNodes.push(node);
            if (node.type === 'World') {
                worldNodes.push(node);
            }
        } else if (node.type === 'Event') {
            eventNodes.push(node);
        } else if (node.type === 'View') {
            viewNodes.push(node);
        }
    }

    // Helper function to get child nodes
    const getChildren = (nodeId: string) => {
        const childEdges = graph.edges.filter(e => e[0] === nodeId);
        return childEdges.map(e => nodeMap.get(e[1])).filter(Boolean) as INode[];
    };

    // Helper function to get field type
    const getFieldType = (node: INode) => {
        if (node.type !== 'Variant') return null;
        const fieldType = node.properties.type || 'string';
        const jsonSchema = node.properties.jsonSchema;
        const rawType = fieldType === 'JSONSchema' ? JSON.stringify(jsonSchema || {}) : undefined;
        return { type: fieldType, rawType };
    };

    const getParent = (nodeId: string) => {
        const parentEdge = graph.edges.find(e => e[1] === nodeId);
        return parentEdge ? nodeMap.get(parentEdge[0]) : null;
    };

    const indent = '  ';

    let code = `/**
 * @generated World TypeScript Accessor
 * Generated on: ${new Date().toISOString()}
 */
import { _decorator, Component, Node, Event } from 'cc';
import { NetWorld } from "../sdk/NetWorld";
const { ccclass, property } = _decorator;

export interface IObject {
    table: string;
    id: string;
    [key: string]: any;
}

export interface ISendEvent {
    type: string;
}

`;

    // Generate Interfaces
    for (const contextNode of contextNodes) {
        const contextName = contextNode.properties.name || contextNode.id;
        const interfaceName = `I${capitalize(contextName)}`;
        const baseName = 'IObject';

        code += `export interface ${interfaceName} extends ${baseName} {\n`;

        const children = getChildren(contextNode.id);
        for (const child of children) {
            if (child.type === 'Variant') {
                const fieldName = child.properties.name || child.id;
                const fieldType = getFieldType(child);
                if (fieldType) {
                    code += `${indent}${fieldName}: ${mapTsType(fieldType.type, fieldType.rawType)};\n`;
                }
            }
        }

        code += `}\n\n`;
    }

    // Generate Event
    for (const eventNode of eventNodes) {
        const eventName = eventNode.properties.name || eventNode.id;
        const interfaceName = `I${capitalize(eventName)}`;
        const baseName = `ISendEvent`;

        code += `export interface ${interfaceName}Event extends ${baseName} {\n`;
        code += `${indent}type: ${JSON.stringify(eventName)};\n`;
        const children = getChildren(eventNode.id);
        for (const child of children) {
            if (child.type === 'Variant') {
                const fieldName = child.properties.name || child.id;
                const fieldType = getFieldType(child);
                if (fieldType) {
                    code += `${indent}${fieldName}: ${mapTsType(fieldType.type, fieldType.rawType)};\n`;
                }
            }
        }
        code += `}\n\n`;
    }

    code += `@ccclass('WorldDataBinding')\n`;
    code += `export class WorldDataBinding {\n`;
    code += `${indent}@property({ type: Node })\n`;
    code += `${indent}target: Node | null = null;\n`;
    code += `${indent}@property\n`;
    code += `${indent}propertyName: string = '';\n`;
    code += `${indent}setValue(value:any) {\n`;
    code += `${indent}${indent}if (!this.target || !this.propertyName) return;\n`;
    code += `${indent}${indent}for(let t of this.target.getComponents(Component)) {\n`;
    code += `${indent}${indent}${indent}if (this.propertyName in t ) {\n`;
    code += `${indent}${indent}${indent}${indent}t[this.propertyName] = value;\n`;
    code += `${indent}${indent}${indent}${indent}break;\n`;
    code += `${indent}${indent}${indent}}\n`;
    code += `${indent}${indent}}\n`;
    code += `${indent}}\n`;
    code += `}\n\n`;

    code += '@ccclass("World")\n'
    code += 'export class World extends NetWorld {\n';

    code += `${indent}protected onDataBindingChange(object: IObject, data: Partial<IObject>) {\n`;

    for (const viewNode of viewNodes) {
        const viewName = capitalize(viewNode.properties.name);
        const variant = getParent(viewNode.id);
        if (!variant) continue;
        const context = getParent(variant.id);
        if (!context) continue;
        code += `${indent}${indent}if (object.table === ${JSON.stringify(context.properties.name)} && ${JSON.stringify(variant.properties.name)} in data) this.on${viewName}DataBindingChange(object as I${capitalize(context.properties.name)}, data[${JSON.stringify(variant.properties.name)}]);\n`;
    }

    code += `${indent}${indent}super.onDataBindingChange(object, data);\n`;
    code += `${indent}}\n\n`;

    for (const viewNode of viewNodes) {
        const viewName = capitalize(viewNode.properties.name);
        const variant = getParent(viewNode.id);
        if (!variant) continue;
        const context = getParent(variant.id);
        if (!context) continue;
        const fieldType = getFieldType(variant);
        if (!fieldType) continue;

        code += `${indent}@property({ type: [WorldDataBinding], tooltip: ${JSON.stringify(viewNode.properties.description || '')} })\n`;
        code += `${indent}${capitalizeLower(viewNode.properties.name)}DataBindings: WorldDataBinding[] = [];\n`;

        code += `${indent}protected on${viewName}DataBindingChange(object: I${capitalize(context.properties.name)}, value: ${mapTsType(fieldType.type, fieldType.rawType)} | undefined) {\n`;
        code += `${indent}${indent}const v = this.get${viewName}Value(object, value);\n`;
        code += `${indent}${indent}for (const binding of this.${capitalizeLower(viewNode.properties.name)}DataBindings) {\n`;
        code += `${indent}${indent}${indent}binding.setValue(v);\n`;
        code += `${indent}${indent}}\n`;
        code += `${indent}}\n\n`;

        code += `${indent}protected get${viewName}Value(object: I${capitalize(context.properties.name)}, value: ${mapTsType(fieldType.type, fieldType.rawType)} | undefined) {\n`;
        if (viewNode.properties.valueScriptCode) {
            code += `${indent}${indent}// Custom value script code\n`;
            const scriptLines = viewNode.properties.valueScriptCode.split('\n');
            for (const line of scriptLines) {
                code += `${indent}${indent}${line}\n`;
            }
        } else {
            code += `${indent}${indent}return value;\n`;
        }
        code += `${indent}}\n\n`;
    }

    for (const eventNode of eventNodes) {
        const eventName = eventNode.properties.name || eventNode.id;
        code += `${indent}onSend${capitalize(eventName)}Event(e: Event, data:string) {\n`;
        code += `${indent}${indent}this.sendEvent({...(data?JSON.parse(data):{}), type: ${JSON.stringify(eventName)}});\n`;
        code += `${indent}}\n\n`;
    }

    code += `}\n`;


    return code;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function capitalizeLower(s: string): string {
    return s.charAt(0).toLowerCase() + s.slice(1);
}

function mapTsType(surrealType: string, rawType?: string): string {
    if (rawType) {
        const trimmed = rawType.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const schema = JSON.parse(trimmed);
                return jsonSchemaToTs(schema);
            } catch (e) {
                if (trimmed.includes('{') || trimmed.includes('[') || trimmed.includes(':')) {
                    return trimmed;
                }
            }
        } else if (trimmed.includes('{') || trimmed.includes('[') || trimmed.includes(':')) {
            return trimmed;
        }
    }

    switch (surrealType.toLowerCase().trim()) {
        case 'string': return 'string';
        case 'number': return 'number';
        case 'integer': return 'number';
        case 'float': return 'number';
        case 'bool': return 'boolean';
        case 'boolean': return 'boolean';
        case 'array': return 'any[]';
        case 'object': return 'Record<string, any>';
        case 'datetime': return 'Date';
        case 'jsonschema': return 'any';
        default: return 'any';
    }
}

function jsonSchemaToTs(schema: any): string {
    if (!schema || typeof schema !== 'object') return 'any';

    const type = schema.type?.toLowerCase().trim();

    if (type === 'string') {
        if (schema.enum) {
            return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ');
        }
        return 'string';
    }
    if (type === 'number' || type === 'integer') return 'number';
    if (type === 'boolean') return 'boolean';

    if (type === 'array') {
        const items = schema.items;
        return `${jsonSchemaToTs(items)}[]`;
    }

    if (type === 'object') {
        if (!schema.properties) return 'Record<string, any>';
        const props = Object.entries(schema.properties)
            .map(([key, prop]) => `"${key}": ${jsonSchemaToTs(prop)}`)
            .join('; ');
        return `{ ${props} }`;
    }

    return 'any';
}
