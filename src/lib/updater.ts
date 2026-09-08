import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";

let checking = false;

/**
 * 更新を確認し、見つかった場合はダウンロード・適用して再起動する。
 * silent: 起動時の自動チェック用。更新が無い場合や通信エラー時に何も表示しない。
 */
export async function checkForUpdates(silent: boolean): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const update = await check();
    if (!update) {
      if (!silent) {
        await message("お使いのバージョンは最新です。", { title: "textmori" });
      }
      return;
    }

    const shouldInstall = await ask(
      `新しいバージョン ${update.version} が利用可能です。\n今すぐ更新して再起動しますか?`,
      { title: "textmori", kind: "info" },
    );
    if (!shouldInstall) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    if (!silent) {
      await message(`更新の確認に失敗しました。\n${error}`, {
        title: "textmori",
        kind: "error",
      });
    } else {
      console.error("自動更新チェックに失敗しました", error);
    }
  } finally {
    checking = false;
  }
}
