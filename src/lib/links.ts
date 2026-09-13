import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";

/** http(s):// で始まる URL を検出する。VS Code に倣い Ctrl/Cmd+クリックで開く。 */
const URL_PATTERN = /https?:\/\/[^\s<>"'()]+/g;

const urlMatcher = new MatchDecorator({
  regexp: URL_PATTERN,
  decoration: () => Decoration.mark({ class: "cm-url-link" }),
});

/** URL をハイライトする ViewPlugin。装飾自体は常時付与し、下線表示は
 *  Ctrl/Cmd を押している間だけ CSS 側(:global(html.mod-key))で行う。 */
export const urlHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = urlMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = urlMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

function urlAtPos(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  const pattern = new RegExp(URL_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line.text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) return match[0];
    if (start > offset) break;
  }
  return null;
}

/** URL をクリックすると、デフォルトブラウザで開く(Ctrl/Cmd 不要)。 */
export const urlClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    const url = urlAtPos(view, pos);
    if (!url) return false;
    event.preventDefault();
    openUrl(url).catch(() => {});
    return true;
  },
});
