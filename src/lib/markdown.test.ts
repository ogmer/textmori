import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { isMarkdownPath, loadMarkdownExtension } from "./markdown";

describe("loadMarkdownExtension", () => {
  it("loads lazily and returns the same extension on every call", async () => {
    const first = await loadMarkdownExtension();
    const second = await loadMarkdownExtension();
    expect(second).toBe(first);
  });

  it("enables Markdown parsing when applied to a state", async () => {
    const extension = await loadMarkdownExtension();
    const state = EditorState.create({ doc: "# 見出し\n\n本文", extensions: extension });
    const names: string[] = [];
    syntaxTree(state).iterate({ enter: (node) => void names.push(node.name) });
    expect(names).toContain("ATXHeading1");
  });
});

describe("isMarkdownPath", () => {
  it("recognizes .md files", () => {
    expect(isMarkdownPath("notes.md")).toBe(true);
    expect(isMarkdownPath("C:\\Users\\me\\notes.md")).toBe(true);
  });

  it("recognizes .markdown files", () => {
    expect(isMarkdownPath("README.markdown")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMarkdownPath("NOTES.MD")).toBe(true);
  });

  it("rejects non-markdown files", () => {
    expect(isMarkdownPath("notes.txt")).toBe(false);
    expect(isMarkdownPath("script.js")).toBe(false);
  });

  it("returns false for null (untitled tabs)", () => {
    expect(isMarkdownPath(null)).toBe(false);
  });
});
