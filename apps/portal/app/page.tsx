import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Kickbacks-India — Advertisers</h1>
      <p>Sponsor the line developers watch while their AI agent thinks.</p>
      <p>
        <Link href="/login">Sign in / Register</Link> · <Link href="/campaigns">My campaigns</Link>
      </p>
      <p>Developer? <Link href="/earnings">View your earnings</Link>.</p>
    </main>
  );
}
