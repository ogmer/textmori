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
        <span class="dot" class:visible={tab.dirty} aria-hidden="true">●</span>
        <span class="name">{tab.name}</span>
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
    align-items: stretch;
    min-width: 0;
    overflow-x: auto;
    background: var(--tabbar-bg);
    scrollbar-width: thin;
  }

  .tab {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    max-width: 15rem;
    border-right: 1px solid var(--border);
    background: var(--tab-bg);
    color: var(--muted);
  }

  .tab.active {
    background: var(--bg);
    color: var(--fg);
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .label {
    display: flex;
    align-items: center;
    gap: 0.35em;
    min-width: 0;
    padding: 0.45em 0.3em 0.45em 0.75em;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot {
    flex: 0 0 auto;
    font-size: 0.6em;
    color: var(--accent);
    visibility: hidden;
  }

  .dot.visible {
    visibility: visible;
  }

  .close {
    padding: 0 0.55em;
    align-self: stretch;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 1rem;
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
    width: 2.2em;
    align-self: stretch;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 1rem;
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
