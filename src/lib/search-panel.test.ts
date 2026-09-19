// @vitest-environment jsdom
import { getSearchQuery, openSearchPanel, searchPanelOpen } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeMatches, openReplacePanel, searchExtension } from "./search-panel";

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
let view: EditorView;

function mount(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [searchExtension] }),
    parent: host,
  });
  return view;
}

const q = <T extends Element>(selector: string): T => host.querySelector<T>(selector)!;
const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const selectedText = (): string => {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
};
const count = (): string => q<HTMLElement>(".tm-count").textContent ?? "";

beforeEach(() => {
  stubLayoutApis();
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  view.destroy();
  host.remove();
});

describe("検索パネルの表示", () => {
  it("開くと日本語のパネルが出て、検索欄にフォーカスされる", () => {
    mount("hello");
    openSearchPanel(view);
    expect(searchPanelOpen(view.state)).toBe(true);
    expect(q<HTMLInputElement>(".tm-find").placeholder).toBe("検索");
    expect(q(".tm-toggle[title='正規表現を使う']")).not.toBeNull();
    expect(document.activeElement).toBe(q(".tm-find"));
  });

  it("検索だけで開いた時は置換欄が隠れ、Ctrl+H 相当のコマンドで表示される", () => {
    mount("hello");
    openSearchPanel(view);
    expect(q<HTMLElement>(".tm-replace-row").hidden).toBe(true);
    openReplacePanel(view);
    expect(q<HTMLElement>(".tm-replace-row").hidden).toBe(false);
    expect(q(".tm-expand").getAttribute("aria-expanded")).toBe("true");
  });

  it("置換欄を開いたままパネルを閉じて開き直すと、置換欄の表示も引き継ぐ", () => {
    mount("hello");
    openReplacePanel(view);
    key(q(".tm-find"), "Escape");
    expect(searchPanelOpen(view.state)).toBe(false);
    openSearchPanel(view);
    expect(q<HTMLElement>(".tm-replace-row").hidden).toBe(false);
    // 元に戻す
    q<HTMLButtonElement>(".tm-expand").click();
    expect(q<HTMLElement>(".tm-replace-row").hidden).toBe(true);
  });

  it("選択中の文字列が検索欄に自動で入る", () => {
    mount("alpha beta gamma");
    view.dispatch({ selection: { anchor: 6, head: 10 } });
    openSearchPanel(view);
    expect(q<HTMLInputElement>(".tm-find").value).toBe("beta");
  });
});

describe("ヒット件数と移動", () => {
  it("入力すると件数が出て、最初の一致箇所が選択される", () => {
    mount("cat dog cat bird cat");
    openSearchPanel(view);
    type(q(".tm-find"), "cat");
    expect(getSearchQuery(view.state).search).toBe("cat");
    expect(selectedText()).toBe("cat");
    expect(view.state.selection.main.from).toBe(0);
    return vi.waitFor(() => expect(count()).toBe("1/3"));
  });

  it("Enter で次へ、Shift+Enter で前へ移動し、末尾では先頭へ回り込む", async () => {
    mount("cat dog cat bird cat");
    openSearchPanel(view);
    type(q(".tm-find"), "cat");
    const input = q<HTMLInputElement>(".tm-find");
    key(input, "Enter");
    expect(view.state.selection.main.from).toBe(8);
    key(input, "Enter");
    expect(view.state.selection.main.from).toBe(17);
    key(input, "Enter"); // 回り込み
    expect(view.state.selection.main.from).toBe(0);
    key(input, "Enter", { shiftKey: true }); // 前へ(先頭の前 = 末尾)
    expect(view.state.selection.main.from).toBe(17);
    await vi.waitFor(() => expect(count()).toBe("3/3"));
  });

  it("見つからない時は「見つかりません」と表示し、入力欄を警告状態にする", async () => {
    mount("hello world");
    openSearchPanel(view);
    type(q(".tm-find"), "zzz");
    await vi.waitFor(() => expect(count()).toBe("見つかりません"));
    expect(q(".tm-find").classList.contains("tm-nomatch")).toBe(true);
    type(q(".tm-find"), "world");
    await vi.waitFor(() => expect(q(".tm-find").classList.contains("tm-nomatch")).toBe(false));
  });

  it("検索語を空にすると、件数表示も警告も消える", async () => {
    mount("hello");
    openSearchPanel(view);
    type(q(".tm-find"), "zzz");
    await vi.waitFor(() => expect(count()).toBe("見つかりません"));
    type(q(".tm-find"), "");
    await vi.waitFor(() => expect(count()).toBe(""));
    expect(q(".tm-find").classList.contains("tm-nomatch")).toBe(false);
  });

  it("文書を編集すると件数が更新される", async () => {
    mount("a a a");
    openSearchPanel(view);
    type(q(".tm-find"), "a");
    await vi.waitFor(() => expect(count()).toMatch(/\/3$/));
    view.dispatch({ changes: { from: 5, insert: " a" } });
    await vi.waitFor(() => expect(count()).toMatch(/\/4$/));
  });

  it("入力を進めても、現在の一致箇所から離れずに絞り込まれる", () => {
    mount("foo1 foo2 foobar");
    openSearchPanel(view);
    type(q(".tm-find"), "foo");
    expect(view.state.selection.main.from).toBe(0);
    type(q(".tm-find"), "foob");
    expect(selectedText()).toBe("foob");
    expect(view.state.selection.main.from).toBe(10);
  });
});

