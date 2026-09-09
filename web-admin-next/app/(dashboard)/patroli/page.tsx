"use client";
import React, { useState, useEffect, useCallback } from "react";
import { apiFetchPaged, patroliApi, lokasiApi } from "@/lib/api";
import { fmtTime, fmtDateTime, statusColor, statusLabel, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { ImagePreview } from "@/components/ui/ImagePreview";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

/**
 * RIWAYAT PATROLI
 * [Audit 2B]
 *  - NRP selalu "-" (membaca users.nrp padahal backend mengirim nrp flat).
 *  - Detail: log scan tidak pernah tampil (daftar tidak memuat scan) → kini
 *    detail memanggil GET /api/patroli/:id yang menyertakan `scans`.
 *  - Pagination/filter status/tanggal/pencarian di server + ringkasan.
 */
const STATUS_CHIPS = [
  { v: "", l: "Semua" }, { v: "active", l: "Berlangsung" }, { v: "completed", l: "Selesai" },
  { v: "incomplete", l: "Tidak Lengkap" }, { v: "cancelled", l: "Dibatalkan" },
];

export default function PatroliPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [total, setTotal] = useState(0);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const PAGE_SIZE = 15;

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debounced) qs.set("search", debounced);
      if (filterStatus) qs.set("status", filterStatus);
      if (filterLokasi) qs.set("lokasi_id", filterLokasi);
      if (startDate) qs.set("start_date", startDate);
      if (endDate) qs.set("end_date", endDate);
      const r = await apiFetchPaged("/api/patroli", qs);
      setData(r.data); setTotal(Number(r.pagination?.total) || 0); setSummary(r.summary || {});
    } catch (e: any) {
      toast(e?.message || "Gagal memuat patroli", "error");
    } finally { setLoading(false); }
  }, [page, debounced, filterStatus, filterLokasi, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debounced, filterStatus, filterLokasi, startDate, endDate]);
  useEffect(() => {
    lokasiApi.list().then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
    const unsub = onRealtimeEvent((ev) => { if (ev === "patroli:update") load(); });
    return unsub;
  }, [load]);

  const openDetail = async (p: any) => {
    setDetail(p);
    setDetailLoading(true);
    try {
      const full = await patroliApi.get(p.id);
      setDetail({ ...p, ...full });
    } catch (e: any) {
      toast(e?.message || "Gagal memuat detail patroli", "error");
    } finally { setDetailLoading(false); }
  };
  const durasi = (p: any) => {
    if (!p?.start_time) return "-";
    const end = p.end_time ? new Date(p.end_time).getTime() : Date.now();
    const m = Math.max(0, Math.round((end - new Date(p.start_time).getTime()) / 60000));
    return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} j ${m % 60} mnt`;
  };
  const adaFilter = !!(search || filterStatus || filterLokasi || startDate || endDate);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-route" /> Riwayat Patroli</h1>
        <div className="page-actions">
          {(summary.active || 0) > 0 && <span className="badge badge-info badge-live">{summary.active} berlangsung</span>}
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
        </div>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari petugas / NRP / rute..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input type="date" className="form-input" style={{ width: "auto" }} value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Dari" />
          <span className="muted">s/d</span>
          <input type="date" className="form-input" style={{ width: "auto" }} value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Sampai" />
          {lokasi.length > 1 && (
            <select className="form-select" style={{ width: "auto" }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)}>
              <option value="">Semua Lokasi</option>
              {lokasi.map((l: any) => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
          )}
          <div className="form-chip-row">
            {STATUS_CHIPS.map((s) => (
              <button key={s.v} className={`form-chip ${filterStatus === s.v ? "active" : ""}`} onClick={() => setFilterStatus(s.v)}>
                {s.l} ({s.v ? summary[s.v] || 0 : summary.total || 0})
              </button>
            ))}
          </div>
          {adaFilter && <button className="btn btn-sm btn-outline" onClick={() => { setSearch(""); setFilterStatus(""); setFilterLokasi(""); setStartDate(""); setEndDate(""); }}><i className="fas fa-times" /> Reset</button>}
        </div>
        {loading && data.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="animate-pulse" style={{ background: "var(--hover-row)", height: 40, borderRadius: 6 }} />)}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Petugas</th>
                <th>NRP</th>
                <th>Lokasi</th>
                <th>Rute</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th>Durasi</th>
                <th>Checkpoint</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="user-cell">
                    <img className="avatar avatar-sm" src={avatarUrl(p.user_foto_url)} alt="" />
                    <span title={p.nama || "-"}>{p.nama || "-"}</span>
                  </td>
                  <td><code>{p.nrp || "-"}</code></td>
                  <td className="cell-ellipsis-sm" title={p.lokasi_nama || "-"}>{p.lokasi_nama || "-"}</td>
                  <td className="cell-ellipsis" title={p.route_name || p.rute_nama || "-"}>{p.route_name || p.rute_nama || "-"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(p.start_time)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{p.end_time ? fmtDateTime(p.end_time) : <span className="muted">-</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{durasi(p)}</td>
                  <td>{p.checkpoint_scanned || p.jumlah_scan || 0}/{p.checkpoint_total || "?"}</td>
                  <td><span className={`badge badge-${statusColor(p.status)}`}>{statusLabel(p.status)}</span></td>
                  <td><button className="btn-icon" onClick={() => openDetail(p)} title="Detail"><i className="fas fa-eye" /></button></td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={10} className="empty-row">
                  Belum ada data patroli{adaFilter ? " untuk filter ini" : ""}
                  {adaFilter && <span className="empty-hint">Coba longgarkan filter atau klik Reset.</span>}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {detail && (
        <Modal title="Detail Patroli" onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Petugas</div><div className="detail-value">{detail.nama || "-"} ({detail.nrp || "-"})</div></div>
            <div className="detail-item"><div className="detail-label">Rute</div><div className="detail-value">{detail.route_name || detail.rute_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Lokasi</div><div className="detail-value">{detail.lokasi_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Mulai</div><div className="detail-value">{fmtDateTime(detail.start_time)}</div></div>
            <div className="detail-item"><div className="detail-label">Selesai</div><div className="detail-value">{detail.end_time ? fmtDateTime(detail.end_time) : "-"} · {durasi(detail)}</div></div>
            <div className="detail-item"><div className="detail-label">Checkpoint</div><div className="detail-value">{detail.checkpoint_scanned || 0}/{detail.checkpoint_total || 0}</div></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="detail-label">Log Scan Checkpoint {detailLoading && <i className="fas fa-spinner fa-spin" />}</div>
            {Array.isArray(detail.scans) && detail.scans.length > 0 ? (
              <table style={{ marginTop: 6 }}>
                <thead><tr><th>#</th><th>Checkpoint</th><th>Waktu</th><th>Foto</th></tr></thead>
                <tbody>
                  {detail.scans.map((s: any, i: number) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td>{s.checkpoint_nama || s.checkpoints?.nama || "-"}</td>
                      <td>{fmtTime(s.scan_time)}</td>
                      <td>{s.foto_url ? <img src={s.foto_url} className="foto-thumb" alt="foto" onClick={() => setPreview(s.foto_url)} /> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              !detailLoading && <p className="muted" style={{ marginTop: 6 }}>Belum ada checkpoint yang dipindai pada patroli ini.</p>
            )}
          </div>
        </Modal>
      )}
      <ImagePreview src={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
