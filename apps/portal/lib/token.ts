const KEY = "kbi.advToken";

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
