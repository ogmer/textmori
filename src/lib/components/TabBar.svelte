<script lang="ts">
  import type { Tab } from "$lib/workspace.svelte";

  let {
    tabs,
    activeId,
    onselect,
    onclose,
    onnew,
  }: {
    tabs: Tab[];
    activeId: string | null;
    onselect: (id: string) => void;
    onclose: (id: string) => void;
    onnew: () => void;
  } = $props();

  /**
   * 日本語などの全角文字は、同じ font-size でも欧文よりひと回り大きく
   * 見えてしまう(フォント自体が違っても字面のデザイン上そうなりやすい)ため、
   * 含まれている場合はタブ名のフォントサイズを少し落として釣り合わせる。
   */
  const CJK_PATTERN = /[　-ヿ㐀-鿿豈-﫿＀-￯]/;
  function isCjk(name: string): boolean {
    return CJK_PATTERN.test(name);
  }
</script>

<div class="tabbar" role="tablist">
  {#each tabs as tab (tab.id)}
    <div class="tab" class:active={tab.id === activeId}>
      <button
        type="button"
        role="tab"
        class="label"
        aria-selected={tab.id === activeId}
        title={tab.path ?? tab.name}
        onclick={() => onselect(tab.id)}
      >
        <span class="name" class:cjk={isCjk(tab.name)}>{tab.name}</span>
        <span class="dot" class:visible={tab.dirty} aria-hidden="true">●</span>
        {#if tab.dirty}<span class="sr-only">(未保存)</span>{/if}
      </button>
      <button
        type="button"
        class="close"
        aria-label="{tab.name} を閉じる"
        onclick={() => onclose(tab.id)}>×</button
      >
    </div>
  {/each}
  <button type="button" class="add" title="新規タブ" aria-label="新規タブ" onclick={onnew}
    >+</button
  >
</div>

<style>
  .tabbar {
    display: flex;
    align-items: center;
    gap: 0.35em;
    min-width: 0;
    padding: 0.32em 0.4em 0;
    overflow-x: auto;
    background: var(--tabbar-bg);
    scrollbar-width: none;
    user-select: none;
  }

  /* メモ帳のように、1枚あたりの縦横の余白を広めに取った角丸タブにする */
  .tab {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 14rem;
    max-width: 25rem;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: var(--muted);
    transition:
      background-color 0.12s var(--ease),
      color 0.12s var(--ease);
  }

  .tab:hover {
    background: var(--hover);
  }

  .tab.active {
    background: var(--chrome-bg);
    color: var(--fg);
    /* 選択中のタブを細いアクセント線でさりげなく示す */
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .label {
    display: flex;
    align-items: center;
    gap: 0.4em;
    flex: 1;
    min-width: 0;
    padding: 0.58em 0.4em 0.58em 1em;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 全角文字は同じ font-size でも欧文より大きく見えるため少し縮める */
  .name.cjk {
    font-size: 0.85em;
  }

  .dot {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 0.6em;
    color: var(--accent);
    visibility: hidden;
  }

  .dot.visible {
    visibility: visible;
  }

  .close {
    flex: 0 0 auto;
    width: 1.55rem;
    height: 1.55rem;
    margin: 0 0.5rem 0 0.1rem;
    padding: 0;
    border-radius: var(--radius-sm);
    align-self: center;
    position: relative;
    top: 2px; /* タブ名の文字の高さに合わせて少し下げる */
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }

  .tab:hover .close,
  .tab.active .close {
    opacity: 1;
  }

  .close:hover {
    color: var(--fg);
    background: var(--hover);
  }

  .add {
    flex: 0 0 auto;
    width: 2.6em;
    padding-top: 8px; /* 文字を少し下げて、タブ名の高さに合わせる */
    align-self: stretch;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }

  .add:hover {
    color: var(--fg);
    background: var(--hover);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
