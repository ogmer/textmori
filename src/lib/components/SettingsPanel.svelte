<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { config } from "$lib/config.svelte";
  import { checkForUpdates } from "$lib/updater";

  let { onclose }: { onclose: () => void } = $props();

  let checking = $state(false);
  let configPath = $state("");

  invoke<string>("config_file_path")
    .then((path) => (configPath = path))
    .catch(() => {});

  async function checkNow() {
    checking = true;
    try {
      await checkForUpdates(false);
    } finally {
      checking = false;
    }
  }

  function handleBackdropKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onclose();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.currentTarget === event.target) onclose();
  }
</script>

<svelte:window onkeydown={handleBackdropKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdropClick}>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
  >
    <h2 id="settings-title">設定</h2>

    <label class="row">
      <input
        type="checkbox"
        checked={config.autoUpdate}
        onchange={(e) => config.setAutoUpdate(e.currentTarget.checked)}
      />
      起動時に自動で更新を確認する
    </label>

    <label class="field">
      フォント(空欄でシステムの既定フォント)
      <input
        type="text"
        placeholder="例: Cascadia Mono"
        value={config.fontFamily}
        onchange={(e) => config.setFontFamily(e.currentTarget.value)}
      />
    </label>

    <button type="button" class="check-now" disabled={checking} onclick={checkNow}>
      {checking ? "確認中..." : "今すぐ更新を確認"}
    </button>

    {#if configPath}
      <p class="config-path">
        設定は次のファイルを直接編集しても反映されます:<br />
        <code>{configPath}</code>
      </p>
    {/if}

    <button type="button" class="close" onclick={onclose}>閉じる</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .panel {
    min-width: 22rem;
    max-width: 26rem;
    padding: 1.25em 1.5em;
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 0.9em;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35em;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .field input {
    padding: 0.4em 0.6em;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }

  button {
    padding: 0.45em 0.9em;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--hover);
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .config-path {
    margin: 0;
    padding-top: 0.4em;
    border-top: 1px solid var(--border);
    font-size: 0.72rem;
    color: var(--muted);
    line-height: 1.6;
  }

  .config-path code {
    word-break: break-all;
    font-family: var(--font-mono);
  }

  .close {
    align-self: flex-end;
  }
</style>
