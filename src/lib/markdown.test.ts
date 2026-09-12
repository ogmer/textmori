import { describe, expect, it } from "vitest";
import { isMarkdownPath } from "./markdown";

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
