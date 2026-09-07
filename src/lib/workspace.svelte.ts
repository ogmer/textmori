import { EditorState, Text } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import {
  confirm,
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { createEditorState, wrapCompartment } from "./editor";

export type Eol = "LF" | "CRLF";

const UNTITLED = "無題";

const FILTERS = [
  {
    name: "テキストファイル",
    extensions: [
      "txt", "md", "markdown", "log", "csv", "tsv", "json", "yaml", "yml",
      "toml", "ini", "conf", "env", "js", "ts", "css", "html", "svelte", "rs",
    ],
  },
  { name: "すべてのファイル", extensions: ["*"] },
];

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
export const DEFAULT_FONT_SIZE = 14;

let counter = 0;

export class Tab {
  readonly id: string;
  path = $state<string | null>(null);
  eol = $state<Eol>("LF");
  editorState = $state.raw(EditorState.create());
  savedDoc = $state.raw(Text.empty);

  constructor(state: EditorState, path: string | null = null, eol: Eol = "LF") {
    this.id = `tab-${++counter}`;
    this.editorState = state;
    this.savedDoc = state.doc;
    this.path = path;
    this.eol = eol;
  }

  get name(): string {
    return this.path ? (this.path.split(/[\\/]/).pop() ?? UNTITLED) : UNTITLED;
  }

  get dirty(): boolean {
    return !this.editorState.doc.eq(this.savedDoc);
  }

  /** 元ファイルの改行コードを維持したまま書き出す内容 */
  get serialized(): string {
    const text = this.editorState.doc.toString();
    return this.eol === "CRLF" ? text.replace(/\n/g, "\r\n") : text;
  }
}

export class Workspace {
  tabs = $state<Tab[]>([]);
  activeId = $state<string | null>(null);
  wrap = $state(true);
  fontSize = $state(DEFAULT_FONT_SIZE);
  #view: EditorView | null = null;

  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  get hasUnsavedChanges(): boolean {
    return this.tabs.some((tab) => tab.dirty);
  }

  /** ステータスバー用のカーソル・文書情報 */
  get status() {
    const state = this.active?.editorState;
    if (!state) return { line: 1, column: 1, selected: 0, lines: 1, chars: 0 };
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    return {
      line: line.number,
      column: cursor - line.from + 1,
      selected: state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0),
      lines: state.doc.lines,
      chars: state.doc.length,
    };
  }

  /** エディタを DOM にマウントする。戻り値は破棄用のクリーンアップ関数。 */
  attach(parent: HTMLElement): () => void {
    if (this.tabs.length === 0) this.newTab();
    this.#view = new EditorView({ state: this.active!.editorState, parent });
    this.#view.focus();
    return () => {
      this.#view?.destroy();
      this.#view = null;
    };
  }

  newTab(): void {
    this.#addTab(new Tab(this.#createState("")));
  }

  async open(): Promise<void> {
    const selected = await openDialog({ multiple: true, filters: FILTERS });
    if (!selected) return;
    await this.openPaths(Array.isArray(selected) ? selected : [selected]);
  }

  async openPaths(paths: string[]): Promise<void> {
    for (const path of paths) {
      const opened = this.tabs.find((tab) => tab.path === path);
      if (opened) {
        this.#activate(opened);
        continue;
      }
      const content = await readTextFile(path);
      const eol: Eol = content.includes("\r\n") ? "CRLF" : "LF";
      this.#addTab(new Tab(this.#createState(content), path, eol));
    }
  }

  async save(target: Tab | null = this.active): Promise<void> {
    if (!target) return;
    if (!target.path) return this.saveAs(target);
    await writeTextFile(target.path, target.serialized);
    target.savedDoc = target.editorState.doc;
  }

  async saveAs(target: Tab | null = this.active): Promise<void> {
    if (!target) return;
    const path = await saveDialog({
      defaultPath: target.path ?? `${UNTITLED}.txt`,
      filters: FILTERS,
    });
    if (!path) return;
    await writeTextFile(path, target.serialized);
    target.path = path;
    target.savedDoc = target.editorState.doc;
  }

  async closeTab(id: string): Promise<void> {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const tab = this.tabs[index];
    if (tab.dirty) {
      const discard = await confirm(
        `「${tab.name}」の変更は保存されていません。閉じてよろしいですか?`,
        { title: "textmori", kind: "warning" },
      );
      if (!discard) return;
    }
    this.tabs.splice(index, 1);
    if (this.tabs.length === 0) {
      this.newTab();
    } else if (this.activeId === id) {
      this.#activate(this.tabs[Math.min(index, this.tabs.length - 1)]);
    }
  }

  select(id: string): void {
    if (id === this.activeId) return;
    const tab = this.tabs.find((t) => t.id === id);
    if (tab) this.#activate(tab);
  }

  selectRelative(offset: number): void {
    if (this.tabs.length < 2) return;
    const index = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const next = (index + offset + this.tabs.length) % this.tabs.length;
    this.#activate(this.tabs[next]);
  }

  toggleWrap(): void {
    this.wrap = !this.wrap;
    this.#applyWrap();
  }

  setFontSize(size: number): void {
    this.fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    this.#view?.requestMeasure();
  }

  focus(): void {
    this.#view?.focus();
  }

  #createState(doc: string): EditorState {
    return createEditorState(doc, this.wrap, this.#onUpdate);
  }

  /** エディタの変更を常にアクティブなタブへ書き戻し、派生状態を最新に保つ */
  #onUpdate = (update: ViewUpdate): void => {
    const tab = this.active;
    if (tab) tab.editorState = update.state;
  };

  #addTab(tab: Tab): void {
    const current = this.active;
    // 未編集の「無題」タブしかない場合は置き換える
    if (this.tabs.length === 1 && current && !current.path && !current.dirty) {
      this.tabs = [tab];
    } else {
      this.tabs.push(tab);
    }
    this.#activate(tab);
  }

  #activate(tab: Tab): void {
    this.activeId = tab.id;
    this.#view?.setState(tab.editorState);
    this.#applyWrap();
    this.#view?.focus();
  }

  /** 折り返し設定は状態ごとに持つため、アクティブな状態へ都度反映する */
  #applyWrap(): void {
    this.#view?.dispatch({
      effects: wrapCompartment.reconfigure(
        this.wrap ? EditorView.lineWrapping : [],
      ),
    });
  }
}

export const workspace = new Workspace();
