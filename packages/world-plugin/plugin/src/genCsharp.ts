import type { IGraph } from "graphos-core";

export interface CodeFile {
    name: string;
    content: string;
}

export function genCsharp(graph: IGraph, namespaceName?: string): CodeFile[] {
    return [{ name: `${toPascalCase(graph.name, "Graph")}.cs`, content: generateCode(graph, namespaceName) }];
}

function generateCode(graph: IGraph, namespaceName?: string): string {
    type JsonSchema = Record<string, any>;
    type GraphNode = IGraph["nodes"][number];
    type CsharpIntType = "sbyte" | "byte" | "short" | "ushort" | "int" | "uint" | "long" | "ulong";
    type CsharpFloatType = "float" | "double";
    const csharpKeywords = new Set([
        "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked",
        "class", "const", "continue", "decimal", "default", "delegate", "do", "double", "else",
        "enum", "event", "explicit", "extern", "false", "finally", "fixed", "float", "for",
        "foreach", "goto", "if", "implicit", "in", "int", "interface", "internal", "is", "lock",
        "long", "namespace", "new", "null", "object", "operator", "out", "override", "params",
        "private", "protected", "public", "readonly", "ref", "return", "sbyte", "sealed",
        "short", "sizeof", "stackalloc", "static", "string", "struct", "switch", "this",
        "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe", "ushort",
        "using", "virtual", "void", "volatile", "while",
    ]);

    const nodeMap = new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node]));
    const contextNodes = graph.nodes.filter((node) => node.type === "Context" || node.type === "World");

    const signatureToClassName = new Map<string, string>();
    const emittedSchemaSignatures = new Set<string>();
    const usedTypeNames = new Set<string>();
    const schemaClassBlocks: string[] = [];
    const contextClassBlocks: string[] = [];
    let nameCounter = 1;

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

    const isPlainIdentifier = (value: string): boolean => {
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
    };

    // Type/namespace identifiers are PascalCase-ified.
    const toIdentifier = (value: string, fallback: string): string => {
        let pascal = toPascalCase(value, "");
        if (!pascal) pascal = fallback;
        if (!pascal) return "";
        if (/^[0-9]/.test(pascal)) {
            pascal = `_${pascal}`;
        }
        return csharpKeywords.has(pascal) ? `@${pascal}` : pascal;
    };

    // Property identifiers keep the raw JSON field name whenever it is a valid
    // C# identifier (keywords are escaped with '@', which preserves the name),
    // so serialization round-trips without any attributes.
    const toPropertyName = (value: string, fallback: string): string => {
        const raw = String(value || "").trim();
        if (raw && isPlainIdentifier(raw)) {
            return csharpKeywords.has(raw) ? `@${raw}` : raw;
        }
        return toIdentifier(raw, fallback);
    };

    const sanitizeNamespace = (value: unknown): string => {
        const raw = String(value ?? "").trim();
        if (!raw) return "";
        return raw
            .split(".")
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map((segment) => toIdentifier(segment, `Ns${nameCounter++}`))
            .filter(Boolean)
            .join(".");
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

    const ensureUniquePropertyName = (usedNames: Set<string>, baseName: string): string => {
        let name = baseName;
        let i = 2;
        while (usedNames.has(name)) {
            name = `${baseName}${i}`;
            i += 1;
        }
        usedNames.add(name);
        return name;
    };

    const docCommentLines = (description: unknown, indent: string): string[] => {
        const text = String(description || "").trim();
        if (!text) return [];
        return text.split(/\r?\n/).map((line) => `${indent}/// ${line}`.trimEnd());
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

    const resolveCsharpIntegerType = (schema: JsonSchema): CsharpIntType => {
        const allowed: CsharpIntType[] = ["sbyte", "byte", "short", "ushort", "int", "uint", "long", "ulong"];
        const explicitType = String(schema["x-csharp-type"] || "").trim() as CsharpIntType;
        if (allowed.includes(explicitType)) {
            return explicitType;
        }

        const format = String(schema.format || "").trim().toLowerCase();
        const formatToType: Record<string, CsharpIntType> = {
            sbyte: "sbyte",
            int8: "sbyte",
            byte: "byte",
            uint8: "byte",
            short: "short",
            int16: "short",
            ushort: "ushort",
            uint16: "ushort",
            int: "int",
            int32: "int",
            uint: "uint",
            uint32: "uint",
            long: "long",
            int64: "long",
            ulong: "ulong",
            uint64: "ulong",
        };
        if (formatToType[format]) {
            return formatToType[format];
        }

        const min = parseFiniteNumber(schema.minimum);
        const max = parseFiniteNumber(schema.maximum);

        if (min !== undefined && max !== undefined) {
            if (min >= 0) {
                if (max <= 255) return "byte";
                if (max <= 65535) return "ushort";
                if (max <= 4294967295) return "uint";
                return "ulong";
            }

            if (min >= -128 && max <= 127) return "sbyte";
            if (min >= -32768 && max <= 32767) return "short";
            if (min >= -2147483648 && max <= 2147483647) return "int";
            return "long";
        }

        return "long";
    };

    const resolveCsharpFloatType = (schema: JsonSchema): CsharpFloatType => {
        const explicitType = String(schema["x-csharp-type"] || "").trim().toLowerCase();
        if (explicitType === "float") return "float";
        if (explicitType === "double") return "double";

        const format = String(schema.format || "").trim().toLowerCase();
        if (format === "float" || format === "float32" || format === "f32" || format === "single") return "float";
        if (format === "double" || format === "float64" || format === "f64") return "double";

        return "double";
    };

    const csharpValueTypeSet = new Set([
        "sbyte", "byte", "short", "ushort", "int", "uint", "long", "ulong",
        "float", "double", "bool", "DateTime",
    ]);

    const isCsharpValueType = (csType: string): boolean => {
        return csharpValueTypeSet.has(csType);
    };

    const csharpDefaultValueLiteral = (csType: string, value: unknown): string | undefined => {
        if (value === undefined || value === null) return undefined;
        if (typeof value === "boolean") return value ? "true" : "false";
        if (typeof value === "number" && Number.isFinite(value)) {
            return csType === "float" ? `${String(value)}f` : String(value);
        }
        if (typeof value === "string") {
            if (csType === "DateTime") {
                return `System.DateTime.Parse(${JSON.stringify(value)})`;
            }
            return JSON.stringify(value);
        }
        return undefined;
    };

    const csharpTypeForSchema = (schema: unknown, nestedNameHint: string): string => {
        if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
            return "object";
        }

        const s = schema as JsonSchema;
        const type = String(s.type || "").toLowerCase().trim();

        if (type === "string") {
            const format = String(s.format || "").trim().toLowerCase();
            if (format === "date-time" || format === "date") return "DateTime";
            return "string";
        }
        if (type === "integer") return resolveCsharpIntegerType(s);
        if (type === "number") return resolveCsharpFloatType(s);
        if (type === "boolean") return "bool";
        if (type === "array") {
            return `List<${csharpTypeForSchema(s.items, `${nestedNameHint}Item`)}>`;
        }

        if (type === "object" || s.properties) {
            return ensureClassForSchema(s, nestedNameHint);
        }

        return "object";
    };

    const ensureClassForSchema = (schema: JsonSchema, preferredName: string): string => {
        const signature = stableStringify(schema);
        const existing = signatureToClassName.get(signature);
        if (existing) {
            return existing;
        }

        const className = ensureUniqueTypeName(toIdentifier(preferredName, `Schema${nameCounter++}`));
        signatureToClassName.set(signature, className);
        if (emittedSchemaSignatures.has(signature)) {
            return className;
        }
        emittedSchemaSignatures.add(signature);

        const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
        const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
            ? (schema.properties as Record<string, unknown>)
            : {};

        const usedPropertyNames = new Set<string>();
        const memberLines: string[] = [];
        for (const [propName, propSchema] of Object.entries(properties)) {
            const csName = ensureUniquePropertyName(usedPropertyNames, toPropertyName(propName, `field${nameCounter++}`));
            const csType = csharpTypeForSchema(propSchema, `${className}${toPascalCase(propName, "Field")}`);
            const finalType = isCsharpValueType(csType) ? `${csType}?` : csType;
            const defaultLiteral = csharpDefaultValueLiteral(csType, (propSchema as JsonSchema)?.default);

            memberLines.push(...docCommentLines((propSchema as JsonSchema)?.description, "    "));
            memberLines.push(`    public ${finalType} ${csName}${defaultLiteral !== undefined ? ` = ${defaultLiteral}` : ""};`);
        }

        schemaClassBlocks.push(`[Serializable]\npublic class ${className}\n{\n${memberLines.join("\n")}\n}`);

        return className;
    };

    const mapVariantScalarType = (variantType: string): string => {
        const t = variantType.trim().toLowerCase();
        if (t === "string") return "string";
        if (t === "float") return "double";
        if (t === "integer") return "long";
        if (t === "boolean" || t === "bool") return "bool";
        if (t === "array") return "List<object>";
        if (t === "object") return "Dictionary<string, object>";
        if (t === "datetime") return "DateTime";
        return "object";
    };

    const extractVariantCsharpType = (contextName: string, variantNode: GraphNode, fieldNameRaw: string): string => {
        if (!isJsonSchemaVariant(variantNode)) {
            return mapVariantScalarType(String(variantNode.properties?.type || "string"));
        }

        const schema = parseSchema(variantNode.properties?.jsonSchema);
        return csharpTypeForSchema(schema, `${contextName}${toPascalCase(fieldNameRaw, "Field")}Schema`);
    };

    for (const contextNode of contextNodes) {
        const contextNameRaw = String(contextNode.properties?.name || contextNode.id || `Context${nameCounter}`);
        const contextName = toPascalCase(contextNameRaw, `Context${nameCounter++}`);
        const className = ensureUniqueTypeName(`${contextName}Context`);
        const variants = getChildVariants(contextNode.id);

        const usedPropertyNames = new Set<string>(["id", "table", "TableName"]);
        const memberLines: string[] = [
            "    public string id;",
            "",
            `    public string table = ${JSON.stringify(contextNameRaw)};`,
        ];
        for (const variantNode of variants) {
            const fieldNameRaw = String(variantNode.properties?.name || variantNode.id || "field");
            const csName = ensureUniquePropertyName(usedPropertyNames, toPropertyName(fieldNameRaw, `field${nameCounter++}`));
            const required = Boolean(variantNode.properties?.required);
            const csType = extractVariantCsharpType(contextName, variantNode, fieldNameRaw);
            const finalType = isCsharpValueType(csType) ? `${csType}?` : csType;

            memberLines.push(...docCommentLines(variantNode.properties?.description, "    "));
            memberLines.push(`    public ${finalType} ${csName};`);
        }

        const classDoc = docCommentLines(contextNode.properties?.description, "");
        const classDocPrefix = classDoc.length > 0 ? `${classDoc.join("\n")}\n` : "";
        contextClassBlocks.push(`${classDocPrefix}[Serializable]
public class ${className}
{
    public const string TableName = ${JSON.stringify(contextNameRaw)};

${memberLines.join("\n")}
}`);
    }

    let code = `// <auto-generated>\n`;
    code += `// Auto-generated C# serializable classes for graph: ${graph.name}\n`;
    code += `// Generated at: ${new Date().toISOString()}\n`;
    code += `// </auto-generated>\n\n`;
    code += `#pragma warning disable 1591\n\n`;
    code += `using System;\n`;
    code += `using System.Collections.Generic;\n`;

    if (contextNodes.length === 0) {
        code += `\n// No Context/World nodes were found in this graph.\n`;
        return code;
    }

    const blocks: string[] = [];
    if (schemaClassBlocks.length > 0) {
        blocks.push(`// Classes generated from JSONSchema Variants\n${schemaClassBlocks.join("\n\n")}`);
    }
    blocks.push(`// Classes generated from Context/World Variants\n${contextClassBlocks.join("\n\n")}`);

    const ns = sanitizeNamespace(namespaceName);
    if (!ns) {
        code += `\n${blocks.join("\n\n")}\n`;
        return code;
    }

    code += `\nnamespace ${ns}\n{\n`;
    code += blocks.map((block) => indentBlock(block)).join("\n\n");
    code += `\n}\n`;
    return code;
}

function indentBlock(block: string): string {
    return block
        .split("\n")
        .map((line) => (line.trim().length === 0 ? "" : `    ${line}`))
        .join("\n");
}

function toPascalCase(value: string, fallback: string): string {
    const parts = String(value || "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
    return name || fallback;
}
