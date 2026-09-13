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

/** URL を常に下線でハイライトする ViewPlugin。 */
export const urlHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = urlMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      // updateDeco の差分更新だと、Backspace で URL でなくなった後も
      // 下線が残ってしまうことがあるため、変更時は常に再計算する。
      if (update.docChanged || update.viewportChanged) {
        this.decorations = urlMatcher.createDeco(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

/**
 * クリック位置に URL があれば、そのテキストを返す。
 * posAtCoords() は行内で一番近い文字位置を返すだけなので、URL より右側の
 * 余白をクリックしても(行末に近い位置として)一致してしまう。実際のクリック
 * 座標が、解決された文字位置からどれだけ離れているかで空白部分を弾く。
 */
function urlAtEventPos(view: EditorView, event: MouseEvent): string | null {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return null;

  const hitCoords = view.coordsAtPos(pos);
  if (!hitCoords || event.clientY < hitCoords.top || event.clientY > hitCoords.bottom) {
    view.dispatch({
      changes: {
        from: view.state.doc.length,
        insert: `\n[DBG2 no-hitCoords pos=${pos} hit=${JSON.stringify(hitCoords)}]`,
      },
    });
    return null;
  }
  const line = view.state.doc.lineAt(pos);
  const neighborPos = pos > line.from ? pos - 1 : Math.min(pos + 1, line.to);
  const neighborCoords = pos !== neighborPos ? view.coordsAtPos(neighborPos) : null;
  const charWidth = neighborCoords ? Math.abs(hitCoords.left - neighborCoords.left) : 0;
  const tolerance = Math.max(charWidth, 6);
  const dx = Math.abs(event.clientX - hitCoords.left);
  view.dispatch({
    changes: {
      from: view.state.doc.length,
      insert: `\n[DBG2 pos=${pos} hitLeft=${hitCoords.left} clientX=${event.clientX} dx=${dx} tol=${tolerance}]`,
    },
  });
  if (dx > tolerance) return null;

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

/** Ctrl/Cmd+クリックで、押した位置の URL をデフォルトブラウザで開く。 */
export const urlClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const debugLine = `[DEBUG ctrl=${event.ctrlKey} meta=${event.metaKey} btn=${event.button}]`;
    if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
    const url = urlAtEventPos(view, event);
    view.dispatch({
      changes: { from: view.state.doc.length, insert: `\n${debugLine} url=${url}` },
    });
    if (!url) return false;
    event.preventDefault();
    openUrl(url).catch(() => {});
    return true;
  },
});
