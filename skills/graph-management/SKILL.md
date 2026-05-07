# GraphOS Skill: graph-management

AI-operable protocol for reading and mutating GraphOS graphs through HTTP-first APIs.

## Purpose

Use this skill to:
- inspect graph structure and node relations
- inspect available node types and plugin status
- apply atomic graph mutations with transaction semantics

## Runtime Base URL

Default local runtime:
- http://localhost:3411

If your environment uses a different host or port, replace the base URL accordingly.

## Tools

### get_graph_description

Get a full graph snapshot for planning and verification.

- Method: GET
- Path: /api/graph/description
- Query:
  - graphId?: string
- Success response includes:
  - graph: id, name, nodeCount, edgeCount, rootNodeIds, leafNodeIds, selectedNodeId
  - nodes: AI-friendly node descriptions
  - edges: edge list with edge ids
  - adjacency: parent/child ids per node
  - aiSummary: natural language summary
- Typical errors:
  - 404 if graph is not found

### get_graph_node

Get one focus node and its local context (parents and children).

- Method: GET
- Path: /api/graph/node
- Query:
  - graphId?: string
  - nodeId?: string
- Behavior:
  - if nodeId is omitted, server falls back to the graph synced selected node
- Success response includes:
  - graph: id, name, selectedNodeId
  - selectedNode
  - parentNodes
  - childNodes
  - aiSummary: focus metadata + naturalLanguage
- Typical errors:
  - 400 if nodeId missing and no synced selected node exists
  - 404 if graph or node does not exist

### get_available_node_types

List node type schemas registered by plugins.

- Method: GET
- Path: /api/node-types
- Query: none
- Success response:
  - array of node type definitions (type, description, properties, inTypes, outTypes)

### get_plugins

List plugin runtime status.

- Method: GET
- Path: /api/plugins
- Query: none
- Success response:
  - array of plugin status objects:
    - name
    - status
    - error
    - nodeTypeCount

### apply_graph_transaction

Apply a batch of graph operations atomically from the caller perspective.

- Method: POST
- Path: /api/graph/apply
- Body:
  - graphId?: string
  - ops: Operation[]

Operation schema:
- CREATE_NODE
  - metadata: { id, type, position: { x, y }, data? }
- UPDATE_NODE
  - metadata: { id, data }
- DELETE_NODE
  - metadata: { id }
- CONNECT
  - metadata: { id, source, target, sourceHandle?, targetHandle? }
- DISCONNECT
  - metadata: { id }

Notes:
- node validation runs against registered node type schema
- CONNECT requires source and target nodes to exist
- duplicate node ids and duplicate edges are rejected
- DISCONNECT uses edge id, typically edge_<idx>_<source>_<target>

Success response includes:
- success, appliedCount, errorCount
- applied: string[]
- errors: { op, index, reason }[]
- updated graph, nodes, edges
- aiSummary

## Recommended Agent Workflow

1. Call get_available_node_types to understand constraints.
2. Call get_graph_description to build current-state context.
3. If editing a specific node, call get_graph_node for local topology.
4. Build one apply_graph_transaction request with all related ops.
5. Re-read get_graph_description to verify post-state.

## Safety and Planning Rules

- Prefer one coherent transaction over many micro calls.
- Keep node ids stable and unique.
- Validate node property payloads against node type requirements before submit.
- For destructive updates, inspect current graph first and include only intended operations.
- Treat partial success as normal: check errors array and retry only failed intent.

## Request Examples

### Example: Read graph

GET /api/graph/description?graphId=main

### Example: Apply transaction

POST /api/graph/apply
Content-Type: application/json

{
  "graphId": "main",
  "ops": [
    {
      "op": "CREATE_NODE",
      "metadata": {
        "id": "n_fetch",
        "type": "http.request",
        "position": { "x": 120, "y": 80 },
        "data": {
          "properties": {
            "url": "https://example.com"
          }
        }
      }
    },
    {
      "op": "CONNECT",
      "metadata": {
        "id": "edge_manual_n_fetch_n2",
        "source": "n_fetch",
        "target": "n2"
      }
    }
  ]
}
