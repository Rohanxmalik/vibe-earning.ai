import type { ServeResponse } from "@kbi/shared";
import { makeNonce } from "../core/nonce";

/** The ad currently shown in the status line + when it was first shown (one window). */
export interface ShownAd {
  campaignId: string;
  adId: string;
  firstShownMs: number;
  nonce: string;
  billed: boolean;
}

export interface BillingState {
  installId: string;
  current: ShownAd | null;
}

export interface BillEvent {
  installId: string;
  campaignId: string;
  nonce: string;
  visibleMs: number;
  type: "impression";
}

export interface BillingDecision {
  nextState: BillingState;
  bill: BillEvent | null;
}

const DEFAULT_MIN_VIEW_MS = 5000;

/**
 * Conservative billing for the status-line surface. The status line refreshes on a
 * timer with no reliable view-time, so we NEVER bill per refresh. Instead we bill at
 * most ONE impression per shown ad-window, and only once that window has been visible
 * for `minViewMs` (matching the server's view-threshold). The nonce is stable per
 * window, so any retry/duplicate refresh is deduped server-side. Worst case we
 * under-bill (skip a borderline view) — we never over-bill the advertiser or over-pay
 * the developer. House ads are never billed.
 */
export function decideBilling(
  state: BillingState,
  ad: ServeResponse | null,
  now: number,
  minViewMs: number = DEFAULT_MIN_VIEW_MS,
): BillingDecision {
  // Nothing served (or a non-billable house ad) → clear the window, never bill.
  if (!ad || ad.isHouseAd) {
    return { nextState: { ...state, current: null }, bill: null };
  }

  // Ad changed (or first sight) → start a fresh window; don't bill yet.
  if (!state.current || state.current.campaignId !== ad.campaignId) {
    const current: ShownAd = {
      campaignId: ad.campaignId,
      adId: ad.adId,
      firstShownMs: now,
      nonce: makeNonce(state.installId, ad.campaignId, now),
      billed: false,
    };
    return { nextState: { ...state, current }, bill: null };
  }

  // Same ad still showing.
  const current = state.current;
  const visibleMs = now - current.firstShownMs;
  if (!current.billed && visibleMs >= minViewMs) {
    return {
      nextState: { ...state, current: { ...current, billed: true } },
      bill: { installId: state.installId, campaignId: current.campaignId, nonce: current.nonce, visibleMs, type: "impression" },
    };
  }

  // Not yet eligible, or already billed this window → keep the window, no bill.
  return { nextState: state, bill: null };
}
