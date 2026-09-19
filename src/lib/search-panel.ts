import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from "@codemirror/search";

/**
 * 検索・置換パネル。CodeMirror 標準のパネルは英語表記で、ヒット件数も出ないため、
 * 次の点を改善した自前実装に差し替えている。
 * - 日本語表示、ヒット件数(「3/12」)、見つからない/正規表現が不正な時の表示
 * - 入力しながら最初の一致箇所へ移動(インクリメンタル検索)
 * - Enter / Shift+Enter で次・前へ、Esc で閉じてエディタに戻る
 * - 置換欄は Ctrl+H で開く(Ctrl+F では検索だけの軽い表示)
 * 検索の状態自体(クエリ・ハイライト・次へ/前へ・置換の処理)は CodeMirror 標準のものを使う。
 */

/** ヒット件数を数える上限(巨大ファイルで数え続けて固まらないようにする) */
const COUNT_LIMIT = 9999;
/** 件数計算に使ってよい時間の目安(ms)。超えたら途中までの件数を「+」付きで出す */
const COUNT_BUDGET_MS = 30;

/** 置換欄を開いた状態を、次に開くパネルにも引き継ぐ */
let preferReplace = false;

const panels = new WeakMap<EditorView, SearchPanel>();

class SearchPanel implements Panel {
  readonly dom: HTMLElement;
  private query: SearchQuery;
  private readonly findInput: HTMLInputElement;
  private readonly replaceInput: HTMLInputElement;
  private readonly replaceRow: HTMLElement;
  private readonly expandButton: HTMLButtonElement;
  private readonly countEl: HTMLElement;
  private readonly toggles: Record<"caseSensitive" | "wholeWord" | "regexp", HTMLButtonElement>;
  private countTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly view: EditorView) {
    this.query = getSearchQuery(view.state);

    const el = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className: string,
      props: Partial<HTMLElementTagNameMap[K]> = {},
    ): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      node.className = className;
      Object.assign(node, props);
      return node;
    };
    const button = (className: string, text: string, title: string): HTMLButtonElement => {
      const b = el("button", className, { type: "button", textContent: text, title });
      b.setAttribute("aria-label", title);
      return b;
    };

    this.expandButton = button("tm-expand", "▸", "置換を表示 (Ctrl+H)");
    this.expandButton.setAttribute("aria-expanded", "false");

    this.findInput = el("input", "tm-input tm-find", {
      type: "text",
      placeholder: "検索",
      spellcheck: false,
    });
    this.findInput.setAttribute("main-field", "true");
    this.findInput.setAttribute("aria-label", "検索");
    this.countEl = el("span", "tm-count");
    this.countEl.setAttribute("role", "status");
    const findField = el("div", "tm-field");
    findField.append(this.findInput, this.countEl);

    const prev = button("tm-btn", "↑", "前を検索 (Shift+Enter)");
    const next = button("tm-btn", "↓", "次を検索 (Enter)");
    this.toggles = {
      caseSensitive: button("tm-toggle", "Aa", "大文字と小文字を区別する"),
      wholeWord: button("tm-toggle", "単語", "単語単位で検索する"),
      regexp: button("tm-toggle", ".*", "正規表現を使う"),
    };
    for (const toggle of Object.values(this.toggles)) toggle.setAttribute("aria-pressed", "false");
    const close = button("tm-btn tm-close", "×", "閉じる (Esc)");

    const findRow = el("div", "tm-row");
    findRow.append(
      this.expandButton,
      findField,
      prev,
      next,
      this.toggles.caseSensitive,
      this.toggles.wholeWord,
      this.toggles.regexp,
      close,
    );

    this.replaceInput = el("input", "tm-input tm-replace", {
      type: "text",
      placeholder: "置換後の文字列",
      spellcheck: false,
    });
    this.replaceInput.setAttribute("aria-label", "置換後の文字列");
    const replaceOne = button("tm-btn tm-text", "置換", "置換して次へ (Enter)");
    const replaceEvery = button("tm-btn tm-text", "すべて置換", "すべて置換 (Ctrl+Alt+Enter)");
    this.replaceRow = el("div", "tm-row tm-replace-row");
    const spacer = el("span", "tm-expand-spacer");
    const replaceField = el("div", "tm-field");
    replaceField.append(this.replaceInput);
    this.replaceRow.append(spacer, replaceField, replaceOne, replaceEvery);

    this.dom = el("div", "tm-search");
    this.dom.append(findRow, this.replaceRow);

    // ── イベント ──
    this.findInput.addEventListener("input", () => {
      this.commit();
      this.jumpToFirstMatch();
    });
    this.replaceInput.addEventListener("input", () => this.commit());
    for (const toggle of Object.values(this.toggles)) {
      toggle.addEventListener("click", () => {
        toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
        this.commit();
        this.findInput.focus();
      });
    }
    prev.addEventListener("click", () => this.run(findPrevious));
    next.addEventListener("click", () => this.run(findNext));
    replaceOne.addEventListener("click", () => this.run(replaceNext));
    replaceEvery.addEventListener("click", () => this.run(replaceAll));
    close.addEventListener("click", () => this.closePanel());
    this.expandButton.addEventListener("click", () => this.setReplaceVisible(!!this.replaceRow.hidden));
    this.dom.addEventListener("keydown", (event) => this.onKeydown(event));

    this.syncFromQuery();
    this.setReplaceVisible(preferReplace);
    panels.set(view, this);
  }

  top = true;

  mount(): void {
    this.findInput.focus();
    this.findInput.select();
    this.scheduleCount();
  }

  update(update: ViewUpdate): void {
    let queryEffect = false;
    let external = false;
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (!effect.is(setSearchQuery)) continue;
        queryEffect = true;
        // このパネル自身が commit() で送ったクエリは this.query と同じ。違う場合だけ
        // 外部からの変更(選択文字列の自動入力など)なので、入力欄の表示を合わせる
        if (!effect.value.eq(this.query)) {
          this.query = effect.value;
          external = true;
        }
      }
    }
    if (external) this.syncFromQuery();
    // 自分で変えた場合も、検索語やオプションが変わったので件数は数え直す
    if (queryEffect || update.docChanged || update.selectionSet) this.scheduleCount();
  }

  destroy(): void {
    if (this.countTimer) clearTimeout(this.countTimer);
    if (panels.get(this.view) === this) panels.delete(this.view);
  }

  /** 置換欄の表示/非表示。次に開くパネルにも引き継ぐ。 */
  setReplaceVisible(visible: boolean): void {
    preferReplace = visible;
    this.replaceRow.hidden = !visible;
    this.expandButton.textContent = visible ? "▾" : "▸";
    this.expandButton.setAttribute("aria-expanded", String(visible));
    const label = visible ? "置換を隠す (Ctrl+H)" : "置換を表示 (Ctrl+H)";
    this.expandButton.title = label;
    this.expandButton.setAttribute("aria-label", label);
  }

  focusFind(): void {
    this.findInput.focus();
    this.findInput.select();
  }

  /** 入力欄・トグルの状態から検索クエリを作り、変化があれば反映する */
  private commit(): void {
    const query = new SearchQuery({
      search: this.findInput.value,
      replace: this.replaceInput.value,
      caseSensitive: this.toggles.caseSensitive.getAttribute("aria-pressed") === "true",
      wholeWord: this.toggles.wholeWord.getAttribute("aria-pressed") === "true",
      regexp: this.toggles.regexp.getAttribute("aria-pressed") === "true",
    });
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  /** 外部からクエリが変わった時(選択文字列での自動入力など)に、表示を合わせる */
  private syncFromQuery(): void {
    const q = this.query;
    if (this.findInput.value !== q.search) this.findInput.value = q.search;
    if (this.replaceInput.value !== q.replace) this.replaceInput.value = q.replace;
    this.toggles.caseSensitive.setAttribute("aria-pressed", String(q.caseSensitive));
    this.toggles.wholeWord.setAttribute("aria-pressed", String(q.wholeWord));
    this.toggles.regexp.setAttribute("aria-pressed", String(q.regexp));
  }

  private run(command: (view: EditorView) => boolean): void {
    this.commit();
    command(this.view);
  }

  private closePanel(): void {
    closeSearchPanel(this.view);
    this.view.focus();
  }

  private onKeydown(event: KeyboardEvent): void {
    const inReplace = event.target === this.replaceInput;
    if (event.key === "Escape") {
      event.preventDefault();
      this.closePanel();
    } else if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if ((event.ctrlKey || event.metaKey) && event.altKey) this.run(replaceAll);
      else if (inReplace) this.run(replaceNext);
      else this.run(event.shiftKey ? findPrevious : findNext);
    } else if (runScopeHandlers(this.view, event, "search-panel")) {
      // F3 / Ctrl+F など、標準のキー割り当て
      event.preventDefault();
    }
  }

  /** 入力しながら、現在位置以降の最初の一致箇所へ移動する(末尾なら先頭へ回り込む) */
  private jumpToFirstMatch(): void {
    const query = getSearchQuery(this.view.state);
    if (!query.valid) return;
    const from = this.view.state.selection.main.from;
    let result = query.getCursor(this.view.state, from).next();
    if (result.done && from > 0) result = query.getCursor(this.view.state).next();
    if (result.done) return;
    const range = EditorSelection.range(result.value.from, result.value.to);
    this.view.dispatch({
      selection: range,
      effects: EditorView.scrollIntoView(range),
      userEvent: "select.search",
    });
  }

  private scheduleCount(): void {
    if (this.countTimer) clearTimeout(this.countTimer);
    // 小さい文書は即時に、大きい文書は入力の連続に付き合わないよう少し間引く
    const delay = this.view.state.doc.length < 200_000 ? 0 : 80;
    this.countTimer = setTimeout(() => this.renderCount(), delay);
  }

  private renderCount(): void {
    this.countTimer = null;
    const state = this.view.state;
    const query = getSearchQuery(state);
    const { text, nomatch } = describeMatches(state, query);
    this.countEl.textContent = text;
    this.findInput.classList.toggle("tm-nomatch", nomatch);
    this.findInput.setAttribute("aria-invalid", String(nomatch));
  }
}

