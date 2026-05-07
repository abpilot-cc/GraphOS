import type { IApp } from "graphos-core";
import { genTypeScript } from "./genTypeScript.js";
import path from "path";
import fs from "fs";

export default function install(app: IApp, env: any) {

    app.addNodeType({
        type: "World",
        description: "Root node of the world model. A World is the single top-level context and the root of the Context tree.",
        properties: {
            "name": {
                type: "string",
                description: "Human-readable world name. Use a stable domain name, such as 'ECommercePlatform' or 'SmartHome'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this world's purpose and scope.",
                editor: 'textarea',
            }
        },
        inTypes: [],
        outTypes: ['Context', 'Variant', 'Event']
    })

    app.addNodeType({
        type: "Context",
        description: "Tree node under World/Context. A Context groups related domains and can contain child Context nodes and Variant definitions.",
        properties: {
            "name": {
                type: "string",
                description: "Context name within its parent scope, such as 'User', 'Order', 'Payment', or 'Device'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this context's purpose and contents.",
                editor: 'textarea',
            }
        },
        inTypes: ['World', 'Context'],
        outTypes: ['Context', 'Variant', 'Event'],
    })

    app.addNodeType({
        type: "Variant",
        description: "Typed variable definition attached to a World/Context node. A Variant declares available data fields and how their values are produced.",
        properties: {
            "name": {
                type: "string",
                description: "Variable key. Use semantic names like 'region', 'currency', 'maxRetryCount', or 'isEnabled'.",
                required: true,
            },
            "type": {
                type: ['string', 'float', 'integer', 'boolean', 'JSONSchema'],
                description: "Value type of this variable. Choose JSONSchema when the value is a structured object.",
                required: true,
                defaultValue: 'string',
            },
            "jsonSchema": {
                type: "JSONSchema",
                description: "Schema used when type is JSONSchema. Define object shape, required fields, and constraints.",
                defaultValue: '{}',
                visible: {
                    type: 'JSONSchema',
                }
            },
            "required": {
                type: 'boolean',
                description: "Indicates whether this variable is required.",
                required: false,
                defaultValue: false,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this variable's meaning, usage, and value sources.",
                editor: 'textarea',
            }
        },
        inTypes: ['World', 'Context'],
        outTypes: [],
    })



    app.addNodeType({
        type: "System",
        description: "Lifecycle processing node attached to World/Context. System handles logic at different lifecycle timings of the current Context/World (Startup, Update, Change, Spawn, Despawn).",
        properties: {
            "name": {
                type: "string",
                description: "System name used to identify this lifecycle logic unit within the current World/Context.",
                required: true,
            },
            "startupEnabled": {
                type: "boolean",
                description: "Run on Startup timing. Executes when the system starts.",
                defaultValue: false,
            },
            "startupDescription": {
                type: "string",
                description: "Description for Startup timing behavior.",
                editor: 'textarea',
            },
            "updateEnabled": {
                type: "boolean",
                description: "Run on Update timing. Executes every frame.",
                defaultValue: false,
            },
            "updateDescription": {
                type: "string",
                description: "Description for Update timing behavior.",
                editor: 'textarea',
            },
            "changeEnabled": {
                type: "boolean",
                description: "Run on Change timing. Executes when the related Context changes.",
                defaultValue: false,
            },
            "changeDescription": {
                type: "string",
                description: "Description for Change timing behavior.",
                editor: 'textarea',
            },
            "spawnEnabled": {
                type: "boolean",
                description: "Run on Spawn timing. Executes after a Context is created.",
                defaultValue: false,
            },
            "spawnDescription": {
                type: "string",
                description: "Description for Spawn timing behavior.",
                editor: 'textarea',
            },
            "despawnEnabled": {
                type: "boolean",
                description: "Run on Despawn timing. Executes before a Context is deleted.",
                defaultValue: false,
            },
            "despawnDescription": {
                type: "string",
                description: "Description for Despawn timing behavior.",
                editor: 'textarea',
            },
        },
        inTypes: ['World', 'Context'],
        outTypes: [],
    })

    app.addNodeType({
        type: "Event",
        description: "Event definition node under World. An Event can declare input Variants and EventSystem handlers.",
        properties: {
            "name": {
                type: "string",
                description: "Event name, such as 'UserRegistered', 'PaymentSucceeded', or 'DeviceConnected'.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Optional detailed description of this event's semantics and trigger conditions.",
                editor: 'textarea',
            }
        },
        inTypes: ['World'],
        outTypes: ['Variant', 'EventSystem'],
    })

    app.addNodeType({
        type: "EventSystem",
        description: "Event-driven processing node under Event. Depends on the World event flow (via Event) and handles event logic, mainly for creating/managing Context instances (for example, initializing contexts after entering the game).",
        properties: {
            "name": {
                type: "string",
                description: "Handler name for this event processing unit.",
                required: true,
            },
            "description": {
                type: "string",
                description: "Detailed event handling logic, especially how this handler creates, initializes, or updates Context instances.",
                editor: 'textarea',
            }
        },
        inTypes: ['Event'],
        outTypes: [],
    })

    app.on("changed", (event) => {
        if (env && env.world && env.world.genTypeScript) {
            const file = path.join(env.workDir, "gen/World.ts");
            try {
                const code = genTypeScript(event.data);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, code, "utf-8");
                console.log(`Generated TypeScript code for World model at ${file}`);
            } catch (err: any) {
                console.error("Error generating TypeScript code for World model:", err.stack || err);
            }
        }
    });
}