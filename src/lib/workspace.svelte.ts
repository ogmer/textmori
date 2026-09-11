import { EditorState, Text } from "@codemirror/state";
import { EditorView, type Command, type ViewUpdate } from "@codemirror/view";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  readText as readClipboardText,
  writeText as writeClipboardText,
} from "@tauri-apps/plugin-clipboard-manager";
import {
  confirm,
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { createEditorState, wrapCompartment } from "./editor";

export type Eol = "LF" | "CRLF";

const UNTITLED = "無題";
/** タブ名に使う 1 行目テキストの最大文字数 */
const TAB_NAME_MAX_LENGTH = 24;

/** セッション(タブの内容・折り返し・ズーム)の保存先キー */
const SESSION_KEY = "textmori:session";
/** 入力中の頻繁な保存を間引く間隔(ms) */
const PERSIST_DEBOUNCE_MS = 300;

interface PersistedTab {
  path: string | null;
  content: string;
  savedContent: string;
  eol: Eol;
}

interface PersistedSession {
  tabs: PersistedTab[];
  activeIndex: number;
  wrap: boolean;
  zoom: number;
}

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

/** 100% のときの基準フォントサイズ(px) */
export const BASE_FONT_SIZE = 14;

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 10;
export const DEFAULT_ZOOM = 100;

/** ズームボタンで順に切り替えるプリセット比率(%) */
export const ZOOM_PRESETS = [50, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];

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

  /** 保存済みならファイル名、未保存なら 1 行目のテキストをタブ名にする(メモ帳と同じ挙動) */
  get name(): string {
    if (this.path) return this.path.split(/[\\/]/).pop() ?? UNTITLED;
    const firstLine = this.editorState.doc.line(1).text.trim();
    if (!firstLine) return UNTITLED;
    return firstLine.length > TAB_NAME_MAX_LENGTH
      ? `${firstLine.slice(0, TAB_NAME_MAX_LENGTH)}…`
      : firstLine;
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
  zoom = $state(DEFAULT_ZOOM);
  #view: EditorView | null = null;

  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
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
    if (this.tabs.length === 0 && !this.#restoreSession()) this.newTab();
    this.#view = new EditorView({ state: this.active!.editorState, parent });
    this.#view.focus();
    return () => {
      this.#view?.destroy();
      this.#view = null;
    };
  }

  newTab(): void {
    const tab = new Tab(this.#createState(""));
    this.tabs.push(tab);
    this.#activate(tab);
    this.#persistNow();
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
    this.#persistNow();
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
    this.#persistNow();
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
      // 最後のタブを閉じたらウィンドウごと終了する。セッションは空として保存し、
      // 次回起動時に無関係な古いタブが復元されないようにする。
      this.#persistNow();
      await getCurrentWindow().destroy();
    } else {
      if (this.activeId === id) {
        this.#activate(this.tabs[Math.min(index, this.tabs.length - 1)]);
      }
      this.#persistNow();
    }
  }

  select(id: string): void {
    if (id === this.activeId) return;
    const tab = this.tabs.find((t) => t.id === id);
    if (tab) {
      this.#activate(tab);
      this.#persistNow();
    }
  }

  selectRelative(offset: number): void {
    if (this.tabs.length < 2) return;
    const index = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const next = (index + offset + this.tabs.length) % this.tabs.length;
    this.#activate(this.tabs[next]);
    this.#persistNow();
  }

  toggleWrap(): void {
    this.wrap = !this.wrap;
    this.#applyWrap();
    this.#persistNow();
  }

  setZoom(percent: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent)));
    this.#view?.requestMeasure();
    this.#persistNow();
  }

  zoomIn(): void {
    this.setZoom(this.zoom + ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.zoom - ZOOM_STEP);
  }

  /** ステータスバーのズームボタン用。プリセットを1段階ずつ順送りする。 */
  cycleZoom(direction: 1 | -1): void {
    if (direction > 0) {
      const next = ZOOM_PRESETS.find((preset) => preset > this.zoom);
      this.setZoom(next ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1]);
    } else {
      const prev = [...ZOOM_PRESETS].reverse().find((preset) => preset < this.zoom);
      this.setZoom(prev ?? ZOOM_PRESETS[0]);
    }
  }

  focus(): void {
    this.#view?.focus();
  }

  /** メニューから CodeMirror のコマンドを実行する */
  runCommand(command: Command): void {
    if (!this.#view) return;
    command(this.#view);
    this.#view.focus();
  }

  get selectedText(): string {
    const state = this.active?.editorState;
    if (!state) return "";
    return state.selection.ranges
      .filter((range) => !range.empty)
      .map((range) => state.sliceDoc(range.from, range.to))
      .join("\n");
  }

  async cut(): Promise<void> {
    const text = this.selectedText;
    if (!text) return;
    await writeClipboardText(text);
    this.#view?.dispatch(this.#view.state.replaceSelection(""));
    this.focus();
  }

  async copy(): Promise<void> {
    const text = this.selectedText;
    if (text) await writeClipboardText(text);
    this.focus();
  }

  async paste(): Promise<void> {
    const text = await readClipboardText();
    if (!text || !this.#view) return;
    this.#view.dispatch(this.#view.state.replaceSelection(text));
    this.focus();
  }

  #createState(doc: string): EditorState {
    return createEditorState(doc, this.wrap, this.#onUpdate);
  }

  /** エディタの変更を常にアクティブなタブへ書き戻し、派生状態を最新に保つ */
  #onUpdate = (update: ViewUpdate): void => {
    const tab = this.active;
    if (tab) tab.editorState = update.state;
    this.#schedulePersist();
  };

  /** ファイルを開く際に使う。未編集の「無題」タブしかない場合はそれを置き換える。 */
  #addTab(tab: Tab): void {
    const current = this.active;
    if (this.tabs.length === 1 && current && !current.path && !current.dirty) {
      this.tabs = [tab];
    } else {
      this.tabs.push(tab);
    }
    this.#activate(tab);
    this.#persistNow();
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

  #persistTimer: ReturnType<typeof setTimeout> | null = null;

  /** 入力中の連続変更をまとめて保存する */
  #schedulePersist(): void {
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = setTimeout(() => this.#persistNow(), PERSIST_DEBOUNCE_MS);
  }

  /** 現在の全タブ・折り返し・ズームをセッションとして保存する。
   *  アプリを閉じても内容が失われないようにするための仕組みで、
   *  未保存の変更もそのまま復元できるよう savedContent を別途保持する。 */
  #persistNow(): void {
    if (this.#persistTimer) {
      clearTimeout(this.#persistTimer);
      this.#persistTimer = null;
    }
    try {
      const data: PersistedSession = {
        tabs: this.tabs.map((tab) => ({
          path: tab.path,
          content: tab.editorState.doc.toString(),
          savedContent: tab.savedDoc.toString(),
          eol: tab.eol,
        })),
        activeIndex: Math.max(
          0,
          this.tabs.findIndex((tab) => tab.id === this.activeId),
        ),
        wrap: this.wrap,
        zoom: this.zoom,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      // localStorage が使えない環境では諦める(セッション復元は行われない)
    }
  }

  /** 直前のセッションを復元する。復元できた場合は true を返す。 */
  #restoreSession(): boolean {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as Partial<PersistedSession>;
      if (!Array.isArray(data.tabs) || data.tabs.length === 0) return false;

      if (typeof data.wrap === "boolean") this.wrap = data.wrap;
      if (typeof data.zoom === "number") {
        this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, data.zoom));
      }

      const tabs = data.tabs.map((t) => {
        const tab = new Tab(
          this.#createState(String(t.content ?? "")),
          t.path ?? null,
          t.eol === "CRLF" ? "CRLF" : "LF",
        );
        tab.savedDoc = EditorState.create({
          doc: String(t.savedContent ?? t.content ?? ""),
        }).doc;
        return tab;
      });
      this.tabs = tabs;

      const index = data.activeIndex ?? 0;
      this.activeId = tabs[Math.min(Math.max(index, 0), tabs.length - 1)].id;
      return true;
    } catch {
      return false;
    }
  }
}

export const workspace = new Workspace();
