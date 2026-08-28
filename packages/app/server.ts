import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import { PluginManager } from "./srv/plugin-manager.ts";
import { registerRoutes } from "./srv/routes.ts";
import { registerSocketHandlers } from "./srv/ws.ts";
import { normalizeNodeTypes } from "./srv/api/node-types.ts";

const DEFAULT_PORT = 3411;
const WORKING_DIR_ENV_KEY = "GRAPHOS_WORKING_DIR";

type ServerOptions = {
  workingDir: string;
  port: number;
};

function printHelp() {
  console.log(`GraphOS app server\n\nUsage:\n  graphos [options]\n  npx graphos-cli@latest [options]\n\nOptions:\n  -C, --cwd <dir>    Working directory for graph files and plugins (default: current directory)\n  -p, --port <port>  Port to listen on (default: ${DEFAULT_PORT})\n  -h, --help         Show this help message`);
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

function parseCliArgs(argv: string[]): ServerOptions {
  let workingDir = process.cwd();
  let port = process.env.PORT ? parsePort(process.env.PORT) : DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "-C" || arg === "--cwd") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      workingDir = path.resolve(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--cwd=")) {
      workingDir = path.resolve(arg.slice("--cwd=".length));
      continue;
    }

    if (arg === "-p" || arg === "--port") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      port = parsePort(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      port = parsePort(arg.slice("--port=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
    throw new Error(`Working directory does not exist: ${workingDir}`);
  }

  return { workingDir, port };
}

async function startServer(options: ServerOptions) {
  process.env[WORKING_DIR_ENV_KEY] = options.workingDir;
  // Importing core ensures initialization (graph bootstrap, currentOpenGraphId) runs at startup.
  await import("./srv/core.ts");

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  app.use(cors());
  app.use(express.json());

  // --- Plugin Manager ---
  const pluginManager = new PluginManager(options.workingDir, app);
  const env = await pluginManager.loadAll();
  pluginManager.watchPlugins(env);

  // --- Routes & WebSocket ---
  const realtime = registerSocketHandlers(wss, pluginManager);
  registerRoutes(app, realtime, pluginManager);
  pluginManager.attachExpressBridge();

  // Broadcast updated node types to all connected clients on hot reload
  pluginManager.on("node-types:changed", (nodeTypes) => {
    realtime.broadcastAll("node-types:updated", normalizeNodeTypes(nodeTypes));
  });

  // --- Vite Integration ---
  const appRoot = path.dirname(fileURLToPath(import.meta.url));
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: appRoot,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(appRoot, "../dist");
    // Serve precompressed ".br" assets with "Content-Encoding: br" so browsers
    // transparently decompress them over HTTP (required by e.g. Cocos Creator builds).
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.toLowerCase().endsWith(".br")) {
          res.setHeader("Content-Encoding", "br");
          res.setHeader("Vary", "Accept-Encoding");
        }
      },
    }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(options.port, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${options.port}`);
    console.log(`Working directory: ${options.workingDir}`);
  });
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    await startServer(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start server: ${message}`);
    process.exit(1);
  }
}

void main();


