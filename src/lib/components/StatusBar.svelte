<script lang="ts">
  import type { Eol } from "$lib/workspace.svelte";

  let {
    line,
    column,
    selected,
    lines,
    chars,
    eol,
    wrap,
    ontogglewrap,
  }: {
    line: number;
    column: number;
    selected: number;
    lines: number;
    chars: number;
    eol: Eol;
    wrap: boolean;
    ontogglewrap: () => void;
  } = $props();
</script>

<footer class="statusbar">
  <span>{line} 行 : {column} 列</span>
  {#if selected > 0}<span>{selected} 文字選択</span>{/if}
  <span class="spacer"></span>
  <span>{lines} 行 / {chars} 文字</span>
  <button
    type="button"
    class="toggle"
    aria-pressed={wrap}
    title="行の折り返しを切り替え"
    onclick={ontogglewrap}
  >
    折り返し: {wrap ? "オン" : "オフ"}
  </button>
  <span>{eol}</span>
  <span>UTF-8</span>
</footer>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    gap: 1em;
    padding: 0.25em 0.85em;
    border-top: 1px solid var(--border);
    background: var(--chrome-bg);
    color: var(--muted);
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  .toggle {
    padding: 0.1em 0.4em;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .toggle:hover {
    background: var(--hover);
    color: var(--fg);
  }
</style>
