import Link from "next/link";
import { ui } from "./kit";

/** Unified blue/lime footer shown on every page (rendered by the root layout). */
export function Footer() {
  return (
    <footer className="kbi-tw relative overflow-hidden bg-[#0038FF] text-white">
      <div className={`pointer-events-none absolute inset-0 ${ui.gridBg}`} />
      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 py-12 md:px-10 md:py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-1" aria-label="Kickbacks-India home">
              <span className="rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-sm font-black tracking-tight text-black">KICK</span>
              <span className="rounded-full border-[1.5px] border-white bg-[#CCFF00] px-3 py-1.5 text-sm font-black text-black">BACKS</span>
            </Link>
            <p className="mt-4 text-sm font-medium text-white/80">
              Get paid while your AI thinks. Built for India&apos;s developers — paid in INR, straight to UPI.
            </p>
            <Link href="/earnings" className={`mt-6 ${ui.btnLime}`}>
              Start earning
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol title="Product">
              <FooterLink href="/#how">How it works</FooterLink>
              <FooterLink href="/earnings">Developers</FooterLink>
              <FooterLink href="/campaigns">Advertisers</FooterLink>
            </FooterCol>
            <FooterCol title="Resources">
              <FooterLink href="/faq">FAQ</FooterLink>
              <FooterLink href="/faq#payouts">UPI payouts</FooterLink>
              <FooterLink href="/faq#s7">Privacy</FooterLink>
            </FooterCol>
            <FooterCol title="Account">
              <FooterLink href="/earnings">Sign in</FooterLink>
              <FooterLink href="/login">Advertiser login</FooterLink>
              <FooterLink href="/admin">Staff console</FooterLink>
            </FooterCol>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/15 pt-6 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Kickbacks-India</span>
          <span className="font-medium">Built for India&apos;s developers — paid in INR.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#CCFF00]">{title}</div>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm font-medium text-white/80 transition-colors hover:text-white">
        {children}
      </Link>
    </li>
  );
}
