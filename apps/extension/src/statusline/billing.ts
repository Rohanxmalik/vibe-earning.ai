import type { ServeResponse } from "@vibearning/shared";
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

export interface RotationOpts {
  minViewMs?: number;
  /** How long to hold each ad before rotating to the next (must be ≥ minViewMs to bill first). */
  holdMs?: number;
}

export interface RotationResult extends BillingDecision {
  ad: ServeResponse | null;
}

const DEFAULT_HOLD_MS = 8000;

/**
 * Rotate through the top-N served ads in the status line. Each ad is held for `holdMs`
 * (long enough to be billed once at the view threshold), then we advance to the next ad,
 * cycling. Picking the ad to show is the only rotation concern; the per-window billing is
 * delegated to `decideBilling`, so a rotated-in ad opens a fresh billable window.
 */
export function tickRotation(
  state: BillingState,
  ads: ServeResponse[],
  now: number,
  opts: RotationOpts = {},
): RotationResult {
  const holdMs = opts.holdMs ?? DEFAULT_HOLD_MS;
  if (ads.length === 0) {
    const cleared = decideBilling(state, null, now, opts.minViewMs);
    return { ...cleared, ad: null };
  }

  const cur = state.current;
  const idx = cur ? ads.findIndex((a) => a.campaignId === cur.campaignId) : -1;
  let showAd: ServeResponse;
  if (idx < 0) {
    showAd = ads[0]; // (re)start on the top ad
  } else if (ads.length > 1 && now - cur!.firstShownMs >= holdMs) {
    showAd = ads[(idx + 1) % ads.length]; // held long enough → rotate
  } else {
    showAd = ads[idx]; // keep showing the current ad
  }

  const decision = decideBilling(state, showAd, now, opts.minViewMs);
  return { ...decision, ad: showAd };
}
