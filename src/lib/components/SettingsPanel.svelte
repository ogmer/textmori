<script lang="ts">
  import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
  import { invoke } from "@tauri-apps/api/core";
  import { config } from "$lib/config.svelte";

  let { onclose }: { onclose: () => void } = $props();

  let configPath = $state("");
  let appName = $state("textmori");
  let appVersion = $state("");
  let tauriVersion = $state("");

  invoke<string>("config_file_path")
    .then((path) => (configPath = path))
    .catch(() => {});
  getName()
    .then((name) => (appName = name))
    .catch(() => {});
  getVersion()
    .then((version) => (appVersion = version))
    .catch(() => {});
  getTauriVersion()
    .then((version) => (tauriVersion = version))
    .catch(() => {});

  const shortcuts: [string, string][] = [
    ["Ctrl+N", "新規タブ"],
    ["Ctrl+O", "ファイルを開く"],
    ["Ctrl+S", "保存"],
    ["Ctrl+Shift+S", "名前を付けて保存"],
    ["Ctrl+W", "タブを閉じる"],
    ["Ctrl+Tab / Ctrl+Shift+Tab", "次 / 前のタブ"],
    ["Ctrl+Z / Ctrl+Y", "元に戻す / やり直し"],
    ["Ctrl+X / Ctrl+C / Ctrl+V", "切り取り / コピー / 貼り付け"],
    ["Ctrl+A", "すべて選択"],
    ["Ctrl+F / Ctrl+H", "検索 / 置換"],
    ["Alt+Z", "行の折り返しを切り替え"],
    ["Ctrl+\\", "分割ビューの切り替え"],
    ["Ctrl+= / Ctrl+- / Ctrl+0", "ズーム 拡大 / 縮小 / 100%に戻す"],
  ];

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

    <section>
      <h3>一般</h3>
      <label class="field">
        フォント(空欄でシステムの既定フォント)
        <input
          type="text"
          placeholder="例: Cascadia Mono"
          value={config.fontFamily}
          onchange={(e) => config.setFontFamily(e.currentTarget.value)}
        />
      </label>

      <fieldset class="field theme-field">
        <legend>配色</legend>
        <label class="radio">
          <input
            type="radio"
            name="theme"
            value="system"
            checked={config.theme === "system"}
            onchange={() => config.setTheme("system")}
          />
          システムに従う
        </label>
        <label class="radio">
          <input
            type="radio"
            name="theme"
            value="light"
            checked={config.theme === "light"}
            onchange={() => config.setTheme("light")}
          />
          ライト
        </label>
        <label class="radio">
          <input
            type="radio"
            name="theme"
            value="dark"
            checked={config.theme === "dark"}
            onchange={() => config.setTheme("dark")}
          />
          ダーク
        </label>
      </fieldset>

      {#if configPath}
        <p class="config-path">
          設定は次のファイルを直接編集しても反映されます:<br />
          <code>{configPath}</code>
        </p>
      {/if}
    </section>

    <section>
      <h3>ヘルプ: キーボードショートカット</h3>
      <table>
        <tbody>
          {#each shortcuts as [key, label] (key)}
            <tr>
              <td class="key"><kbd>{key}</kbd></td>
              <td>{label}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="note">macOS では Ctrl の代わりに Cmd(Alt+Z は Option+Z)を使います。</p>
    </section>

    <section>
      <h3>バージョン情報</h3>
      <p class="about-name">{appName}{appVersion ? ` v${appVersion}` : ""}</p>
      <p class="note">Tauri + SvelteKit + CodeMirror 6 で作った軽量テキストエディタ</p>
      {#if tauriVersion}
        <p class="note">Tauri v{tauriVersion}</p>
      {/if}
    </section>

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
    width: 26rem;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    padding: 1.25em 1.5em;
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 0.7em;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
    padding-top: 0.6em;
    border-top: 1px solid var(--border);
  }

  section:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  h3 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35em;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .field input[type="text"] {
    padding: 0.4em 0.6em;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }

  .theme-field {
    margin: 0;
    padding: 0;
    border: 0;
    gap: 0.5em;
  }

  .theme-field legend {
    padding: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .radio {
    display: flex;
    align-items: center;
    gap: 0.5em;
    flex-direction: row;
    font-size: 0.85rem;
    color: var(--fg);
    cursor: pointer;
  }

  table {
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  td {
    padding: 0.2em 0.6em 0.2em 0;
    vertical-align: top;
  }

  .key {
    white-space: nowrap;
  }

  kbd {
    padding: 0.1em 0.4em;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--chrome-bg);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .about-name {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .note,
  .config-path {
    margin: 0;
    font-size: 0.72rem;
    color: var(--muted);
    line-height: 1.6;
  }

  .config-path code {
    word-break: break-all;
    font-family: var(--font-mono);
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

  button:hover {
    background: var(--hover);
  }

  .close {
    align-self: flex-end;
  }
</style>
