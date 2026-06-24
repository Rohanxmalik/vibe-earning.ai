import "./globals.css";
import { Footer } from "../components/ui/Footer";

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
