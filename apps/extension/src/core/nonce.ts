/** Stable nonce per (install, campaign, wait-start). Lets the offline queue retry safely:
 *  the same wait-state always produces the same nonce, so the server dedupes replays. */
export function makeNonce(installId: string, campaignId: string, waitStartMs: number): string {
  return `kb_${installId}_${campaignId}_${waitStartMs}`;
}
