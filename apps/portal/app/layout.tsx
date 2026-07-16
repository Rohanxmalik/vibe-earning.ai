import "./globals.css";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Footer } from "../components/ui/Footer";

// Brand type: Bricolage for display, IBM Plex Sans/Mono for body & data.
// next/font self-hosts the files, so the strict CSP needs no font-src changes.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

const description = "Sponsor the line developers watch while their AI agent thinks — and pay India's developers for it.";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: { default: "vibearning", template: "%s · vibearning" },
  description,
  openGraph: {
    title: "vibearning",
    description,
    type: "website",
    siteName: "vibearning",
  },
  twitter: { card: "summary", title: "vibearning", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
        <noscript>
          {/* Without JS, scroll-reveal can't fire — make sure content is never left hidden. */}
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {children}
        <Footer />
      </body>
    </html>
  );
}
