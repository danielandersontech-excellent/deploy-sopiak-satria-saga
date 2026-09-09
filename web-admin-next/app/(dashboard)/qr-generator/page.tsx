"use client";
import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { lokasiApi, checkpointsApi } from "@/lib/api";
import { QRCodeImage } from "@/components/ui/QRCodeImage";
import { escapeHtml } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";

/**
 * QR GENERATOR PAGE
 *
 * TAHAP 7 BUG #6 (P2-5):
 *   All QR codes are now generated client-side with the `qrcode` npm
 *   package — both the inline table previews (via <QRCodeImage>) and
 *   the print-window HTML (via QRCode.toDataURL into a data: URI).
 *   No checkpoint identifier is leaked to api.qrserver.com anymore.
 */
export default function QRGeneratorPage() {
  const { toast } = useToast();
  const [, setLoading] = useState(true);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("");
  const [generated, setGenerated] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        try { setCheckpoints(await checkpointsApi.list()); } catch (e: any) { toast(e?.message || "Gagal memuat data pendukung (lokasi/checkpoint/shift). Muat ulang halaman.", "warning"); }
        try { setLokasi(await lokasiApi.list()); } catch (e: any) { toast(e?.message || "Gagal memuat data pendukung (lokasi/checkpoint/shift). Muat ulang halaman.", "warning"); }
      } finally {
        // BUG #4: ensure loading clears on any error path.
        setLoading(false);
      }
    })();
  }, []);

  const filtered = filterLokasi
    ? checkpoints.filter((c: any) => c.lokasi_id === filterLokasi)
    : checkpoints;

  const generateAll = () => {
    // [Audit 2B] Hormati filter lokasi (sebelumnya selalu semua checkpoint).
    const target = filtered.length > 0 ? filtered : checkpoints;
    setGenerated((prev) => { const n = new Set(prev); target.forEach((c: any) => n.add(c.id)); return n; });
    toast(`${target.length} QR Code berhasil digenerate`);
  };

  // Build a data: URI for a single QR code. Used by the print flows so
  // the spawned window doesn't depend on any external host.
  const qrDataUrl = (value: string, size: number) =>
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" });

  const printAll = async () => {
    try {
      const cps = filtered.length > 0 ? filtered : checkpoints;
      // BUG #6: build QR data URIs locally; HTML embeds them inline.
      const cards = await Promise.all(
        cps.map(async (cp: any) => {
          const value = String(cp.qr_code || cp.id || "");
          const url = await qrDataUrl(value, 200);
          // [Audit 2B] nama/area/kode berasal dari DB → wajib escapeHtml (stored XSS di jendela cetak).
          return `<div class="qr-card"><img src="${url}" width="180" height="180" alt="QR Code" /><div class="qr-name">${escapeHtml(cp.nama)}</div><div class="qr-area">${escapeHtml(cp.area)}</div><div class="qr-code">${escapeHtml(value)}</div></div>`;
        }),
      );
      const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:20px}.header{text-align:center;margin-bottom:20px;border-bottom:2px solid #1A56DB;padding-bottom:10px}.header h1{font-size:18px;color:#1A56DB}.grid{display:flex;flex-wrap:wrap;gap:16px;justify-content:center}.qr-card{width:220px;border:1px solid #ddd;border-radius:10px;padding:12px;text-align:center;page-break-inside:avoid}.qr-name{font-size:12px;font-weight:700;margin-top:8px}.qr-area{font-size:10px;color:#888}.qr-code{font-size:9px;color:#1A56DB;font-weight:600;margin-top:4px;font-family:monospace}</style></head><body><div class="header"><h1>QR Checkpoint - PT Sopiak Satria Saga</h1><p>Dicetak: ${new Date().toLocaleDateString("id-ID")} • Total: ${cps.length}</p></div><div class="grid">${cards.join("")}</div></body></html>`;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 1000);
      }
    } catch (e: any) {
      toast(e?.message || "Gagal generate QR", "error");
    }
  };

  const printOne = async (cp: any) => {
    try {
      const value = String(cp.qr_code || cp.id || "");
      const url = await qrDataUrl(value, 300);
      const html = `<!DOCTYPE html><html><head><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}.card{text-align:center;border:2px solid #1A56DB;border-radius:16px;padding:30px}h2{color:#1A56DB;font-size:16px}.area{color:#888;font-size:12px;margin-bottom:16px}code{font-family:monospace;font-size:14px;color:#1A56DB;font-weight:700}</style></head><body><div class="card"><h2>${escapeHtml(cp.nama)}</h2><div class="area">${escapeHtml(cp.area)}</div><img src="${url}" width="280" alt="QR Code" /><br/><code>${escapeHtml(value)}</code></div></body></html>`;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 1000);
      }
    } catch (e: any) {
      toast(e?.message || "Gagal generate QR", "error");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-qrcode" /> QR Generator</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={generateAll}><i className="fas fa-magic" /> Generate Semua</button>
          <button className="btn btn-outline" onClick={printAll}><i className="fas fa-print" /> Print Semua</button>
        </div>
      </div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginBottom: 12 }}>Generate dan cetak QR Code untuk setiap checkpoint. QR ini digunakan oleh anggota saat patroli untuk scan checkpoint.</p>
        <div className="filters-row">
          <select className="form-select" value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)}>
            <option value="">Semua Lokasi</option>
            {lokasi.map((l: any) => <option key={l.id} value={l.id}>{l.nama}</option>)}
          </select>
        </div>
      </div>
      <div className="section-card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>QR Code</th><th>Nama</th><th>Area</th><th>Lokasi</th><th>Kode QR</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {filtered.map((cp: any) => {
              const isGen = generated.has(cp.id);
              return (
                <tr key={cp.id}>
                  <td>
                    {isGen ? (
                      <QRCodeImage
                        data={String(cp.qr_code || cp.id || "")}
                        size={60}
                        alt="QR"
                        style={{ borderRadius: 4 }}
                      />
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>-</span>
                    )}
                  </td>
                  <td className="cell-ellipsis" style={{ fontWeight: 600 }} title={cp.nama}>{cp.nama}</td>
                  <td className="cell-ellipsis-sm" title={cp.area || "-"}>{cp.area || "-"}</td>
                  <td className="cell-ellipsis" title={lokasi.find((l: any) => l.id === cp.lokasi_id)?.nama || "-"}>{lokasi.find((l: any) => l.id === cp.lokasi_id)?.nama || "-"}</td>
                  <td><code style={{ fontSize: 11, color: "var(--primary)" }}>{cp.qr_code || cp.id}</code></td>
                  <td><span className={`badge badge-${isGen ? "success" : "default"}`}>{isGen ? "Ready" : "Pending"}</span></td>
                  <td>
                    {!isGen ? (
                      <button className="btn btn-sm btn-primary" onClick={() => setGenerated(prev => new Set(prev).add(cp.id))}><i className="fas fa-magic" /> Generate</button>
                    ) : (
                      <button className="btn btn-sm btn-outline" onClick={() => printOne(cp)}><i className="fas fa-print" /> Print</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty-row">Tidak ada checkpoint. Buat dulu di menu Checkpoint.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}