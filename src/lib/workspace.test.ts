import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { Tab, serializeTab } from "./workspace.svelte";

function stateWithDoc(doc: string): EditorState {
  return EditorState.create({ doc });
}

describe("Tab", () => {
  it("uses the file name when a path is set", () => {
    const tab = new Tab(stateWithDoc("hello"), "C:\\notes\\report.txt");
    expect(tab.name).toBe("report.txt");
  });

  it("falls back to the first line for untitled tabs", () => {
    const tab = new Tab(stateWithDoc("買い物リスト\n牛乳\nパン"));
    expect(tab.name).toBe("買い物リスト");
  });

  it("shows 'タイトルなし' for an empty untitled tab", () => {
    const tab = new Tab(stateWithDoc(""));
    expect(tab.name).toBe("タイトルなし");
  });

  it("truncates a long first line for the tab name", () => {
    const longLine = "a".repeat(40);
    const tab = new Tab(stateWithDoc(longLine));
    expect(tab.name.endsWith("…")).toBe(true);
    expect(tab.name.length).toBeLessThan(longLine.length);
  });

  it("is not dirty right after creation", () => {
    const tab = new Tab(stateWithDoc("content"));
    expect(tab.dirty).toBe(false);
  });

  it("becomes dirty once the document changes", () => {
    const tab = new Tab(stateWithDoc("content"));
    tab.editorState = tab.editorState.update({
      changes: { from: 0, to: tab.editorState.doc.length, insert: "changed" },
    }).state;
    expect(tab.dirty).toBe(true);
  });

  it("keeps LF line endings when eol is LF", () => {
    const tab = new Tab(stateWithDoc("a\nb\nc"), null, "LF");
    expect(tab.serialized).toBe("a\nb\nc");
  });

  it("converts to CRLF line endings when eol is CRLF", () => {
    const tab = new Tab(stateWithDoc("a\nb\nc"), null, "CRLF");
    expect(tab.serialized).toBe("a\r\nb\r\nc");
  });
});

describe("serializeTab (session persistence)", () => {
  it("omits savedContent for an unmodified tab", () => {
    const tab = new Tab(stateWithDoc("変更なし"), "C:\notes\a.txt");
    const saved = serializeTab(tab);
    expect(saved.content).toBe("変更なし");
    expect(saved.savedContent).toBeNull();
  });

  it("keeps the saved baseline for a modified tab so dirty state can be restored", () => {
    const tab = new Tab(stateWithDoc("before"));
    tab.editorState = tab.editorState.update({
      changes: { from: 0, to: tab.editorState.doc.length, insert: "after" },
    }).state;
    const saved = serializeTab(tab);
    expect(saved.content).toBe("after");
    expect(saved.savedContent).toBe("before");
  });

  it("reflects a later edit rather than a stale cached string", () => {
    const tab = new Tab(stateWithDoc("one"));
    expect(serializeTab(tab).content).toBe("one");
    tab.editorState = tab.editorState.update({ changes: { from: 3, insert: "two" } }).state;
    expect(serializeTab(tab).content).toBe("onetwo");
  });
});
