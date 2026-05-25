import type { IGraph } from "graphos-core";

export interface CodeFile {
    name: string;
    content: string;
}

export function genBevy(graph: IGraph): CodeFile[] {
    return [{ name: `${toSnakeFileName(graph.name)}.rs`, content: generateCode(graph) }];
}

function toSnakeFileName(value: string): string {
    const s = String(value || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
    return s || "graph";
}


function generateCode(graph: IGraph): string {
    type JsonSchema = Record<string, any>;
    type GraphNode = IGraph["nodes"][number];
    type RustIntType = "u8" | "u16" | "u32" | "u64" | "usize" | "i8" | "i16" | "i32" | "i64" | "isize";
    type RustFloatType = "f32" | "f64";
    type RustNumericType = RustIntType | RustFloatType;
    const rustKeywords = new Set([
        "as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn",
        "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub",
        "ref", "return", "self", "Self", "static", "struct", "super", "trait", "true", "type",
        "unsafe", "use", "where", "while", "async", "await", "dyn", "abstract", "become",
        "box", "do", "final", "macro", "override", "priv", "typeof", "unsized", "virtual",
        "yield", "try",
    ]);

    const nodeMap = new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node]));
    const contextNodes = graph.nodes.filter((node) => node.type === "Context" || node.type === "World");
    const eventNodes = graph.nodes.filter((node) => node.type === "Event");

    const signatureToStructName = new Map<string, string>();
    const emittedStructSignatures = new Set<string>();
    const usedTypeNames = new Set<string>();
    const contextTypeNameById = new Map<string, string>();
    const schemaStructBlocks: string[] = [];
    const contextComponentBlocks: string[] = [];
    const variantComponentBlocks: string[] = [];
    const eventBlocks: string[] = [];
    const variantComponentRefs: Array<{ context: string; variant: string; component: string; rustType: string; table: string }> = [];
    const eventRefs: Array<{ event: string; rustType: string }> = [];
    const eventTypeRefs: Array<{ name: string; typeName: string }> = [];
    let structCounter = 1;

    const stableStringify = (value: unknown): string => {
        if (value === null) return "null";
        if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
        if (typeof value === "string") return JSON.stringify(value);

        if (Array.isArray(value)) {
            return `[${value.map((item) => stableStringify(item)).join(",")}]`;
        }

        if (typeof value === "object") {
            const obj = value as Record<string, unknown>;
            const keys = Object.keys(obj).sort();
            const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
            return `{${parts.join(",")}}`;
        }

        return JSON.stringify(value);
    };

    const schemaSignature = (schema: unknown): string => {
        return stableStringify(schema);
    };

    const parseSchema = (raw: unknown): JsonSchema => {
        if (!raw) return {};
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                return typeof parsed === "object" && parsed !== null ? (parsed as JsonSchema) : {};
            } catch {
                return {};
            }
        }
        return typeof raw === "object" && raw !== null ? (raw as JsonSchema) : {};
    };

    const toPascalCase = (value: string): string => {
        const parts = String(value || "")
            .replace(/[^a-zA-Z0-9]+/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
        return name || `Schema${structCounter}`;
    };

    const toSnakeCase = (value: string): string => {
        const s = String(value || "")
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .replace(/[^a-zA-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .toLowerCase();
        const normalized = s || "value";
        return rustKeywords.has(normalized) ? `r#${normalized}` : normalized;
    };

    const ensureUniqueTypeName = (baseName: string): string => {
        let name = baseName;
        let i = 2;
        while (usedTypeNames.has(name)) {
            name = `${baseName}${i}`;
            i += 1;
        }
        usedTypeNames.add(name);
        return name;
    };

    const isJsonSchemaVariant = (node: GraphNode): boolean => {
        return node.type === "Variant" && String(node.properties?.type || "").trim() === "JSONSchema";
    };

    const getChildVariants = (contextId: string): GraphNode[] => {
        const variants: GraphNode[] = [];
        for (const [sourceId, targetId] of graph.edges) {
            if (sourceId !== contextId) continue;
            const node = nodeMap.get(targetId);
            if (!node || node.type !== "Variant") continue;
            variants.push(node);
        }
        return variants;
    };

    const parseFiniteNumber = (value: unknown): number | undefined => {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
            const n = Number(value);
            if (Number.isFinite(n)) {
                return n;
            }
        }
        return undefined;
    };

    const resolveRustIntegerType = (schema: JsonSchema): RustNumericType => {
        const explicitType = String(schema["x-rust-type"] || "").trim() as RustNumericType;
        const allowedExplicitTypes: RustNumericType[] = ["u8", "u16", "u32", "u64", "usize", "i8", "i16", "i32", "i64", "isize", "f32", "f64"];
        if (allowedExplicitTypes.includes(explicitType)) {
            return explicitType;
        }

        const format = String(schema.format || "").trim().toLowerCase();
        const formatToType: Record<string, RustNumericType> = {
            u8: "u8",
            u16: "u16",
            u32: "u32",
            u64: "u64",
            usize: "usize",
            i8: "i8",
            i16: "i16",
            i32: "i32",
            i64: "i64",
            isize: "isize",
            uint8: "u8",
            uint16: "u16",
            uint32: "u32",
            uint64: "u64",
            int8: "i8",
            int16: "i16",
            int32: "i32",
            int64: "i64",
            float: "f32",
            float32: "f32",
            f32: "f32",
            double: "f64",
            float64: "f64",
            f64: "f64",
        };
        if (formatToType[format]) {
            return formatToType[format];
        }

        const min = parseFiniteNumber(schema.minimum);
        const max = parseFiniteNumber(schema.maximum);

        if (min !== undefined && max !== undefined) {
            if (min >= 0) {
                if (max <= 255) return "u8";
                if (max <= 65535) return "u16";
                if (max <= 4294967295) return "u32";
                return "u64";
            }

            if (min >= -128 && max <= 127) return "i8";
            if (min >= -32768 && max <= 32767) return "i16";
            if (min >= -2147483648 && max <= 2147483647) return "i32";
            return "i64";
        }

        return "i64";
    };

    const resolveRustFloatType = (schema: JsonSchema): RustFloatType => {
        const explicitType = String(schema["x-rust-type"] || "").trim().toLowerCase();
        if (explicitType === "f32") return "f32";
        if (explicitType === "f64") return "f64";

        const format = String(schema.format || "").trim().toLowerCase();
        if (format === "float" || format === "float32" || format === "f32") return "f32";
        if (format === "double" || format === "float64" || format === "f64") return "f64";

        return "f64";
    };

    const mapVariantScalarType = (variantType: string): string => {
        const t = variantType.trim().toLowerCase();
        if (t === "string") return "String";
        if (t === "float") return "f64";
        if (t === "integer") return "i64";
        if (t === "boolean" || t === "bool") return "bool";
        return "serde_json::Value";
    };

    const rustTypeForSchema = (schema: unknown, nestedNameHint: string): string => {
        if (!schema || typeof schema !== "object") {
            return "serde_json::Value";
        }

        const s = schema as JsonSchema;
        const type = String(s.type || "").toLowerCase().trim();

        if (type === "string") return "String";
        if (type === "integer") return resolveRustIntegerType(s);
        if (type === "number") return resolveRustFloatType(s);
        if (type === "boolean") return "bool";
        if (type === "array") {
            return `Vec<${rustTypeForSchema(s.items, `${nestedNameHint}Item`)}>`;
        }

        if (type === "object" || s.properties) {
            return ensureStructForSchema(s, nestedNameHint);
        }

        return "serde_json::Value";
    };

    const ensureStructForSchema = (schema: JsonSchema, preferredName: string): string => {
        const signature = schemaSignature(schema);
        const existing = signatureToStructName.get(signature);
        if (existing) {
            return existing;
        }

        const structName = ensureUniqueTypeName(toPascalCase(preferredName));
        signatureToStructName.set(signature, structName);

        if (emittedStructSignatures.has(signature)) {
            return structName;
        }
        emittedStructSignatures.add(signature);

        const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
        const properties = schema.properties && typeof schema.properties === "object"
            ? (schema.properties as Record<string, unknown>)
            : {};

        const fieldLines: string[] = [];
        for (const [propName, propSchema] of Object.entries(properties)) {
            const rustName = toSnakeCase(propName);
            const propType = rustTypeForSchema(propSchema, `${structName}${toPascalCase(propName)}`);
            const finalType = required.has(propName) ? propType : `Option<${propType}>`;

            if (rustName !== propName) {
                fieldLines.push(`    #[serde(rename = ${JSON.stringify(propName)})]`);
            }
            fieldLines.push(`    pub ${rustName}: ${finalType},`);
        }

        const structCode = `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${structName} {\n${fieldLines.join("\n")}\n}`;
        schemaStructBlocks.push(structCode);

        return structName;
    };

    const wrapOptional = (rustType: string, required: boolean): string => {
        return required ? rustType : `Option<${rustType}>`;
    };

    const extractVariantRustType = (contextName: string, variantNode: GraphNode): string => {
        const fieldNameRaw = String(variantNode.properties?.name || variantNode.id || "field");
        const required = Boolean(variantNode.properties?.required);

        if (!isJsonSchemaVariant(variantNode)) {
            const rawVariantType = String(variantNode.properties?.type || "string");
            return wrapOptional(mapVariantScalarType(rawVariantType), required);
        }

        const schema = parseSchema(variantNode.properties?.jsonSchema);
        const schemaStructName = ensureStructForSchema(schema, `${contextName}${toPascalCase(fieldNameRaw)}Schema`);
        return wrapOptional(schemaStructName, required);
    };

    for (const contextNode of contextNodes) {
        const contextNameRaw = String(contextNode.properties?.name || contextNode.id || `Context${structCounter}`);
        const contextName = toPascalCase(contextNameRaw);
        const contextTypeName = ensureUniqueTypeName(`${contextName}Context`);
        contextTypeNameById.set(contextNode.id, contextTypeName);
    }

    for (const contextNode of contextNodes) {
        const contextNameRaw = String(contextNode.properties?.name || contextNode.id || `Context${structCounter}`);
        const contextName = toPascalCase(contextNameRaw);
        const contextComponentName = contextTypeNameById.get(contextNode.id) || `${contextName}Context`;
        const variants = getChildVariants(contextNode.id);
        const spawnVariantArgs: string[] = [];
        const spawnBundleItems: string[] = [
            `Context { id: id.to_string(), table: ${contextComponentName}::table().to_string(), pid }`,
            `${contextComponentName}`,
        ];

        for (const variantNode of variants) {
            const fieldNameRaw = String(variantNode.properties?.name || variantNode.id || "field");
            const rustArgName = toSnakeCase(fieldNameRaw);
            const rustType = extractVariantRustType(contextName, variantNode);
            const variantComponentName = ensureUniqueTypeName(`${contextName}${toPascalCase(fieldNameRaw)}Component`);

            variantComponentBlocks.push(`#[derive(Component, Debug, Clone, Serialize, Deserialize)]\npub struct ${variantComponentName}(pub ${rustType});\n\nimpl IVariant for ${variantComponentName} {\n    fn name() -> &'static str {\n        ${JSON.stringify(fieldNameRaw)}\n    }\n}`);
            variantComponentRefs.push({ context: contextComponentName, variant: fieldNameRaw, component: variantComponentName, rustType, table: contextNameRaw });
            spawnVariantArgs.push(`${rustArgName}: ${variantComponentName}`);
            spawnBundleItems.push(rustArgName);
        }
        const spawnSignature = spawnVariantArgs.length > 0
            ? `commands: &mut Commands, pid: Option<String>, id: &str, ${spawnVariantArgs.join(", ")}`
            : `commands: &mut Commands, pid: Option<String>, id: &str`;
        const spawnMethod = `\n\n    pub fn spawn(${spawnSignature}) -> Entity {\n        commands.spawn((${spawnBundleItems.join(", ")})).id()\n    }`;
        contextComponentBlocks.push(`#[derive(Component, Debug, Clone, Serialize, Deserialize)]\npub struct ${contextComponentName};\n\nimpl ${contextComponentName} {\n    pub fn table() -> &'static str {\n        ${JSON.stringify(contextNameRaw)}\n    }${spawnMethod}\n}`);
    }

    for (const eventNode of eventNodes) {
        const eventNameRaw = String(eventNode.properties?.name || eventNode.id || `Event${structCounter}`);
        const eventTypeName = ensureUniqueTypeName(`${toPascalCase(eventNameRaw)}Event`);
        eventTypeRefs.push({ name: eventNameRaw, typeName: eventTypeName });
        const variants = getChildVariants(eventNode.id);
        const eventFieldLines: string[] = [];

        for (const variantNode of variants) {
            const fieldNameRaw = String(variantNode.properties?.name || variantNode.id || "field");
            const rustFieldName = toSnakeCase(fieldNameRaw);
            const rustType = extractVariantRustType(toPascalCase(eventNameRaw), variantNode);

            if (rustFieldName !== fieldNameRaw) {
                eventFieldLines.push(`    #[serde(rename = ${JSON.stringify(fieldNameRaw)})]`);
            }
            eventFieldLines.push(`    pub ${rustFieldName}: ${rustType},`);
            eventRefs.push({ event: eventTypeName, rustType: `${fieldNameRaw}: ${rustType}` });
        }

        const eventStruct = eventFieldLines.length > 0
            ? `#[derive(Event, Debug, Clone, Serialize, Deserialize)]\npub struct ${eventTypeName} {\n${eventFieldLines.join("\n")}\n}\n\nimpl IEvent for ${eventTypeName} {\n    fn name() -> &'static str {\n        ${JSON.stringify(eventNameRaw)}\n    }\n}`
            : `#[derive(Event, Debug, Clone, Serialize, Deserialize)]\npub struct ${eventTypeName};\n\nimpl IEvent for ${eventTypeName} {\n    fn name() -> &'static str {\n        ${JSON.stringify(eventNameRaw)}\n    }\n}`;
        eventBlocks.push(eventStruct);
    }

    let code = `// Auto-generated Bevy code for graph: ${graph.name}\n`;
    code += `// Generated at: ${new Date().toISOString()}\n\n`;
    code += `use bevy_app::prelude::*;\n`;
    code += `use bevy_ecs::prelude::*;\n`;
    code += `use crate::core::{reg_event, reg_veriant, Context, IEvent, IVariant};\n`;
    code += `use serde::{Deserialize, Serialize};\n\n`;
    code += `// Context from crate::core is expected to be:\n`;
    code += `// #[derive(Component, Debug, Clone, Serialize, Deserialize)]\n`;
    code += `// pub struct Context {\n`;
    code += `//     pub id: String,\n`;
    code += `//     pub table: String,\n`;
    code += `//     pub pid: Option<String>,\n`;
    code += `// }\n\n`;

    if (contextNodes.length === 0 && eventNodes.length === 0) {
        code += `// No Context/World/Event nodes were found in this graph.\n`;
        return code;
    }

    code += `// Variant Components generated from Context Variant nodes\n`;
    for (const ref of variantComponentRefs) {
        code += `// ${ref.context}.${ref.variant} -> ${ref.component}: ${ref.rustType}\n`;
    }
    if (eventRefs.length > 0) {
        code += `// Event fields generated from Event Variant nodes\n`;
        for (const ref of eventRefs) {
            code += `// ${ref.event}.${ref.rustType}\n`;
        }
    }
    code += `\n`;

    code += `pub fn reg(app: &mut App) {\n`;
    for (const ref of variantComponentRefs) {
        code += `    reg_veriant::<${ref.component}>(app, ${JSON.stringify(ref.table)});\n`;
    }
    for (const ref of eventTypeRefs) {
        code += `    reg_event::<${ref.typeName}>(app);\n`;
    }
    code += `}\n\n`;

    if (schemaStructBlocks.length > 0) {
        code += schemaStructBlocks.join("\n\n");
        code += `\n\n`;
    }
    if (variantComponentBlocks.length > 0) {
        code += variantComponentBlocks.join("\n\n");
        code += `\n\n`;
    }
    if (eventBlocks.length > 0) {
        code += eventBlocks.join("\n\n");
        code += `\n\n`;
    }
    code += contextComponentBlocks.join("\n\n");
    code += `\n`;
    return code;
}
