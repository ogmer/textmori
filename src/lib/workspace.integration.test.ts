// @vitest-environment jsdom
import { syntaxTree } from "@codemirror/language";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tauri のネイティブ API はテスト環境に無いので、必要な部分だけ差し替える
const destroy = vi.fn(async () => {});
const invoke = vi.fn();
const openDialog = vi.fn();
const saveDialog = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy }) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: vi.fn(async () => ""),
  writeText: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: vi.fn(async () => {}),
  open: (...args: unknown[]) => openDialog(...args),
  save: (...args: unknown[]) => saveDialog(...args),
}));

import { Workspace } from "./workspace.svelte";

const SESSION_KEY = "textmori:session";

/** jsdom には無いレイアウト系 API を、CodeMirror が落ちない程度に補う */
function stubLayoutApis(): void {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

let host: HTMLDivElement;
let detach: (() => void) | null = null;

/** 条件が満たされるまで待つ上限。並列実行で遅くなっても落ちないよう十分長くとる */
const WAIT = { timeout: 8000, interval: 20 };

/** 「何も起きないこと」を確認するときだけ使う固定待ち(肯定条件には vi.waitFor を使う) */
async function settle(ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function mountWorkspace(): Workspace {
  const workspace = new Workspace();
  detach = workspace.attach(host);
  return workspace;
}

beforeEach(() => {
  stubLayoutApis();
  localStorage.clear();
  invoke.mockReset();
  openDialog.mockReset();
  saveDialog.mockReset();
  destroy.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  detach?.();
  detach = null;
  host.remove();
});

describe("セッションの保存と復元", () => {
  it("起動時に空のタブが1つ作られ、エディタが表示される", () => {
    const workspace = mountWorkspace();
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.active?.name).toBe("タイトルなし");
    expect(host.querySelector(".cm-editor")).not.toBeNull();
  });

  it("入力した内容が保存され、再起動(別インスタンス)で復元される", async () => {
    const first = mountWorkspace();
    const view = first.active!;
    // 表示中のエディタへ入力する(実際のキー入力と同じ経路)
    const cm = (host.querySelector(".cm-content") as HTMLElement & { cmView?: unknown });
    expect(cm).not.toBeNull();
    first.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "こんにちは\n二行目" } });
      return true;
    });
    expect(view.editorState.doc.toString()).toBe("こんにちは\n二行目");
    first.newTab(); // newTab は即時に保存する
    detach?.();
    detach = null;

    const second = mountWorkspace();
    expect(second.tabs).toHaveLength(2);
    expect(second.tabs[0].editorState.doc.toString()).toBe("こんにちは\n二行目");
    expect(second.tabs[0].name).toBe("こんにちは");
  });

  it("未変更のタブは savedContent を保存せず、変更したタブだけ保存する", () => {
    const workspace = mountWorkspace();
    workspace.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "edited" } });
      return true;
    });
    workspace.newTab();
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY)!);
    expect(stored.tabs).toHaveLength(2);
    // 1枚目は「空の状態から編集した」ので保存済み内容(空)を保持し、2枚目(未変更)は省略される
    expect(stored.tabs[0].content).toBe("edited");
    expect(stored.tabs[0].savedContent).toBe("");
    expect(stored.tabs[1].savedContent).toBeNull();
  });

  it("復元しても、変更のあるタブは未保存、変更のないタブは保存済みのまま", () => {
    const first = mountWorkspace();
    first.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "dirty" } });
      return true;
    });
    first.newTab();
    detach?.();
    detach = null;

    const second = mountWorkspace();
    expect(second.tabs[0].dirty).toBe(true);
    expect(second.tabs[1].dirty).toBe(false);
  });

  it("壊れたセッションデータがあっても起動できる(空のタブから始まる)", () => {
    localStorage.setItem(SESSION_KEY, "{ this is not json");
    const workspace = mountWorkspace();
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.active?.dirty).toBe(false);
  });

  it("想定外の形のセッションデータ(タブ配列が空/型違い)でも落ちない", () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: [] }));
    expect(mountWorkspace().tabs).toHaveLength(1);
    detach?.();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: "oops", zoom: "x" }));
    expect(mountWorkspace().tabs).toHaveLength(1);
  });

  it("旧形式(savedContent が content と別のタブ)も未保存状態で復元できる", () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        tabs: [{ path: null, content: "new", savedContent: "old", eol: "LF", encoding: "UTF-8" }],
        activeIndex: 0,
        wrap: true,
        zoom: 100,
      }),
    );
    const workspace = mountWorkspace();
    expect(workspace.active?.dirty).toBe(true);
    expect(workspace.active?.editorState.doc.toString()).toBe("new");
  });

  it("保存された拡大率は 50〜300% の範囲に丸められる", () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ tabs: [{ path: null, content: "", eol: "LF", encoding: "UTF-8" }], zoom: 9999 }),
    );
    expect(mountWorkspace().zoom).toBe(300);
  });
});

