<script lang="ts">
  import type { CloseChoice } from "$lib/workspace.svelte";

  let { name, onchoice }: { name: string; onchoice: (choice: CloseChoice) => void } = $props();

  function handleBackdropKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onchoice("cancel");
  }
</script>

<!-- メモ帳のように、閉じる際は保存/保存しない/キャンセルの3択で確認する。
     OS 標準の確認ダイアログ(warning 種別)は警告音が鳴るため、ここでは
     音を鳴らさない自前の HTML ダイアログにしている。 -->
<svelte:window onkeydown={handleBackdropKeydown} />

<div class="backdrop" role="presentation">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="save-confirm-title">
    <p id="save-confirm-title" class="title">textmori</p>
    <p class="message">「{name}」への変更内容を保存しますか?</p>
    <div class="actions">
      <button type="button" class="save" onclick={() => onchoice("save")}>保存</button>
      <button type="button" onclick={() => onchoice("discard")}>保存しない</button>
      <button type="button" onclick={() => onchoice("cancel")}>キャンセル</button>
    </div>
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
    z-index: 200;
  }

  .dialog {
    width: 22rem;
    max-width: calc(100vw - 2rem);
    padding: 1.1em 1.3em;
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    gap: 0.9em;
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .message {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: 0.5em;
    justify-content: flex-end;
  }

  .actions button {
    padding: 0.45em 1em;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--hover);
    color: var(--fg);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .actions button:hover {
    filter: brightness(1.1);
  }

  .actions .save {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
