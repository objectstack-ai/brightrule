/**
 * Ask one question as its persona and record what happened (a RunRecord).
 *
 * - Earlier user turns (`context_turns`) go first, in the same conversation;
 *   their answers are not graded and their tool calls are not counted.
 * - A pinned question (`pinned_policy`) sends the record as the
 *   conversation's focus, as 「问这份制度」 does in the console.
 * - When the first answer is a clarifying question, the persona answers it
 *   once (`clarify_reply`, else its `self_description`) and the second answer
 *   is the one graded. A second clarifying question is not answered.
 */
import { looksLikeClarifyingQuestion } from '../grade/rules.js';
import type { Persona, Question, RunRecord } from '../schema.js';
import type { ChatMessage, Turn } from './chat.js';
import { retrievalFrom, toToolCalls, type KeyResolver } from './trajectory.js';

/** What the driver needs from a signed-in persona: a new conversation and one turn in it. */
export interface PersonaChat {
  newConversation(): Promise<string>;
  turn(conversationId: string, messages: ChatMessage[], context: Record<string, unknown>): Promise<Turn>;
}

export interface AskSetup {
  persona: Persona;
  chat: PersonaChat;
  resolver: KeyResolver;
  /** Record id of each corpus key, for pinned questions. */
  idOfKey: ReadonlyMap<string, string>;
  /** The chat context every turn carries (the selected app). */
  baseContext: Record<string, unknown>;
  config: string;
  rep: number;
}

export interface AskResult {
  record: RunRecord;
  conversationId?: string;
  /** The graded turns as they came off the stream, tool outputs included (for --raw). */
  turns?: Turn[];
}

export async function askQuestion(q: Question, s: AskSetup): Promise<AskResult> {
  const context: Record<string, unknown> = { ...s.baseContext };
  if (q.pinned_policy) {
    const id = s.idOfKey.get(q.pinned_policy);
    if (!id) return { record: failedRecord(q, s, `pinned policy ${q.pinned_policy} is not loaded`) };
    context.focus = [{ object: 'brightrule_policy', id }];
  }
  let conversationId: string | undefined;
  try {
    conversationId = await s.chat.newConversation();
    const messages: ChatMessage[] = [];
    for (const t of q.context_turns) {
      messages.push({ role: 'user', content: t });
      const a = await s.chat.turn(conversationId, messages, context);
      if (a.error) throw new Error(`context turn: ${a.error}`);
      messages.push({ role: 'assistant', content: a.text });
    }

    const started = Date.now();
    messages.push({ role: 'user', content: q.question });
    const first = await s.chat.turn(conversationId, messages, context);
    if (first.error) throw new Error(first.error);
    const turns = [first];
    let clarifyText: string | undefined;
    if (looksLikeClarifyingQuestion(first.text)) {
      clarifyText = first.text;
      messages.push({ role: 'assistant', content: first.text });
      messages.push({ role: 'user', content: q.clarify_reply ?? s.persona.self_description });
      const second = await s.chat.turn(conversationId, messages, context);
      if (second.error) throw new Error(second.error);
      turns.push(second);
    }
    const calls = turns.flatMap((t) => t.toolCalls);
    const metered = turns.filter((t) => t.usage);
    const usage = metered.length
      ? { input_tokens: metered.reduce((n, t) => n + t.usage!.input, 0), output_tokens: metered.reduce((n, t) => n + t.usage!.output, 0) }
      : {};
    const retrieval = retrievalFrom(calls, s.resolver);
    return {
      conversationId,
      turns,
      record: {
        question: q.id,
        config: s.config,
        rep: s.rep,
        answer: turns[turns.length - 1]!.text,
        ...(clarifyText !== undefined ? { clarify_text: clarifyText } : {}),
        clarified: clarifyText !== undefined,
        tool_calls: toToolCalls(calls, s.resolver),
        latency_ms: Date.now() - started,
        conversation_id: conversationId,
        ...usage,
        ...(retrieval ? { retrieval } : {}),
      },
    };
  } catch (err) {
    return { conversationId, record: { ...failedRecord(q, s, (err as Error).message), ...(conversationId ? { conversation_id: conversationId } : {}) } };
  }
}

function failedRecord(q: Question, s: AskSetup, error: string): RunRecord {
  return { question: q.id, config: s.config, rep: s.rep, answer: '', clarified: false, tool_calls: [], latency_ms: 0, error };
}
