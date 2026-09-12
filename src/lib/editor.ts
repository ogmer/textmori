import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { bracketMatching } from "@codemirror/language";
import { markdownExtension } from "./markdown";

/**
 * 行の折り返しは実行中に切り替えるため Compartment 経由で再設定する。
 * タブごとに EditorState を持つので、タブ切り替え時にも再設定が必要。
 */
export const wrapCompartment = new Compartment();

/** Markdown のライブ装飾は、名前を付けて保存で拡張子が変わった時にも
 *  再設定できるよう Compartment 経由にする。 */
export const markdownCompartment = new Compartment();

/**
 * プレーンテキスト編集に必要な拡張のみを列挙する。
 * codemirror パッケージの basicSetup は自動補完・lint・コード折りたたみを
 * 含むため、軽量化のため採用していない。
 */
function extensions(
  wrap: boolean,
  isMarkdown: boolean,
  onUpdate: (update: ViewUpdate) => void,
): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    // VS Code のように対応する括弧を強調表示する
    bracketMatching(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    wrapCompartment.of(wrap ? EditorView.lineWrapping : []),
    markdownCompartment.of(markdownExtension(isMarkdown)),
    EditorView.updateListener.of((update) => {
      // setState によるタブ切り替えでは transactions が空になるため除外する
      if (update.transactions.length > 0) onUpdate(update);
    }),
  ];
}

export function createEditorState(
  doc: string,
  wrap: boolean,
  isMarkdown: boolean,
  onUpdate: (update: ViewUpdate) => void,
): EditorState {
  return EditorState.create({ doc, extensions: extensions(wrap, isMarkdown, onUpdate) });
}
