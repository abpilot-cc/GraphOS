
export default function install(app) {
    app.addNodeType({
        type: "World",
        description: "World",
        properties: {
            "name": {
                type: "string",
                description: "Name of the context",
                required: true,
            }
        },
        inTypes: [],
        outTypes: ['Context', 'Variant']
    })

    app.addNodeType({
        type: "Context",
        description: "Context",
        properties: {
            "name": {
                type: "string",
                description: "Name of the context",
                required: true,
            }
        },
        inTypes: ['World', 'Context'],
        outTypes: ['Context', 'Variant'],
    })

    app.addNodeType({
        type: "Variant",
        description: "Variant",
        properties: {
            "name": {
                type: "string",
                description: "Name of the variant",
                required: true,
            },
            "type": {
                type: ['string', 'float', 'integer', 'boolean', 'JSONSchema'],
                description: "Type of the variant",
                required: true,
                defaultValue: 'string',
            },
            "jsonSchema": {
                type: "JSONSchema",
                description: "JSON schema of the variant",
                defaultValue: '{}',
            },
            "valueExpression": {
                type: "string",
                description: "Expression to compute the value of the variant",
                required: true,
            }
        },
        inTypes: ['World', 'Context'],
        outTypes: [],
    })

    app.on("changed", (event) => {
        // console.log("Graph changed:", event.data);
    });

}
