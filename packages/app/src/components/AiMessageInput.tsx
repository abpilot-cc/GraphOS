import { useState, useCallback } from 'react';
import { CornerDownLeft, Loader2, Send, Sparkles, Terminal, Wifi, WifiOff } from 'lucide-react';
import { useOpencodeAi } from '../hooks/useOpencodeAi';
import type { Node } from 'reactflow';
import type { NodeType } from '../types/graph';

interface AiMessageInputProps {
  selectedNode: Node | undefined;
  nodeTypeRegistry: NodeType[];
  baseUrl?: string;
}

export default function AiMessageInput({
  selectedNode,
  nodeTypeRegistry,
  baseUrl,
}: AiMessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { status, error, sendTask, generatePrompt } = useOpencodeAi(baseUrl);

  const isConnected = status === 'connected';
  const isDisabled = !isConnected || sending;

  const handleGenerate = useCallback(() => {
    if (!selectedNode) return;
    const nodeTypeDef = nodeTypeRegistry.find((nt) => nt.type === selectedNode.type);
    const nodeTypeName = nodeTypeDef?.label || selectedNode.type || 'unknown';
    const props = (selectedNode.data as Record<string, unknown> | undefined)?.properties as Record<string, unknown> | undefined ?? {};
    const prompt = generatePrompt(selectedNode.id, nodeTypeName, props);
    setMessage(prompt);
    setSent(false);
  }, [selectedNode, nodeTypeRegistry, generatePrompt]);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || !isConnected) return;
    setSending(true);
    setSent(false);
    try {
      await sendTask(text);
      setMessage('');
      setSent(true);
    } catch (err) {
      setSent(false);
    } finally {
      setSending(false);
    }
  }, [message, isConnected, sendTask]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!selectedNode) return null;

  return (
    <div className="flex-shrink-0 border-t border-panel-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
            AI Assistant
          </span>
          {sent && (
            <span className="text-[10px] text-green-400 font-medium">
              Sent to opencode
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          {status === 'connected' && (
            <>
              <Wifi className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Connected</span>
            </>
          )}
          {status === 'connecting' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />
              <span className="text-yellow-400">Connecting...</span>
            </>
          )}
          {status === 'error' && (
            <>
              <WifiOff className="w-3 h-3 text-red-400" />
              <span className="text-red-400" title={error ?? undefined}>Offline</span>
            </>
          )}
          {status === 'disconnected' && (
            <>
              <WifiOff className="w-3 h-3 text-text-secondary" />
              <span className="text-text-secondary">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {status === 'error' && error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[10px]">
          {error}
        </div>
      )}

      <textarea
        value={message}
        onChange={(e) => { setMessage(e.target.value); setSent(false); }}
        onKeyDown={handleKeyDown}
        placeholder="Send a task to opencode terminal... (Cmd+Enter to send)"
        rows={3}
        disabled={isDisabled}
        className="w-full px-3 py-2 rounded-lg border border-panel-border bg-canvas-bg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none disabled:opacity-50 placeholder:text-text-secondary/50"
        spellCheck={false}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!isConnected || sending}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-panel-border text-[10px] font-bold uppercase tracking-wide text-text-secondary hover:bg-canvas-bg transition-colors disabled:opacity-40"
        >
          <Sparkles className="w-3 h-3" />
          Generate
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!message.trim() || isDisabled}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wide hover:bg-blue-600 transition-colors disabled:opacity-40 ml-auto"
        >
          {sending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Terminal className="w-3 h-3" />
          )}
          Run in Terminal
        </button>
      </div>
      <p className="text-[9px] text-text-secondary/50 text-right">
        or <kbd className="px-1 py-0.5 rounded bg-canvas-bg border border-panel-border text-[9px]"><CornerDownLeft className="w-2.5 h-2.5 inline mr-0.5" />Cmd+Enter</kbd>
      </p>
    </div>
  );
}
