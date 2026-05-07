export const LAST_GRAPH_ID_STORAGE_KEY = 'gso-last-graph-id';

export function makeJsonSchemaDraftKey(nodeId: string, key: string): string {
  return `${nodeId}:${key}`;
}

function escapeForInlineScript(text: string): string {
  return text.replace(/<\//g, '<\\/');
}

export function buildSchemaEditorIframeDoc(initialSchema: unknown): string {
  const initialText = JSON.stringify(initialSchema ?? {}, null, 2);
  const safeInitialText = escapeForInlineScript(initialText);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/jsoneditor@9.10.2/dist/jsoneditor.min.css" />
  <style>
    html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: auto; }
    body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #root { display: flex; flex-direction: column; }
    .jsoneditor { flex: 1; border: none; background: #0f172a; }
    .jsoneditor-menu { background: #1e293b; border-bottom: 1px solid #334155; }
    .jsoneditor-menu button { color: #94a3b8; }
    .jsoneditor-modes button { color: #94a3b8; }
    .jsoneditor-modes button.active { color: #60a5fa; background: #1e293b; }
    .jsoneditor-tree { color: #e2e8f0; }
    .jsoneditor-value { color: #86efac; }
    .jsoneditor-string { color: #a78bfa; }
    .jsoneditor-number { color: #fb923c; }
    .jsoneditor-boolean { color: #f87171; }
    .jsoneditor-null { color: #94a3b8; }
    .jsoneditor-key { color: #60a5fa; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script id="initial-schema" type="application/json">${safeInitialText}</script>

  <script src="https://unpkg.com/jsoneditor@9.10.2/dist/jsoneditor.min.js"><\/script>

  <script>
    (function () {
      function post(type, payload) {
        parent.postMessage({ source: 'gso-json-schema-editor', type: type, payload: payload }, '*');
      }

      try {
        var container = document.getElementById('root');
        var raw = document.getElementById('initial-schema').textContent || '{}';
        var initialValue = JSON.parse(raw);

        var options = {
          mode: 'code',
          modes: ['code', 'tree', 'form', 'view'],
          indentation: 2,
          onChange: function () {
            try {
              var value = editor.get();
              post('change', value);
            } catch (e) {
              // Ignore errors during change
            }
          }
        };

        var editor = new JSONEditor(container, options);
        editor.set(initialValue);

        post('ready', null);
      } catch (err) {
        post('error', err && err.message ? err.message : String(err));
      }
    })();
  </script>
</body>
</html>`;
}
