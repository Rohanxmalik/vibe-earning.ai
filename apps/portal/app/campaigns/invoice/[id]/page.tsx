"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PortalApi, type GstInvoice } from "../../../../lib/api";
import { getToken } from "../../../../lib/token";
import { rupees } from "../../../../lib/format";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getToken);

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const purchaseId = params.id;
  const [invoice, setInvoice] = useState<GstInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.invoice(purchaseId)
      .then(setInvoice)
      .catch(() => setError("Could not load this invoice. It's available once the purchase is paid, and only to the advertiser who made it."));
  }, [purchaseId]);

  if (error) return <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}><p className="empty">{error}</p></main>;
  if (!invoice) return <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}><p className="muted">Loading invoice…</p></main>;

  const gstTotal = invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise;
  return (
    <main style={{ maxWidth: 720, margin: "2.5rem auto", padding: "0 1.5rem" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <a href="/campaigns" className="btn btn-ghost btn-sm">← Back to campaigns</a>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="card card-pad-lg" style={{ background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Tax Invoice</h1>
            <p className="muted small" style={{ margin: "0.25rem 0 0" }}>{invoice.invoiceNo} · {invoice.invoiceDate}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>{invoice.seller.legalName}</strong>
            {invoice.seller.gstin && <div className="mono small">GSTIN: {invoice.seller.gstin}</div>}
            {invoice.seller.state && <div className="small muted">State: {invoice.seller.state}</div>}
            {invoice.seller.address && <div className="small muted">{invoice.seller.address}</div>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <div className="stat-kicker">Billed to</div>
            <div>{invoice.buyer.name}</div>
            {invoice.buyer.gstin && <div className="mono small">GSTIN: {invoice.buyer.gstin}</div>}
            {invoice.buyer.country && <div className="small muted">Country: {invoice.buyer.country}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="stat-kicker">Place of supply</div>
            <div>{invoice.placeOfSupply ?? "—"}</div>
          </div>
        </div>

        <table className="table" style={{ width: "100%" }}>
          <thead>
            <tr><th>Description</th><th>SAC</th><th className="num">Qty</th><th className="num">Taxable value</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{invoice.item.description}</td>
              <td className="mono small">{invoice.item.sac}</td>
              <td className="num">{invoice.item.quantity.toLocaleString("en-IN")}</td>
              <td className="num">{rupees(invoice.taxableValuePaise)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: "1rem", marginLeft: "auto", maxWidth: 300 }}>
          <Row label="Taxable value" value={rupees(invoice.taxableValuePaise)} />
          {invoice.igstPaise > 0
            ? <Row label="IGST (18%)" value={rupees(invoice.igstPaise)} />
            : <><Row label="CGST (9%)" value={rupees(invoice.cgstPaise)} /><Row label="SGST (9%)" value={rupees(invoice.sgstPaise)} /></>}
          <Row label="Total GST" value={rupees(gstTotal)} />
          <div style={{ borderTop: "1px solid var(--line)", marginTop: "0.5rem", paddingTop: "0.5rem" }}>
            <Row label="Total (incl. GST)" value={rupees(invoice.totalPaise)} strong />
          </div>
        </div>

        <p className="hint" style={{ marginTop: "1.25rem" }}>{invoice.note}</p>
      </div>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontWeight: strong ? 700 : 400 }}>
      <span className={strong ? undefined : "muted"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