describe("オプション", () => {
  it("大文字小文字の区別をトグルすると、一致件数が変わる", async () => {
    mount("Cat cat CAT");
    openSearchPanel(view);
    type(q(".tm-find"), "cat");
    await vi.waitFor(() => expect(count()).toMatch(/\/3$/));
    q<HTMLButtonElement>(".tm-toggle[title='大文字と小文字を区別する']").click();
    expect(getSearchQuery(view.state).caseSensitive).toBe(true);
    await vi.waitFor(() => expect(count()).toMatch(/1件$|\/1$/));
    expect(q(".tm-toggle[title='大文字と小文字を区別する']").getAttribute("aria-pressed")).toBe("true");
  });

  it("単語単位のオプションで、単語の一部にはヒットしなくなる", async () => {
    mount("cat concat cat");
    openSearchPanel(view);
    type(q(".tm-find"), "cat");
    await vi.waitFor(() => expect(count()).toMatch(/\/3$/)); // concat の中の cat も含む
    q<HTMLButtonElement>(".tm-toggle[title='単語単位で検索する']").click();
    await vi.waitFor(() => expect(count()).toMatch(/\/2$|2件$/));
  });

  it("正規表現で検索でき、不正な式はエラー表示になる", async () => {
    mount("a1 b22 c333");
    openSearchPanel(view);
    q<HTMLButtonElement>(".tm-toggle[title='正規表現を使う']").click();
    type(q(".tm-find"), "[a-c]\\d+");
    await vi.waitFor(() => expect(count()).toMatch(/\/3$/));
    type(q(".tm-find"), "[a-");
    await vi.waitFor(() => expect(count()).toBe("正規表現が不正です"));
    expect(q(".tm-find").classList.contains("tm-nomatch")).toBe(true);
  });
});

describe("置換", () => {
  it("置換欄で Enter を押すと 1 件ずつ置換して次へ進む", async () => {
    mount("cat dog cat");
    openReplacePanel(view);
    type(q(".tm-find"), "cat");
    type(q(".tm-replace"), "bird");
    expect(getSearchQuery(view.state).replace).toBe("bird");
    key(q(".tm-replace"), "Enter");
    expect(view.state.doc.toString()).toBe("bird dog cat");
    key(q(".tm-replace"), "Enter");
    expect(view.state.doc.toString()).toBe("bird dog bird");
  });

  it("「すべて置換」ボタンで全件置換される", () => {
    mount("x-x-x");
    openReplacePanel(view);
    type(q(".tm-find"), "x");
    type(q(".tm-replace"), "yy");
    q<HTMLButtonElement>(".tm-replace-row button:last-of-type").click();
    expect(view.state.doc.toString()).toBe("yy-yy-yy");
  });

  it("Ctrl+Alt+Enter でもすべて置換できる", () => {
    mount("1 1 1");
    openReplacePanel(view);
    type(q(".tm-find"), "1");
    type(q(".tm-replace"), "2");
    key(q(".tm-find"), "Enter", { ctrlKey: true, altKey: true });
    expect(view.state.doc.toString()).toBe("2 2 2");
  });

  it("置換後を空にすると、一致箇所が削除される", () => {
    mount("a-b-a");
    openReplacePanel(view);
    type(q(".tm-find"), "a");
    q<HTMLButtonElement>(".tm-replace-row button:last-of-type").click();
    expect(view.state.doc.toString()).toBe("-b-");
  });

  it("IME 変換中の Enter(確定)では、検索が進まない", () => {
    mount("cat cat");
    openSearchPanel(view);
    type(q(".tm-find"), "cat");
    const before = view.state.selection.main.from;
    key(q(".tm-find"), "Enter", { isComposing: true });
    expect(view.state.selection.main.from).toBe(before);
  });
});

describe("閉じる", () => {
  it("Esc で閉じて、フォーカスがエディタに戻る", () => {
    mount("hello");
    openSearchPanel(view);
    const event = key(q(".tm-find"), "Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(searchPanelOpen(view.state)).toBe(false);
    expect(host.querySelector(".tm-search")).toBeNull();
  });

  it("×ボタンでも閉じられる", () => {
    mount("hello");
    openSearchPanel(view);
    q<HTMLButtonElement>(".tm-close").click();
    expect(searchPanelOpen(view.state)).toBe(false);
  });

  it("閉じた後に開き直すと、前回の検索語が残っている", () => {
    mount("hello world");
    openSearchPanel(view);
    type(q(".tm-find"), "world");
    q<HTMLButtonElement>(".tm-close").click();
    view.dispatch({ selection: { anchor: 0 } });
    openSearchPanel(view);
    expect(q<HTMLInputElement>(".tm-find").value).toBe("world");
  });
});

describe("describeMatches(件数の計算)", () => {
  const state = (doc: string) => EditorState.create({ doc, extensions: [searchExtension] });

  it("空の検索語は何も表示しない", () => {
    const s = state("abc");
    expect(describeMatches(s, getSearchQuery(s))).toEqual({ text: "", nomatch: false });
  });

  it("件数が上限を超える場合は「+」付きで打ち切る", () => {
    const s = state("a".repeat(20000));
    const query = new (getSearchQuery(s).constructor as new (c: { search: string }) => ReturnType<typeof getSearchQuery>)({
      search: "a",
    });
    const { text } = describeMatches(s, query);
    expect(text).toBe("9999+件");
  });

  it("大きな文書でも短時間で終わる", () => {
    const s = state("lorem ipsum dolor sit amet\n".repeat(200_000)); // 約 5MB
    const query = new (getSearchQuery(s).constructor as new (c: { search: string }) => ReturnType<typeof getSearchQuery>)({
      search: "zzz-no-such-text",
    });
    const started = performance.now();
    expect(describeMatches(s, query).text).toBe("見つかりません");
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
