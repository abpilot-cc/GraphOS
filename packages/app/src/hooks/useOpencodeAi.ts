import { useCallback, useEffect, useRef, useState } from 'react';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type SendMode = 'terminal' | 'session';

export interface UseOpencodeAiResult {
  status: ConnectionStatus;
  error: string | null;
  sendTask: (text: string, mode?: SendMode) => Promise<string | null>;
  generatePrompt: (nodeId: string, nodeType: string, properties: Record<string, unknown>) => string;
}

const DEFAULT_BASE_URL = import.meta.env.VITE_OPENCODE_SERVER_URL || 'http://localhost:4096';

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

export function useOpencodeAi(baseUrl: string = DEFAULT_BASE_URL): UseOpencodeAiResult {
  const clientRef = useRef<OpencodeClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setStatus('connecting');
      setError(null);
      try {
        const healthy = await checkHealth(baseUrl);
        if (!healthy) throw new Error('Server not healthy');
        const client = createOpencodeClient({ baseUrl });
        if (!cancelled) {
          clientRef.current = client;
          setStatus('connected');
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(`Cannot connect to opencode at ${baseUrl}. Run \`opencode serve\` to start the server.`);
        }
      }
    }

    connect();
    return () => { cancelled = true; };
  }, [baseUrl]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!clientRef.current) throw new Error('Opencode client not connected');
    const result = await clientRef.current.session.create({
      body: { title: `GraphOS - ${new Date().toLocaleString()}` },
    });
    sessionIdRef.current = result.data.id;
    return sessionIdRef.current;
  }, []);

  const sendViaTerminal = useCallback(async (text: string): Promise<null> => {
    if (!clientRef.current) throw new Error('Opencode client not connected');
    await clientRef.current.tui.appendPrompt({ body: { text } });
    await clientRef.current.tui.submitPrompt();
    return null;
  }, []);

  const sendViaSession = useCallback(async (text: string): Promise<string> => {
    if (!clientRef.current) throw new Error('Opencode client not connected');
    const sessionId = await ensureSession();
    const result = await clientRef.current.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text }],
      },
    });

    const parts = result.data?.parts ?? [];
    return (parts as Array<{ type: string; text?: string }>)
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('');
  }, [ensureSession]);

  const sendTask = useCallback(async (text: string, mode: SendMode = 'terminal'): Promise<string | null> => {
    if (!clientRef.current) throw new Error('Opencode client not connected');

    if (mode === 'terminal') {
      try {
        return await sendViaTerminal(text);
      } catch {
        return await sendViaSession(text);
      }
    }

    return await sendViaSession(text);
  }, [sendViaTerminal, sendViaSession]);

  const generatePrompt = useCallback(
    (nodeId: string, nodeType: string, properties: Record<string, unknown>): string => {
      const propsEntries = Object.entries(properties).filter(
        ([, v]) => v !== undefined && v !== null && v !== '',
      );
      const propsStr = propsEntries.length > 0
        ? propsEntries
            .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
            .join('\n')
        : '(none)';

      return `I'm working on a GraphOS graph node:

Node ID: ${nodeId}
Node Type: ${nodeType}

Properties:
${propsStr}

`;
    },
    [],
  );

  return { status, error, sendTask, generatePrompt };
}
