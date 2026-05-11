import type { IGraph, INode, IEdge } from "graphos-core";

export interface CodeFile {
    name: string;
    content: string;
}

export function genTypeScript(graph: IGraph): CodeFile[] {
    return [{ name: `${graph.name}.ts`, content: generateCode(graph) }, { name: `${graph.name}Client.ts`, content: generateTypeCode(graph) }];
}


function generateTypeCode(graph: IGraph): string {
    const nodeMap: Map<string, INode> = new Map();
    const contextNodes: INode[] = [];
    const eventNodes: INode[] = [];
    const worldNodes: INode[] = [];

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

    const indent = '  ';

    let code = `/**
 * @generated World TypeScript Accessor
 * Generated on: ${new Date().toISOString()}
 */
import { IObject } from "graphos-world-plugin";

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


    return code;
}

function generateCode(graph: IGraph): string {
    const nodeMap: Map<string, INode> = new Map();
    const contextNodes: INode[] = [];
    const eventNodes: INode[] = [];
    const worldNodes: INode[] = [];

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

    const indent = '  ';

    let code = `/**
 * @generated World TypeScript Accessor
 * Generated on: ${new Date().toISOString()}
 */
import { IEventSource, IEvent, GetEvent, SetEvent, AddEvent, DelEvent, IContext, ICache, IObject } from "graphos-world-plugin";

export class ContextBase<TObject extends IObject, TParent, TContext extends IContext> {
    constructor(
      public readonly ctx: TContext,
      public readonly cache: ICache,
      public readonly object: TObject,
      public readonly parent: TParent
    ) {}

    get id(): string {
      return this.object.id;
    }

    get table(): string {
      return this.object.table;
    }
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
        const worldName = worldNodes[0]?.properties.name || worldNodes[0]?.id || 'World';
        const eventName = eventNode.properties.name || eventNode.id;
        const interfaceName = `I${capitalize(eventName)}`;
        const baseName = `IEvent<${worldName}Context>`;

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

    // Generate Accessor Classes
    for (const contextNode of contextNodes) {
        const contextName = contextNode.properties.name || contextNode.id;
        const interfaceName = `I${capitalize(contextName)}`;
        const accessorName = `${capitalize(contextName)}Context`;

        // Find parent context
        let parentType = 'null';
        const parentEdges = graph.edges.filter(e => e[1] === contextNode.id);
        if (parentEdges.length > 0 && parentEdges[0]) {
            const parentNode = nodeMap.get(parentEdges[0][0]);
            if (parentNode && (parentNode.type === 'World' || parentNode.type === 'Context')) {
                const parentName = parentNode.properties.name || parentNode.id;
                parentType = `${capitalize(parentName)}Context`;
            }
        }

        const baseContext = 'IContext';

        code += `export class ${accessorName} extends ContextBase<${interfaceName}, ${parentType}, ${baseContext}> implements IEventSource<${interfaceName}> {\n\n`;
        code += `${indent}public static readonly Table = "${contextName}";\n\n`;

        code += `${indent}constructor(ctx: ${baseContext}, cache: ICache, object: ${interfaceName}, parent: ${parentType}) {\n`;
        code += `${indent}${indent}super(ctx, cache, object, parent);\n`;
        code += `${indent}}\n\n`;

        if (parentType === 'null') {
            code += `${indent}public static default(ctx: ${baseContext}, cache: ICache): ${accessorName} | null {\n`;
            code += `${indent}${indent}const cached = cache.get<${accessorName}>("${contextName}:world");\n`;
            code += `${indent}${indent}if (cached) return cached;\n\n`;
            code += `${indent}${indent}let rs = ctx.get<${interfaceName}>("${contextName}", "world", null);\n`;
            code += `${indent}${indent}if (!rs) {\n`;
            code += `${indent}${indent}${indent}rs = ctx.create<${interfaceName}>("${contextName}", {\n`;
            code += `${indent}${indent}${indent}${indent}id: "world",\n`;
            code += `${indent}${indent}${indent}} as Partial<${interfaceName}>, null);\n`;
            code += `${indent}${indent}}\n`;
            code += `${indent}${indent}const instance = new ${accessorName}(ctx, cache, rs, null);\n`;
            code += `${indent}${indent}cache.set("${contextName}:" + instance.id, instance);\n`;
            code += `${indent}${indent}ctx.trigger({ type: 'get', source : instance } as GetEvent<${interfaceName}>);\n`;
            code += `${indent}${indent}return instance;\n`;
            code += `${indent}}\n\n`;
        }

        // Relationship Navigation Methods - for child contexts
        const children = getChildren(contextNode.id);
        for (const child of children) {
            if (child.type === 'Context') {
                const relName = child.properties.name || child.id;
                const targetAccessor = `${capitalize(relName)}Context`;
                const targetInterface = `I${capitalize(relName)}`;
                const typeKey = relName;
                const createMethodName = `create${capitalize(relName)}`;

                const getByIdMethodName = `get${capitalize(relName)}ById`;
                code += `${indent}public ${getByIdMethodName}(id: string): ${targetAccessor} | null {\n`;
                code += `${indent}${indent}const cached = this.cache.get<${targetAccessor}>("${typeKey}:"+id);\n`;
                code += `${indent}${indent}if (cached) return cached;\n\n`;
                code += `${indent}${indent}const rs = this.ctx.get<${targetInterface}>("${typeKey}",id, this.object);\n`;
                code += `${indent}${indent}if (!rs) return null;\n\n`;
                code += `${indent}${indent}const instance = new ${targetAccessor}(this.ctx, this.cache, rs, this);\n`;
                code += `${indent}${indent}this.cache.set("${typeKey}:"+id, instance);\n`;
                code += `${indent}${indent}this.ctx.trigger({ type: 'get', source : instance } as GetEvent<${targetInterface}>);\n`;
                code += `${indent}${indent}return instance;\n`;
                code += `${indent}}\n\n`;

                code += `${indent}public ${createMethodName}(object: Partial<${targetInterface}>): ${targetAccessor} {\n`;
                code += `${indent}${indent}const rs = this.ctx.create<${targetInterface}>("${typeKey}",object, this.object);\n`;
                code += `${indent}${indent}const instance = new ${targetAccessor}(this.ctx, this.cache, rs, this);\n`;
                code += `${indent}${indent}this.cache.set("${typeKey}:"+rs.id, instance);\n`;
                code += `${indent}${indent}this.ctx.trigger({ type: 'add', source : instance, data : object } as AddEvent<${targetInterface}>);\n`;
                code += `${indent}${indent}return instance;\n`;
                code += `${indent}}\n\n`;


                const getChildrenMethodName = `getChildren${capitalize(relName)}`;
                code += `${indent}public ${getChildrenMethodName}(): ${targetAccessor}[] {\n`;
                code += `${indent}${indent}const rs = this.ctx.getChildren<${targetInterface}>("${relName}", this.object);\n`;
                code += `${indent}${indent}return rs.map(obj => {\n`;
                code += `${indent}${indent}${indent}let cached = this.cache.get<${targetAccessor}>("${relName}:"+obj.id);\n`;
                code += `${indent}${indent}${indent}if(cached) return cached;\n`;
                code += `${indent}${indent}${indent}const instance = new ${targetAccessor}(this.ctx, this.cache, obj, this);\n`;
                code += `${indent}${indent}${indent}this.cache.set("${relName}:"+obj.id, instance);\n`;
                code += `${indent}${indent}${indent}this.ctx.trigger({ type: 'get', source : instance } as GetEvent<${targetInterface}>);\n`;
                code += `${indent}${indent}${indent}return instance;\n`;
                code += `${indent}${indent}});\n`;
                code += `${indent}}\n\n`;
            }
        }

        // Set Method
        code += `${indent}public set(data: Partial<${interfaceName}>): void {\n`;
        code += `${indent}${indent}this.ctx.set<${interfaceName}>("${contextName}",this.id, data, ${parentType === 'null' ? 'null' : 'this.parent.object'});\n`;
        code += `${indent}${indent}Object.assign(this.object, data);\n`;
        code += `${indent}${indent}this.ctx.trigger({ type: 'set', source : this, data : data } as SetEvent<${interfaceName}>);\n`;
        code += `${indent}}\n\n`;

        // Delete Method
        code += `${indent}public delete(): void {\n`;
        code += `${indent}${indent}this.ctx.trigger({ type: 'del', source : this } as DelEvent<${interfaceName}>);\n`;
        code += `${indent}${indent}this.ctx.del<${interfaceName}>(this.object, ${parentType === 'null' ? 'null' : 'this.parent.object'});\n`;
        code += `${indent}${indent}this.cache.del("${contextName}:" + this.id);\n`;
        code += `${indent}}\n\n`;

        // Remove Method
        code += `${indent}public remove(): void {\n`;
        code += `${indent}${indent}this.cache.del("${contextName}:" + this.id);\n`;
        code += `${indent}}\n\n`;

        code += `}\n\n`;
    }

    return code;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
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

    if (type === 'string') return 'string';
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
