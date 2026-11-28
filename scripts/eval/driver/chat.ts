/**
 * One conversation turn on the `ask` agent's chat route, read from the UI
 * message stream the console reads (`data: {...}` frames).
 */
import { call, failure, idOf, type Session } from './http.js';

export interface TurnToolCall {
  toolName: string;
  toolCallId?: string;
  input: unknown;
  output?: unknown;
}

export interface Turn {
  text: string;
  toolCalls: TurnToolCall[];
  error?: string;
  /** Model tokens of the turn, when the route reports them (the MCP route reads the model's usage; the ask route's come from ai_traces). */
  usage?: { input: number; output: number };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Parse the UI message stream into the turn's text and tool calls. */
export function parseUiMessageStream(body: string): Turn {
  let text = '';
  const toolCalls: TurnToolCall[] = [];
  const outputs = new Map<string, unknown>();
  let error: string | undefined;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (evt.type === 'text-delta') text += String(evt.delta ?? evt.textDelta ?? '');
    else if (evt.type === 'tool-input-available') {
      toolCalls.push({ toolName: String(evt.toolName), toolCallId: evt.toolCallId as string | undefined, input: evt.input });
    } else if (evt.type === 'tool-output-available' && typeof evt.toolCallId === 'string') outputs.set(evt.toolCallId, evt.output);
    else if (evt.type === 'error') error = String(evt.errorText ?? evt.error ?? 'stream error');
  }
  for (const c of toolCalls) if (c.toolCallId && outputs.has(c.toolCallId)) c.output = outputs.get(c.toolCallId);
  return { text, toolCalls, ...(error ? { error } : {}) };
}

export async function newConversation(s: Session): Promise<string> {
  const a = await call(s, 'POST', '/api/v1/ai/conversations', {});
  if (!a.ok) throw failure('create conversation', a);
  const id = idOf(a.json);
  if (!id) throw new Error('create conversation: no id in the answer');
  return id;
}

export interface ChatOptions {
  agent?: string;
  /** The chat context the console sends: the selected app, and `focus` when the conversation is pinned to a record. */
  context: Record<string, unknown>;
  model?: string;
}

/** Send the conversation so far, as the console does, and read the answer. */
export async function chatTurn(s: Session, conversationId: string, messages: ChatMessage[], opts: ChatOptions): Promise<Turn> {
  const agent = opts.agent ?? 'ask';
  const res = await fetch(`${s.baseUrl}/api/v1/ai/agents/${encodeURIComponent(agent)}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', origin: new URL(s.baseUrl).origin, cookie: s.cookie },
    body: JSON.stringify({ messages, conversationId, stream: true, context: opts.context, ...(opts.model ? { model: opts.model } : {}) }),
  });
  if (!res.ok) throw new Error(`${agent}/chat HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return parseUiMessageStream(await res.text());
}
