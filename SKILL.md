# GraphOS Skill

AI-Operable Node Graph Runtime Protocol. Use this skill to build, observe, and manage structured logic flows.

## Core Concepts

- **Nodes**: Fundamental units of computation (e.g., HTTP Request, AI Summary).
- **Edges**: Directed connections representing data flow or sequence.
- **Transactions**: Atomic batches of graph operations to ensure consistency.

## Tools

### apply_graph_transaction
Execute a batch of graph operations.
- `ops`: List of operations to perform.
  - `CREATE_NODE`: `{ type, id, position: { x, y }, data? }`
  - `UPDATE_NODE`: `{ id, data }`
  - `DELETE_NODE`: `{ id }`
  - `CONNECT`: `{ id, source, target, sourceHandle?, targetHandle? }`
  - `DISCONNECT`: `{ id }`

### get_graph_description
Returns a text summary of the current graph state (all nodes and connections).

### get_available_node_types
Returns a list of supported node types and their schemas.

## AI Guidelines

1. **Transactional Integrity**: Always use standard transactions to modify the graph. Avoid partial states.
2. **Observability**: Before making changes, call `get_graph_description` to understand the current context.
3. **Draft Mode**: When unsure, describe the intended changes to the user before applying them.
4. **Validation**: Ensure all `CONNECT` operations reference valid node IDs.

## Data Schema

```json
{
  "nodes": [ { "id": "string", "type": "string", "data": {}, "position": { "x": 0, "y": 0 } } ],
  "edges": [ { "id": "string", "source": "string", "target": "string" } ]
}
```
