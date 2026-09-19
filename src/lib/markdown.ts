import type { Extension } from "@codemirror/state";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

export function isMarkdownPath(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && MARKDOWN_EXTENSIONS.has(ext);
}

let pending: Promise<Extension> | null = null;

/** Markdown のライブ装飾を動的に読み込む(初回のみ。以降は同じ Promise を返す)。
 *  起動時の JS 評価量を減らすため、Markdown を開くまでは読み込まない。 */
export function loadMarkdownExtension(): Promise<Extension> {
  pending ??= import("./markdown-support").then((module) => module.markdownSupport);
  return pending;
}