describe("Markdown の遅延ロード", () => {
  const markdownSession = (activePath: string | null, otherPath: string | null) =>
    JSON.stringify({
      tabs: [
        { path: activePath, content: "# 見出し\n本文", eol: "LF", encoding: "UTF-8" },
        { path: otherPath, content: "# 別のタブ", eol: "LF", encoding: "UTF-8" },
      ],
      activeIndex: 0,
      wrap: true,
      zoom: 100,
    });

  const hasHeading = (workspace: Workspace, index: number): boolean => {
    let found = false;
    syntaxTree(workspace.tabs[index].editorState).iterate({
      enter: (node) => {
        if (node.name === "ATXHeading1") found = true;
      },
    });
    return found;
  };

  it("最初に表示するタブが Markdown なら、装飾の読み込み後にエディタが表示される", async () => {
    localStorage.setItem(SESSION_KEY, markdownSession("C:\\notes\\a.md", null));
    const workspace = mountWorkspace();
    // 読み込み完了までは描画しない(プレーン表示→装飾のチラつきを防ぐ設計)
    expect(host.querySelector(".cm-editor")).toBeNull();
    await vi.waitFor(() => expect(host.querySelector(".cm-editor")).not.toBeNull(), WAIT);
    expect(hasHeading(workspace, 0)).toBe(true);
  });

  it("表示中でない Markdown タブにも、読み込み後に装飾が反映される", async () => {
    localStorage.setItem(SESSION_KEY, markdownSession(null, "C:\\notes\\b.md"));
    const workspace = mountWorkspace();
    expect(host.querySelector(".cm-editor")).not.toBeNull(); // 表示は待たない
    expect(hasHeading(workspace, 1)).toBe(false); // 読み込み前はプレーン
    await vi.waitFor(() => expect(hasHeading(workspace, 1)).toBe(true), WAIT); // 読み込み後は装飾あり
  });

  it("Markdown が無いセッションでは、装飾の読み込みは起きない", async () => {
    localStorage.setItem(SESSION_KEY, markdownSession(null, "C:\\notes\\c.txt"));
    const workspace = mountWorkspace();
    await settle(400);
    expect(hasHeading(workspace, 0)).toBe(false);
    expect(hasHeading(workspace, 1)).toBe(false);
  });

  it("画面が破棄された後に読み込みが終わっても、エラーにならず何も表示しない", async () => {
    localStorage.setItem(SESSION_KEY, markdownSession("C:\\notes\\a.md", null));
    const workspace = mountWorkspace();
    detach?.();
    detach = null;
    await settle(); // 読み込みが完了しても描画されないことを確認するための待ち時間(不在の確認)
    expect(workspace.active).not.toBeNull();
    expect(host.querySelector(".cm-editor")).toBeNull();
  });

  it("名前を付けて保存で .txt → .md に変えると、装飾が有効になる", async () => {
    const workspace = mountWorkspace();
    workspace.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "# 見出し" } });
      return true;
    });
    saveDialog.mockResolvedValueOnce("C:\\notes\\renamed.md");
    invoke.mockResolvedValue(undefined);
    expect(await workspace.saveAs()).toBe(true);
    expect(workspace.active?.path).toBe("C:\\notes\\renamed.md");
    expect(hasHeading(workspace, 0)).toBe(true);
    expect(workspace.active?.dirty).toBe(false);
  });
});

