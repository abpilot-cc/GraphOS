import type { WebSocket } from "ws";

export type RealtimeEnvelope<T = unknown> = {
  type: string;
  payload?: T;
};

export type RealtimeClient = {
  id: string;
  socket: WebSocket;
  graphId: string | null;
};

export type RealtimeServer = {
  registerClient: (socket: WebSocket) => RealtimeClient;
  unregisterClient: (clientId: string) => void;
  setClientGraph: (clientId: string, graphId: string | null) => void;
  getClientGraph: (clientId: string) => string | null;
  sendToClient: (client: RealtimeClient, type: string, payload?: unknown) => void;
  broadcastAll: (type: string, payload?: unknown) => void;
  broadcastGraph: (graphId: string, type: string, payload?: unknown) => void;
  broadcastGraphExcept: (
    graphId: string,
    excludedClientId: string,
    type: string,
    payload?: unknown,
  ) => void;
};

export function createRealtimeServer(): RealtimeServer {
  const clients = new Map<string, RealtimeClient>();

  const sendRaw = (socket: WebSocket, envelope: RealtimeEnvelope) => {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(envelope));
  };

  const sendToClient = (client: RealtimeClient, type: string, payload?: unknown) => {
    sendRaw(client.socket, { type, payload });
  };

  const registerClient = (socket: WebSocket): RealtimeClient => {
    const clientId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const client: RealtimeClient = {
      id: clientId,
      socket,
      graphId: null,
    };
    clients.set(clientId, client);
    return client;
  };

  const unregisterClient = (clientId: string) => {
    clients.delete(clientId);
  };

  const setClientGraph = (clientId: string, graphId: string | null) => {
    const client = clients.get(clientId);
    if (!client) return;
    client.graphId = graphId;
  };

  const getClientGraph = (clientId: string): string | null => {
    return clients.get(clientId)?.graphId ?? null;
  };

  const broadcastAll = (type: string, payload?: unknown) => {
    const envelope: RealtimeEnvelope = { type, payload };
    for (const client of clients.values()) {
      sendRaw(client.socket, envelope);
    }
  };

  const broadcastGraph = (graphId: string, type: string, payload?: unknown) => {
    const envelope: RealtimeEnvelope = { type, payload };
    for (const client of clients.values()) {
      if (client.graphId !== graphId) continue;
      sendRaw(client.socket, envelope);
    }
  };

  const broadcastGraphExcept = (
    graphId: string,
    excludedClientId: string,
    type: string,
    payload?: unknown,
  ) => {
    const envelope: RealtimeEnvelope = { type, payload };
    for (const client of clients.values()) {
      if (client.graphId !== graphId || client.id === excludedClientId) continue;
      sendRaw(client.socket, envelope);
    }
  };

  return {
    registerClient,
    unregisterClient,
    setClientGraph,
    getClientGraph,
    sendToClient,
    broadcastAll,
    broadcastGraph,
    broadcastGraphExcept,
  };
}