import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";

let checking = false;

/** ネットワークが無い環境で OS の DNS タイムアウト待ちにならないよう短く切り上げる */
const CHECK_TIMEOUT_MS = 5000;

/**
 * 更新を確認し、見つかった場合はダウンロード・適用して再起動する。
 * silent: 起動時の自動チェック用。更新が無い場合や通信エラー時に何も表示しない。
 *
 * textmori はオフラインでも支障なく使えることを前提としており、更新確認は
 * あくまで付加機能。ネットワークが無い/繋がらない場合は静かに諦める。
 */
export async function checkForUpdates(silent: boolean): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (!silent) {
        await message("オフラインのため更新を確認できませんでした。", {
          title: "textmori",
          kind: "warning",
        });
      }
      return;
    }

    const update = await check({ timeout: CHECK_TIMEOUT_MS });
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
      await message(
        `更新の確認に失敗しました(オフラインの可能性があります)。\n${error}`,
        { title: "textmori", kind: "error" },
      );
    } else {
      console.error("自動更新チェックに失敗しました", error);
    }
  } finally {
    checking = false;
  }
}