describe("ファイルを開く", () => {
  it("Markdown を開くと、最初から装飾付きで表示され、同じファイルは重複して開かない", async () => {
    const workspace = mountWorkspace();
    invoke.mockResolvedValue({ content: "# 開いた見出し\r\n本文", encoding: "UTF-8", hadErrors: false });

    await workspace.openPaths(["C:\\notes\\open.md"]);
    // 未編集の空タブは置き換えられる
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.active?.path).toBe("C:\\notes\\open.md");
    expect(workspace.active?.eol).toBe("CRLF");
    let heading = false;
    syntaxTree(workspace.active!.editorState).iterate({
      enter: (n) => {
        if (n.name === "ATXHeading1") heading = true;
      },
    });
    expect(heading).toBe(true);

    await workspace.openPaths(["C:\\notes\\open.md"]);
    expect(workspace.tabs).toHaveLength(1);
    expect(invoke).toHaveBeenCalledTimes(1); // 2回目は読み込み自体をしない
  });

  it("読み込みに失敗しても、既存のタブは壊れない", async () => {
    const workspace = mountWorkspace();
    invoke.mockRejectedValueOnce("permission denied");
    await expect(workspace.openPaths(["C:\\nope.txt"])).rejects.toBe("permission denied");
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.active).not.toBeNull();
  });
});

describe("タブを閉じる", () => {
  it("未保存のタブは確認が出て、「キャンセル」なら閉じない", async () => {
    const workspace = mountWorkspace();
    workspace.newTab();
    workspace.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "unsaved" } });
      return true;
    });
    const id = workspace.active!.id;
    const closing = workspace.closeTab(id);
    expect(workspace.pendingClose).not.toBeNull();
    workspace.resolvePendingClose("cancel");
    await closing;
    expect(workspace.tabs.some((t) => t.id === id)).toBe(true);
    expect(workspace.pendingClose).toBeNull();
  });

  it("「保存しない」なら破棄して閉じ、最後のタブでなければウィンドウは閉じない", async () => {
    const workspace = mountWorkspace();
    workspace.newTab();
    workspace.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "discard me" } });
      return true;
    });
    const id = workspace.active!.id;
    const closing = workspace.closeTab(id);
    workspace.resolvePendingClose("discard");
    await closing;
    expect(workspace.tabs.some((t) => t.id === id)).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("「保存」を選び、保存ダイアログをキャンセルしたら閉じずに残る", async () => {
    const workspace = mountWorkspace();
    workspace.runCommand((v) => {
      v.dispatch({ changes: { from: 0, insert: "keep" } });
      return true;
    });
    const id = workspace.active!.id;
    saveDialog.mockResolvedValueOnce(null);
    const closing = workspace.closeTab(id);
    workspace.resolvePendingClose("save");
    await closing;
    expect(workspace.tabs.some((t) => t.id === id)).toBe(true);
  });

  it("未変更の最後のタブを閉じると、確認なしでウィンドウを閉じる", async () => {
    const workspace = mountWorkspace();
    await workspace.closeTab(workspace.active!.id);
    expect(workspace.pendingClose).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
    // 次回起動で古いタブが復元されない
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).tabs).toHaveLength(0);
  });

  it("存在しないタブ ID を閉じようとしても何も起きない", async () => {
    const workspace = mountWorkspace();
    await workspace.closeTab("tab-does-not-exist");
    expect(workspace.tabs).toHaveLength(1);
  });
});