/** ヒット状況の表示文字列を作る。検索語が空なら何も出さない。 */
export function describeMatches(
  state: EditorState,
  query: SearchQuery,
): { text: string; nomatch: boolean } {
  if (!query.search) return { text: "", nomatch: false };
  if (!query.valid) return { text: "正規表現が不正です", nomatch: true };

  const selection = state.selection.main;
  const cursor = query.getCursor(state);
  const started = performance.now();
  let total = 0;
  let current = 0;
  let capped = false;
  for (let result = cursor.next(); !result.done; result = cursor.next()) {
    total++;
    if (result.value.from === selection.from && result.value.to === selection.to) current = total;
    if (total >= COUNT_LIMIT || (total % 256 === 0 && performance.now() - started > COUNT_BUDGET_MS)) {
      capped = true;
      break;
    }
  }
  if (total === 0) return { text: "見つかりません", nomatch: true };
  const suffix = capped ? "+" : "";
  return { text: current ? `${current}/${total}${suffix}` : `${total}${suffix}件`, nomatch: false };
}

/** Ctrl+H / メニューの「置換」: 置換欄も表示した状態で検索パネルを開く */
export function openReplacePanel(view: EditorView): boolean {
  preferReplace = true;
  openSearchPanel(view);
  const panel = panels.get(view);
  panel?.setReplaceVisible(true);
  panel?.focusFind();
  return true;
}

/** 検索パネルの日本語化と自前パネルへの差し替え(CodeMirror の検索状態・キー割り当てはそのまま使う) */
export const searchExtension: Extension = [
  search({ top: true, createPanel: (view) => new SearchPanel(view) }),
  // 「行へ移動」(Ctrl+Alt+G)など、標準のダイアログ文言も日本語にする
  EditorState.phrases.of({
    "Go to line": "行へ移動",
    go: "移動",
  }),
];
