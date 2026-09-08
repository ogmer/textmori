const STORAGE_KEY = "textmori:auto-update-enabled";

function loadAutoUpdate(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

class Settings {
  autoUpdateEnabled = $state(loadAutoUpdate());

  setAutoUpdateEnabled(value: boolean): void {
    this.autoUpdateEnabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // プライベートウィンドウ等で書き込めない場合は今回のセッション内のみ有効
    }
  }
}

export const settings = new Settings();
