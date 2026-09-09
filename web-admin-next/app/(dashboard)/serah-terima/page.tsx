"use client";
import React, { useState, useEffect, useCallback } from "react";
import { serahTerimaApi } from "@/lib/api";
import { fmtDateTime, statusColor, statusLabel } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";

/**
 * SERAH TERIMA
 * [Audit 2B] Daftar inventaris (jsonb) tidak pernah ditampilkan di detail;
 * kini ditampilkan sebagai tabel. Tambah pencarian, filter kondisi, tombol
 * refresh, skeleton, halaman reset saat filter berubah.
 */
export default function SerahTerimaPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterKondisi, setFilterKondisi] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await serahTerimaApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat serah terima", "error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCurrentPage(1); }, [search, filterKondisi]);

  const filtered = data.filter((r) =>
    (!filterKondisi || r.kondisi_area === filterKondisi) &&
    (!search || `${r.dari_nama || ""} ${r.ke_nama || ""} ${r.catatan || ""}`.toLowerCase().includes(search.toLowerCase()))
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const inventaris = (r: any): any[] => {
    const v = r?.inventaris;
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
  };
  const itemLabel = (it: any) => typeof it === "string" ? it : (it?.nama || it?.name || it?.item || JSON.stringify(it));
  const itemKondisi = (it: any) => typeof it === "object" && it ? (it.kondisi || it.status || it.condition || "") : "";
  const itemJumlah = (it: any) => typeof it === "object" && it ? (it.jumlah ?? it.qty ?? it.quantity ?? "") : "";

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-handshake" /> Serah Terima</h1>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
        </div>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari penyerah / penerima / catatan..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {[{ v: "", l: "Semua" }, { v: "aman", l: "Aman" }, { v: "perhatian", l: "Perhatian" }, { v: "masalah", l: "Masalah" }].map((s) => (
            <button key={s.v} className={`form-chip ${filterKondisi === s.v ? "active" : ""}`} onClick={() => setFilterKondisi(s.v)}>
              {s.l} ({s.v ? data.filter((d) => d.kondisi_area === s.v).length : data.length})
            </button>
          ))}
          <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} serah terima (50 terbaru)</span>
        </div>
        {loading && data.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="animate-pulse" style={{ background: "var(--hover-row, #e5e7eb)", height: 40, borderRadius: 6 }} />)}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Penyerah</th>
                <th>Penerima</th>
                <th>Kondisi</th>
                <th>Inventaris</th>
                <th>Catatan</th>
                <th>Tanda Tangan</th>
                <th>Dikonfirmasi</th>
                <th>Waktu</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pagedData.map((r) => (
                <tr key={r.id}>
                  <td className="cell-ellipsis-sm" title={r.dari_nama || "-"}><strong>{r.dari_nama || "-"}</strong></td>
                  <td className="cell-ellipsis-sm" title={r.ke_nama || "-"}>{r.ke_nama || "-"}</td>
                  <td><span className={`badge badge-${statusColor(r.kondisi_area)}`}>{statusLabel(r.kondisi_area)}</span></td>
                  <td>{inventaris(r).length} item</td>
                  <td className="cell-ellipsis" title={r.catatan || "-"}>{r.catatan || "-"}</td>
                  <td>{r.tanda_tangan ? <span className="badge badge-success">✓ Ada</span> : <span className="muted">-</span>}</td>
                  <td>{r.dikonfirmasi ? "✅" : "⏳"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.created_at)}</td>
                  <td><button className="btn-icon" onClick={() => setDetail(r)} title="Detail"><i className="fas fa-eye" /></button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="empty-row">Belum ada serah terima{search || filterKondisi ? " untuk filter ini" : ""}</td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>

      {detail && (
        <Modal title="Detail Serah Terima" onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Penyerah</div><div className="detail-value">{detail.dari_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Penerima</div><div className="detail-value">{detail.ke_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Kondisi Area</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.kondisi_area)}`}>{statusLabel(detail.kondisi_area)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Dikonfirmasi</div><div className="detail-value">{detail.dikonfirmasi ? "✅ Ya" : "⏳ Belum"}</div></div>
            <div className="detail-item"><div className="detail-label">Waktu</div><div className="detail-value">{fmtDateTime(detail.created_at)}</div></div>
          </div>
          {detail.catatan && <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Catatan</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.catatan}</div></div>}
          <div style={{ marginTop: 12 }}>
            <div className="detail-label">Inventaris ({inventaris(detail).length})</div>
            {inventaris(detail).length > 0 ? (
              <table style={{ marginTop: 6 }}>
                <thead><tr><th>#</th><th>Item</th><th>Jumlah</th><th>Kondisi</th></tr></thead>
                <tbody>
                  {inventaris(detail).map((it: any, i: number) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{itemLabel(it)}</td>
                      <td>{itemJumlah(it) === "" ? "-" : itemJumlah(it)}</td>
                      <td>{itemKondisi(it) ? <span className={`badge badge-${statusColor(String(itemKondisi(it)).toLowerCase())}`}>{String(itemKondisi(it))}</span> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted" style={{ marginTop: 6 }}>Tidak ada daftar inventaris.</p>}
          </div>
          {detail.fotos?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">Foto</div>
              <div className="foto-gallery" style={{ marginTop: 8 }}>
                {detail.fotos.map((f: string, i: number) => (
                  <img key={i} src={f} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, cursor: "pointer" }} alt="" onClick={() => setPreview(f)} />
                ))}
              </div>
            </div>
          )}
          {detail.tanda_tangan && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">Tanda Tangan</div>
              <img src={detail.tanda_tangan} style={{ marginTop: 8, maxWidth: 260, width: "100%", height: "auto", background: "#fff", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8 }} alt="Tanda tangan serah terima" />
            </div>
          )}
        </Modal>
      )}
      {preview && (
        <div className="modal-overlay" style={{ zIndex: 200 }} onClick={() => setPreview(null)}>
          <img src={preview} alt="preview" style={{ maxWidth: "92vw", maxHeight: "90vh", borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}
