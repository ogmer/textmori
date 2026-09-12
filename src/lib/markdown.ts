import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

/**
 * Obsidian のライブプレビューに倣い、Markdown の記号(#, **, > など)は控えめに、
 * 見出し・強調・リンクなどの内容は装飾して見せる。ただしソースは常にプレーン
 * テキストのまま編集できる(記号を隠したり別ビューに切り替えたりはしない)。
 */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.4em", fontWeight: "700" },
  { tag: tags.heading3, fontSize: "1.25em", fontWeight: "700" },
  { tag: tags.heading4, fontSize: "1.1em", fontWeight: "700" },
  { tag: tags.heading5, fontSize: "1.05em", fontWeight: "700" },
  { tag: tags.heading6, fontSize: "1em", fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, textDecoration: "underline", color: "var(--accent)" },
  { tag: tags.url, color: "var(--muted)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", color: "var(--accent)" },
  { tag: tags.quote, fontStyle: "italic", color: "var(--muted)" },
  { tag: tags.list, color: "var(--accent)" },
  { tag: tags.labelName, color: "var(--muted)" },
  { tag: tags.string, color: "var(--muted)", fontStyle: "italic" },
  // #, **, >, - などのマーク自体は控えめな色にして、内容を目立たせる
  { tag: tags.processingInstruction, color: "var(--muted)", opacity: "0.7" },
]);

const markdownSupport = [markdown(), syntaxHighlighting(markdownHighlightStyle)];

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

export function isMarkdownPath(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && MARKDOWN_EXTENSIONS.has(ext);
}

export function markdownExtension(enabled: boolean): Extension {
  return enabled ? markdownSupport : [];
}
