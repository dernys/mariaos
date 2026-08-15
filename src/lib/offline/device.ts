// Identidad estable del dispositivo, para poder saber dónde se creó cada
// operación offline (requisito 9: identificar operaciones sin conexión).
const KEY = "maria_device_id";
const NAME_KEY = "maria_device_name";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "dev-unknown";
  }
}

export function getDeviceName(): string {
  try {
    const stored = localStorage.getItem(NAME_KEY);
    if (stored) return stored;
    const ua = navigator.userAgent;
    const guess = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Dispositivo";
    return `${guess} · ${getDeviceId().slice(0, 4)}`;
  } catch {
    return "Dispositivo";
  }
}

export function setDeviceName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
}
