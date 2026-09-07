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

/**
 * 行の折り返しは実行中に切り替えるため Compartment 経由で再設定する。
 * タブごとに EditorState を持つので、タブ切り替え時にも再設定が必要。
 */
export const wrapCompartment = new Compartment();

/**
 * プレーンテキスト編集に必要な拡張のみを列挙する。
 * codemirror パッケージの basicSetup は自動補完・lint・コード折りたたみを
 * 含むため、軽量化のため採用していない。
 */
function extensions(wrap: boolean, onUpdate: (update: ViewUpdate) => void): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
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
    EditorView.updateListener.of((update) => {
      // setState によるタブ切り替えでは transactions が空になるため除外する
      if (update.transactions.length > 0) onUpdate(update);
    }),
  ];
}

export function createEditorState(
  doc: string,
  wrap: boolean,
  onUpdate: (update: ViewUpdate) => void,
): EditorState {
  return EditorState.create({ doc, extensions: extensions(wrap, onUpdate) });
}
