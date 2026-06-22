import { createHash } from "crypto";

/** Minimal shape of an incoming request we need to find the caller's IP. */
export interface IpRequest {
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string | null };
}

/** Best-effort source IP. Honours the first hop of x-forwarded-for behind a proxy. */
export function clientIp(req: IpRequest): string | null {
  const xff = req.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim().length > 0) return xff.split(",")[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/**
 * Salted SHA-256 of the source IP, truncated. We never store raw IPs — only this
 * opaque hash, which is enough to cluster many installs behind one address.
 */
export function clientIpHash(req: IpRequest): string | null {
  const ip = clientIp(req);
  if (!ip) return null;
  const salt = process.env.FRAUD_IP_SALT ?? "kbi-dev-ip-salt-change-me";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