describe("Ctrl+ホイールでのズーム", () => {
  const wheel = (deltaY: number, ctrlKey: boolean): WheelEvent => {
    const event = new WheelEvent("wheel", { deltaY, ctrlKey, bubbles: true, cancelable: true });
    host.dispatchEvent(event);
    return event;
  };
  const press = (type: "keydown" | "keyup", ctrlKey: boolean): void => {
    window.dispatchEvent(new KeyboardEvent(type, { key: "Control", ctrlKey, bubbles: true }));
  };

  it("Ctrl を押している間だけ拡大・縮小でき、ブラウザ既定の動作は抑止される", () => {
    const workspace = mountWorkspace();
    press("keydown", true);
    const up = wheel(-100, true);
    expect(workspace.zoom).toBe(110);
    expect(up.defaultPrevented).toBe(true);
    wheel(100, true);
    wheel(100, true);
    expect(workspace.zoom).toBe(90);
  });

  it("Ctrl を離したら、通常のスクロールを妨げない(リスナーが外れる)", () => {
    const workspace = mountWorkspace();
    press("keydown", true);
    press("keyup", false);
    const scroll = wheel(-100, false);
    expect(workspace.zoom).toBe(100);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it("通常時は wheel リスナーを付けず(スクロールを妨げない)、Ctrl 押下中だけ付ける", () => {
    const add = vi.spyOn(host, "addEventListener");
    const remove = vi.spyOn(host, "removeEventListener");
    mountWorkspace();
    const wheelAdds = () => add.mock.calls.filter(([type]) => type === "wheel").length;
    const wheelRemoves = () => remove.mock.calls.filter(([type]) => type === "wheel").length;

    expect(wheelAdds()).toBe(0); // 起動直後は付いていない
    press("keydown", true);
    expect(wheelAdds()).toBe(1);
    press("keydown", true); // 押しっぱなしのキーリピートで二重に付けない
    expect(wheelAdds()).toBe(1);
    press("keyup", false);
    expect(wheelRemoves()).toBe(1);
    // 付けるときは preventDefault のため passive:false であること
    const options = add.mock.calls.find(([type]) => type === "wheel")![2];
    expect(options).toEqual({ passive: false });
  });

  it("破棄時に、付けたままのリスナーも確実に外す", () => {
    const remove = vi.spyOn(host, "removeEventListener");
    mountWorkspace();
    press("keydown", true);
    detach?.();
    detach = null;
    expect(remove.mock.calls.some(([type]) => type === "wheel")).toBe(true);
  });

  it("Ctrl を押していなければ、ホイールでは拡大縮小されない", () => {
    const workspace = mountWorkspace();
    wheel(-100, false);
    expect(workspace.zoom).toBe(100);
  });

  it("拡大率は 50%〜300% の範囲を超えない", () => {
    const workspace = mountWorkspace();
    press("keydown", true);
    for (let i = 0; i < 40; i++) wheel(-100, true);
    expect(workspace.zoom).toBe(300);
    for (let i = 0; i < 60; i++) wheel(100, true);
    expect(workspace.zoom).toBe(50);
  });

  it("ウィンドウのフォーカスが外れたら、押下状態を解除する", () => {
    const workspace = mountWorkspace();
    press("keydown", true);
    window.dispatchEvent(new Event("blur"));
    const scroll = wheel(-100, false);
    expect(workspace.zoom).toBe(100);
    expect(scroll.defaultPrevented).toBe(false);
  });
});

describe("拡大率の指定", () => {
  it("範囲外や小数は丸められる", () => {
    const workspace = mountWorkspace();
    workspace.setZoom(1);
    expect(workspace.zoom).toBe(50);
    workspace.setZoom(99999);
    expect(workspace.zoom).toBe(300);
    workspace.setZoom(133.6);
    expect(workspace.zoom).toBe(134);
  });
});
