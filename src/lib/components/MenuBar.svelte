<script module lang="ts">
  export interface MenuEntry {
    label: string;
    accelerator?: string;
    checked?: boolean;
    action: () => void;
  }

  export type MenuNode = MenuEntry | "separator";

  export interface MenuDefinition {
    label: string;
    items: MenuNode[];
  }
</script>

<script lang="ts">
  let { menus }: { menus: MenuDefinition[] } = $props();

  let openIndex = $state<number | null>(null);
  let bar: HTMLDivElement | undefined = $state();

  function toggle(index: number) {
    openIndex = openIndex === index ? null : index;
  }

  // メニューを開いている間は、他のトップレベル項目にホバーするだけで切り替わる
  function hover(index: number) {
    if (openIndex !== null) openIndex = index;
  }

  function run(entry: MenuEntry) {
    openIndex = null;
    entry.action();
  }

  function handleWindowClick(event: MouseEvent) {
    if (openIndex !== null && bar && !bar.contains(event.target as Node)) {
      openIndex = null;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (openIndex !== null && event.key === "Escape") openIndex = null;
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="menubar" bind:this={bar}>
  {#each menus as menu, index (menu.label)}
    <div class="menu">
      <button
        type="button"
        class="title"
        class:open={openIndex === index}
        aria-haspopup="true"
        aria-expanded={openIndex === index}
        onclick={() => toggle(index)}
        onmouseenter={() => hover(index)}
      >
        {menu.label}
      </button>
      {#if openIndex === index}
        <div class="dropdown">
          {#each menu.items as item, itemIndex (itemIndex)}
            {#if item === "separator"}
              <div class="separator"></div>
            {:else}
              <button type="button" class="entry" onclick={() => run(item)}>
                <span class="check">{item.checked ? "✓" : ""}</span>
                <span class="label">{item.label}</span>
                <span class="accelerator">{item.accelerator ?? ""}</span>
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .menubar {
    display: flex;
    align-items: stretch;
    padding: 0 0.2em;
    background: var(--chrome-bg);
    border-bottom: 1px solid var(--border);
    font-size: 0.8rem;
  }

  .menu {
    position: relative;
  }

  .title {
    padding: 0.3em 0.75em;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }

  .title:hover,
  .title.open {
    background: var(--hover);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 14rem;
    padding: 0.3em;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 60;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 0.5em;
    width: 100%;
    padding: 0.35em 0.5em;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .entry:hover {
    background: var(--hover);
  }

  .check {
    width: 1em;
    color: var(--accent);
  }

  .label {
    flex: 1;
  }

  .accelerator {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .separator {
    height: 1px;
    margin: 0.3em 0.5em;
    background: var(--border);
  }
</style>
