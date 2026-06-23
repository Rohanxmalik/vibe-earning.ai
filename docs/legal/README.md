# Legal templates

> ⚠️ **These are DRAFT TEMPLATES, not legal advice.** They exist to save your lawyer time, not
> replace them. A qualified Indian lawyer **must** review and adapt all three before you accept
> real money or onboard real users. Fill every `[BRACKETED]` placeholder.

Contents:
- `terms-of-service-advertisers.md` — the deal with the demand side.
- `terms-of-service-developers.md` — the deal with the supply side (the people who get paid).
- `privacy-policy.md` — what data you collect and why.

**The single biggest legal risk** is injecting ads into third-party AI coding tools (Claude
Code, Codex, Gemini). It likely conflicts with those tools' own Terms. Mitigations baked into
the product: prefer **official integration points** (e.g. Claude Code's status line), label
ads as **Sponsored**, and ship a global **killswitch**. Get a lawyer's explicit read on this —
see `ENGINEERING_HANDOFF.md` §13.7 and `LAUNCH_CHECKLIST.md` Phase 6.
