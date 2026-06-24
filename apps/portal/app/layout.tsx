import Link from "next/link";
import "./globals.css";

const description = "Sponsor the line developers watch while their AI agent thinks — and pay India's developers for it.";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: { default: "Kickbacks-India", template: "%s · Kickbacks-India" },
  description,
  openGraph: {
    title: "Kickbacks-India",
    description,
    type: "website",
    siteName: "Kickbacks-India",
  },
  twitter: { card: "summary", title: "Kickbacks-India", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">
              <span className="brand-dot" /> Kickbacks<span className="muted">·India</span>
            </Link>
            <div className="nav-links">
              <Link href="/campaigns" className="nav-link">Advertisers</Link>
              <Link href="/earnings" className="nav-link">Developers</Link>
              <Link href="/admin" className="nav-link">Admin</Link>
            </div>
          </div>
        </nav>
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            Kickbacks-India — the ad marketplace for AI coding agents. Built for India&apos;s developers.
          </div>
        </footer>
      </body>
    </html>
  );
}
