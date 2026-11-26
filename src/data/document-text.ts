/**
 * The derived numbers of a policy body (制度正文) or attachment (制度附件) —
 * character count, token estimate, article index — computed one way, here, so
 * the seed and the import script (tools/redact → import, brightrule#11 / #13)
 * agree.
 *
 * The import script is Python; it mirrors these definitions rather than
 * importing them. Keep the two in step:
 *
 * - **Characters** are Unicode code points (`Array.from(s).length` here,
 *   `len(s)` in Python), counted over `body_md` exactly as stored,
 *   Markdown syntax and line breaks included.
 * - **Tokens** are an ESTIMATE, not a tokenizer's count: characters divided by
 *   {@link CHARS_PER_TOKEN}, rounded up. Mostly-Chinese policy text runs at
 *   roughly 1.5 characters per token on current model tokenizers; the number
 *   is for sizing (will a body fit a prompt?), never for billing.
 * - **Article offsets** are `[start, end)` in code points into
 *   `body_md`: `start` at the article's `**第X条**` marker, `end` where
 *   the next article (or the text) begins, trailing blank lines excluded.
 */

/** Characters per token assumed for mostly-Chinese text (an estimate). */
export const CHARS_PER_TOKEN = 1.5;

/** Length of `text` in Unicode code points. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/** Estimated token count of `text`: ⌈characters / CHARS_PER_TOKEN⌉; 0 for no text. */
export function estimateTokens(text: string): number {
  return Math.ceil(countChars(text) / CHARS_PER_TOKEN);
}

/** One `article_index` entry: the article number, its chapter (null when the text has none), its span. */
export interface ArticleIndexEntry {
  article: string;
  chapter: string | null;
  redacted: [number, number];
}

/** One article of a synthetic body: its number (第五条), heading and text. */
export interface BodyArticle {
  no: string;
  title: string;
  text: string;
  chapter?: string;
}

/**
 * Assemble a body as Markdown — a `#` heading with the policy name, then each
 * article as `**第X条** 标题` and its text — and index each
 * article's span in what was assembled.
 */
export function assembleBody(heading: string, articles: BodyArticle[]): {
  markdown: string;
  articleIndex: ArticleIndexEntry[];
} {
  let markdown = `# ${heading}\n\n`;
  const articleIndex: ArticleIndexEntry[] = [];
  for (const a of articles) {
    const start = countChars(markdown);
    markdown += `**${a.no}** ${a.title}\n\n${a.text}`;
    articleIndex.push({ article: a.no, chapter: a.chapter ?? null, redacted: [start, countChars(markdown)] });
    markdown += '\n\n';
  }
  return { markdown: markdown.replace(/\n+$/, '\n'), articleIndex };
}

/** The derived numbers stored beside a body's or attachment's text (all zero, has_text false, for none). */
export function textStats(text: string | undefined): { has_text: boolean; text_chars: number; text_tokens: number } {
  if (!text) return { has_text: false, text_chars: 0, text_tokens: 0 };
  return { has_text: true, text_chars: countChars(text), text_tokens: estimateTokens(text) };
}
