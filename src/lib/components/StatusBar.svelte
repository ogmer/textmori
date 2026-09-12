<script lang="ts">
  import { ENCODINGS, EOLS, ZOOM_PRESETS, type Eol, type TextEncoding } from "$lib/workspace.svelte";

  let {
    line,
    column,
    selected,
    lines,
    chars,
    eol,
    encoding,
    onsetencoding,
    onseteol,
    wrap,
    ontogglewrap,
    zoom,
    onzoomset,
  }: {
    line: number;
    column: number;
    selected: number;
    lines: number;
    chars: number;
    eol: Eol;
    encoding: TextEncoding;
    onsetencoding: (encoding: TextEncoding) => void;
    onseteol: (eol: Eol) => void;
    wrap: boolean;
    ontogglewrap: () => void;
    zoom: number;
    onzoomset: (percent: number) => void;
  } = $props();

  let zoomOpen = $state(false);
  let encodingOpen = $state(false);
  let eolOpen = $state(false);
  let customValue = $state("");
  let wrapper: HTMLDivElement | undefined = $state();
  let encodingWrapper: HTMLDivElement | undefined = $state();
  let eolWrapper: HTMLDivElement | undefined = $state();
  let customInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    // メニューを開くたびに現在値を入力欄へ反映する
    if (zoomOpen) customValue = String(zoom);
  });

  function toggleZoomMenu() {
    zoomOpen = !zoomOpen;
    if (zoomOpen) {
      // フォーカス移動後に選択状態にするため次のティックで実行
      setTimeout(() => customInput?.select(), 0);
    }
  }

  function selectPreset(percent: number) {
    onzoomset(percent);
    zoomOpen = false;
  }

  function applyCustom() {
    const value = Number(customValue);
    if (Number.isFinite(value) && value > 0) onzoomset(value);
    zoomOpen = false;
  }

  function handleCustomKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCustom();
    } else if (event.key === "Escape") {
      event.preventDefault();
      zoomOpen = false;
    }
  }

  function selectEncoding(value: TextEncoding) {
    onsetencoding(value);
    encodingOpen = false;
  }

  function selectEol(value: Eol) {
    onseteol(value);
    eolOpen = false;
  }

  function handleWindowClick(event: MouseEvent) {
    const target = event.target as Node;
    if (zoomOpen && wrapper && !wrapper.contains(target)) zoomOpen = false;
    if (encodingOpen && encodingWrapper && !encodingWrapper.contains(target)) {
      encodingOpen = false;
    }
    if (eolOpen && eolWrapper && !eolWrapper.contains(target)) eolOpen = false;
  }
</script>

<svelte:window onclick={handleWindowClick} />

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
  <div class="zoom-wrap" bind:this={wrapper}>
    <button
      type="button"
      class="toggle zoom"
      aria-haspopup="true"
      aria-expanded={zoomOpen}
      title="表示倍率を変更"
      onclick={toggleZoomMenu}
    >
      {zoom}%
    </button>
    {#if zoomOpen}
      <div class="zoom-menu">
        <div class="zoom-presets">
          {#each ZOOM_PRESETS as preset (preset)}
            <button
              type="button"
              class="zoom-preset"
              class:active={preset === zoom}
              onclick={() => selectPreset(preset)}
            >
              {preset}%
            </button>
          {/each}
        </div>
        <label class="zoom-custom">
          比率を指定(%)
          <input
            bind:this={customInput}
            type="number"
            min="10"
            max="500"
            step="1"
            bind:value={customValue}
            onkeydown={handleCustomKeydown}
            onblur={applyCustom}
          />
        </label>
      </div>
    {/if}
  </div>
  <div class="menu-wrap" bind:this={eolWrapper}>
    <button
      type="button"
      class="toggle"
      aria-haspopup="true"
      aria-expanded={eolOpen}
      title="改行コードを変更"
      onclick={() => (eolOpen = !eolOpen)}
    >
      {eol}
    </button>
    {#if eolOpen}
      <div class="picker-menu">
        {#each EOLS as option (option)}
          <button
            type="button"
            class="picker-item"
            class:active={option === eol}
            onclick={() => selectEol(option)}
          >
            {option}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="menu-wrap" bind:this={encodingWrapper}>
    <button
      type="button"
      class="toggle"
      aria-haspopup="true"
      aria-expanded={encodingOpen}
      title="文字コードを変更(保存時に適用されます)"
      onclick={() => (encodingOpen = !encodingOpen)}
    >
      {encoding}
    </button>
    {#if encodingOpen}
      <div class="picker-menu">
        {#each ENCODINGS as option (option)}
          <button
            type="button"
            class="picker-item"
            class:active={option === encoding}
            onclick={() => selectEncoding(option)}
          >
            {option}
          </button>
        {/each}
      </div>
    {/if}
  </div>
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

  .zoom-wrap {
    position: relative;
  }

  .zoom {
    min-width: 3.6em;
    text-align: center;
  }

  .zoom-menu {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 0.4em;
    padding: 0.6em;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    width: 12rem;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    font-size: 0.8rem;
    white-space: normal;
    z-index: 50;
  }

  .zoom-presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3em;
  }

  .zoom-preset {
    padding: 0.3em 0;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: none;
    color: var(--fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .zoom-preset:hover {
    background: var(--hover);
  }

  .zoom-preset.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .zoom-custom {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    color: var(--muted);
  }

  .zoom-custom input {
    padding: 0.3em 0.5em;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .menu-wrap {
    position: relative;
  }

  .picker-menu {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 0.4em;
    padding: 0.3em;
    display: flex;
    flex-direction: column;
    gap: 0.2em;
    min-width: 8rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    font-size: 0.8rem;
    white-space: nowrap;
    z-index: 50;
  }

  .picker-item {
    padding: 0.35em 0.6em;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: left;
    cursor: pointer;
  }

  .picker-item:hover {
    background: var(--hover);
  }

  .picker-item.active {
    background: var(--accent);
    color: #fff;
  }
</style>
