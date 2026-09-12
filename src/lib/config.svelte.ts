import { invoke } from "@tauri-apps/api/core";
import { watchImmediate } from "@tauri-apps/plugin-fs";

export type Theme = "system" | "light" | "dark";

/** Rust 側 (src-tauri/src/config.rs) の AppConfig と対応する JSON 表現 */
interface RawConfig {
  "font-family": string;
  theme: string;
}

function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Ghostty に倣い、設定はアプリ内の隠れた状態ではなく `textmori.conf` という
 * 手で編集できるプレーンテキストファイルを唯一の情報源として持つ。
 * ファイルを直接編集した場合も、保存した瞬間にアプリへ反映される。
 */
class Config {
  fontFamily = $state("");
  /** 既定は system(OS の配色設定に追従)。 */
  theme = $state<Theme>("system");

  #ignoreNextWatchEvent = false;

  async load(): Promise<void> {
    try {
      const raw = await invoke<RawConfig>("read_config");
      this.#apply(raw);
    } catch (error) {
      console.error("設定ファイルの読み込みに失敗しました", error);
    }
    this.#watch();
  }

  async setFontFamily(value: string): Promise<void> {
    this.fontFamily = value;
    await this.#persist();
  }

  async setTheme(value: Theme): Promise<void> {
    this.theme = value;
    await this.#persist();
  }

  #apply(raw: Partial<RawConfig>): void {
    if (typeof raw["font-family"] === "string") this.fontFamily = raw["font-family"];
    if (isTheme(raw.theme)) this.theme = raw.theme;
  }

  async #persist(): Promise<void> {
    try {
      // 自分自身の書き込みで発火する watch イベントは無視して二重読み込みを防ぐ
      this.#ignoreNextWatchEvent = true;
      await invoke("write_config", {
        config: { "font-family": this.fontFamily, theme: this.theme },
      });
    } catch (error) {
      console.error("設定ファイルの保存に失敗しました", error);
    }
  }

  async #watch(): Promise<void> {
    try {
      const path = await invoke<string>("config_file_path");
      await watchImmediate(path, async (event) => {
        if (typeof event.type === "object" && "access" in event.type) return;
        if (this.#ignoreNextWatchEvent) {
          this.#ignoreNextWatchEvent = false;
          return;
        }
        try {
          const raw = await invoke<RawConfig>("read_config");
          this.#apply(raw);
        } catch {
          // 保存の途中でファイルが一時的に読めないことがあるため無視する
        }
      });
    } catch (error) {
      console.error("設定ファイルの監視を開始できませんでした", error);
    }
  }
}

export const config = new Config();
