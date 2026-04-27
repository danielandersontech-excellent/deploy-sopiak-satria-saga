"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, checkpointsApi } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

export default function QRGeneratorPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("");
  const [generated, setGenerated] = useState<Set<string>>(new Set());
  useEffect(() => {
    (async () => {
      try { setCheckpoints(await checkpointsApi.list()); } catch {}
      try { setLokasi(await lokasiApi.list()); } catch {}
    })();
  }, []);

  const filtered = filterLokasi ? checkpoints.filter((c: any) => c.lokasi_id === filterLokasi) : checkpoints;

  const generateAll = () => {
    setGenerated(new Set(checkpoints.map((c: any) => c.id)));
    toast(`${checkpoints.length} QR Code berhasil digenerate`);
  };

  const printAll = () => {
    const cps = filtered.length > 0 ? filtered : checkpoints;
    const cards = cps.map((cp: any) => {
      const qrData = encodeURIComponent(cp.qr_code || cp.id);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;
      return `<div class="qr-card"><img src="${qrUrl}" width="180" height="180"  alt="QR Code" /><div class="qr-name">${cp.nama}</div><div class="qr-area">${cp.area || ""}</div><div class="qr-code">${cp.qr_code || cp.id}</div></div>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:20px}.header{text-align:center;margin-bottom:20px;border-bottom:2px solid #2980b9;padding-bottom:10px}.header h1{font-size:18px;color:#2980b9}.grid{display:flex;flex-wrap:wrap;gap:16px;justify-content:center}.qr-card{width:220px;border:1px solid #ddd;border-radius:10px;padding:12px;text-align:center;page-break-inside:avoid}.qr-name{font-size:12px;font-weight:700;margin-top:8px}.qr-area{font-size:10px;color:#888}.qr-code{font-size:9px;color:#2980b9;font-weight:600;margin-top:4px;font-family:monospace}</style></head><body><div class="header"><h1>QR Checkpoint - PT Sopiak Satria Saga</h1><p>Dicetak: ${new Date().toLocaleDateString("id-ID")} • Total: ${cps.length}</p></div><div class="grid">${cards}</div></body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 1000); }
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
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(cp.qr_code || cp.id)}`;
              return (
                <tr key={cp.id}>
                  <td>{isGen ? <img src={qrUrl} width={60} height={60} style={{ borderRadius: 4 }} alt="QR" /> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>-</span>}</td>
                  <td style={{ fontWeight: 600 }}>{cp.nama}</td>
                  <td>{cp.area || "-"}</td>
                  <td>{lokasi.find((l: any) => l.id === cp.lokasi_id)?.nama || "-"}</td>
                  <td><code style={{ fontSize: 11, color: "var(--primary)" }}>{cp.qr_code || cp.id}</code></td>
                  <td><span className={`badge badge-${isGen ? "success" : "default"}`}>{isGen ? "Ready" : "Pending"}</span></td>
                  <td>
                    {!isGen ? (
                      <button className="btn btn-sm btn-primary" onClick={() => setGenerated(prev => new Set(prev).add(cp.id))}><i className="fas fa-magic" /> Generate</button>
                    ) : (
                      <button className="btn btn-sm btn-outline" onClick={() => {
                        const html = `<!DOCTYPE html><html><head><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}.card{text-align:center;border:2px solid #2980b9;border-radius:16px;padding:30px}h2{color:#2980b9;font-size:16px}.area{color:#888;font-size:12px;margin-bottom:16px}code{font-family:monospace;font-size:14px;color:#2980b9;font-weight:700}</style></head><body><div class="card"><h2>${cp.nama}</h2><div class="area">${cp.area || ""}</div><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(cp.qr_code || cp.id)}" width="280"  alt="QR Code" /><br/><code>${cp.qr_code || cp.id}</code></div></body></html>`;
                        const win = window.open("", "_blank"); if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 1000); }
                      }}><i className="fas fa-print" /> Print</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>Tidak ada checkpoint. Buat dulu di menu Checkpoint.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

