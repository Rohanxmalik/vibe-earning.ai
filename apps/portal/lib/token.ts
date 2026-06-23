const KEY = "kbi.advToken";
const DEV_KEY = "kbi.devToken";

export function getToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(KEY) ?? undefined;
}
export function setToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, token);
}
export function clearToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

// Developer (supply-side) session token. Devs sign in via Google in the extension;
// for the web earnings view they paste that KBI token here.
export function getDevToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(DEV_KEY) ?? undefined;
}
export function setDevToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(DEV_KEY, token);
}
export function clearDevToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(DEV_KEY);
}

// Admin key (x-admin-key) for the operations console. Internal tool only.
const ADMIN_KEY = "kbi.adminKey";
export function getAdminKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(ADMIN_KEY) ?? undefined;
}
export function setAdminKey(key: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(ADMIN_KEY, key);
}
export function clearAdminKey(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(ADMIN_KEY);
}
