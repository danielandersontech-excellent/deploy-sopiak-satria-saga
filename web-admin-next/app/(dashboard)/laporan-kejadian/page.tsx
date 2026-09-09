"use client";
import React, { useState, useEffect, useCallback } from "react";
import { apiFetchPaged, getUser, laporanKejadianApi, lokasiApi } from "@/lib/api";
import { fmtDateTime, statusColor, statusLabel, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { ImagePreview } from "@/components/ui/ImagePreview";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

/**
 * LAPORAN KEJADIAN
 * [Audit 2B] Perbaikan yang sama dengan Laporan Harian: nama pelapor
 * (r.nama), pagination/filter/search/summary di server, validasi dengan
 * catatan + tombol Tolak, tombol nonaktif saat proses, filter prioritas.
 */
const STATUS_CHIPS = [
  { v: "", l: "Semua" }, { v: "pending", l: "Menunggu" }, { v: "approved", l: "Disetujui" },
  { v: "revision", l: "Revisi" }, { v: "rejected", l: "Ditolak" }, { v: "draft", l: "Draf" },
];
const CAN_VALIDATE = ["komandan", "supervisor", "admin"];

export default function LaporanKejadianPage() {
  const { toast } = useToast();
  const role = getUser()?.role || "anggota";
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [total, setTotal] = useState(0);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPrioritas, setFilterPrioritas] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const PAGE_SIZE = 15;

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debounced) qs.set("search", debounced);
      if (filterStatus) qs.set("status", filterStatus);
      if (filterPrioritas) qs.set("prioritas", filterPrioritas);
      if (filterLokasi) qs.set("lokasi_id", filterLokasi);
      if (startDate) qs.set("start_date", startDate);
      if (endDate) qs.set("end_date", endDate);
      const r = await apiFetchPaged("/api/laporan/kejadian", qs);
      setData(r.data); setTotal(Number(r.pagination?.total) || 0); setSummary(r.summary || {});
    } catch (e: any) {
      toast(e?.message || "Gagal memuat laporan", "error");
    } finally { setLoading(false); }
  }, [page, debounced, filterStatus, filterPrioritas, filterLokasi, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debounced, filterStatus, filterPrioritas, filterLokasi, startDate, endDate]);
  useEffect(() => {
    lokasiApi.list().then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
    const unsub = onRealtimeEvent((ev) => { if (ev === "laporan:new" || ev === "laporan:urgent" || ev === "laporan:validated") load(); });
    return unsub;
  }, [load]);

  const validate = async (id: string, status: "approved" | "revision" | "rejected") => {
    if (saving) return;
    if (status !== "approved" && !catatan.trim()) return toast("Isi catatan alasan revisi/penolakan", "warning");
    setSaving(true);
    try {
      await laporanKejadianApi.validate(id, status, "", catatan.trim() || undefined);
      toast(`Laporan ${statusLabel(status).toLowerCase()}`);
      setDetail(null); setCatatan("");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setSaving(false); }
  };
  const adaFilter = !!(search || filterStatus || filterPrioritas || filterLokasi || startDate || endDate);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-exclamation-triangle" /> Laporan Kejadian</h1>
        <div className="page-actions">
          {(summary.kritis || 0) > 0 && <span className="badge badge-danger">{summary.kritis} kritis</span>}
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
        </div>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari pelapor / NRP..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input type="date" className="form-input" style={{ width: "auto" }} value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Dari" />
          <span className="muted">s/d</span>
          <input type="date" className="form-input" style={{ width: "auto" }} value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Sampai" />
          <select className="form-select" style={{ width: "auto" }} value={filterPrioritas} onChange={(e) => setFilterPrioritas(e.target.value)}>
            <option value="">Semua Prioritas</option>
            <option value="rendah">Rendah</option>
            <option value="sedang">Sedang</option>
            <option value="tinggi">Tinggi</option>
            <option value="kritis">Kritis</option>
          </select>
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
          {adaFilter && (
            <button className="btn btn-sm btn-outline" onClick={() => { setSearch(""); setFilterStatus(""); setFilterPrioritas(""); setFilterLokasi(""); setStartDate(""); setEndDate(""); }}>
              <i className="fas fa-times" /> Reset
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Pelapor</th>
              <th>Jenis</th>
              <th>Prioritas</th>
              <th>Lokasi</th>
              <th>Waktu Kejadian</th>
              <th>Kronologi</th>
              <th>Bukti</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}><td colSpan={9}><div className="animate-pulse" style={{ background: "var(--hover-row, #e5e7eb)", height: 36, borderRadius: 6 }} /></td></tr>
              ))
            ) : (
              <>
                {data.map((r) => (
                  <tr key={r.id} style={r.prioritas === "kritis" && r.status === "pending" ? { background: "var(--danger-light)" } : undefined}>
                    <td className="user-cell">
                      <img className="avatar avatar-sm" src={avatarUrl(r.user_foto_url)} alt="" />
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name" title={r.nama || "-"}>{r.nama || "-"}</div>
                        <div className="user-sub">{r.nrp || ""}</div>
                      </div>
                    </td>
                    <td className="cell-ellipsis-sm" title={r.jenis}><strong>{r.jenis}</strong></td>
                    <td><span className={`badge badge-${statusColor(r.prioritas)}`}>{statusLabel(r.prioritas)}</span></td>
                    <td className="cell-ellipsis-sm" title={r.lokasi_text || r.lokasi_nama || "-"}>{r.lokasi_nama || r.lokasi_text || "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.waktu_kejadian || r.created_at)}</td>
                    <td className="cell-ellipsis" title={r.kronologi || "-"}>{r.kronologi || "-"}</td>
                    <td>{r.bukti_media?.length > 0 ? `${r.bukti_media.length} foto` : "-"}</td>
                    <td><span className={`badge badge-${statusColor(r.status)}`}>{statusLabel(r.status)}</span></td>
                    <td>
                      <button className="btn-icon" onClick={() => { setDetail(r); setCatatan(r.catatan_komandan || ""); }} title="Detail"><i className="fas fa-eye" /></button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={9} className="empty-row">
                    Tidak ada laporan kejadian{adaFilter ? " untuk filter ini" : ""}
                    {adaFilter && <span className="empty-hint">Coba longgarkan filter atau klik Reset.</span>}
                  </td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {detail && (
        <Modal
          title="Detail Laporan Kejadian"
          onClose={() => setDetail(null)}
          wide
          footer={
            CAN_VALIDATE.includes(role) && ["pending", "revision", "draft"].includes(detail.status) ? (
              <>
                <button className="btn btn-outline btn-sm" style={{ color: "var(--danger)" }} onClick={() => validate(detail.id, "rejected")} disabled={saving}><i className="fas fa-times" /> Tolak</button>
                <button className="btn btn-outline btn-sm" style={{ color: "var(--warning)" }} onClick={() => validate(detail.id, "revision")} disabled={saving}><i className="fas fa-undo" /> Revisi</button>
                <button className="btn btn-success btn-sm" onClick={() => validate(detail.id, "approved")} disabled={saving}><i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-check"}`} /> Setujui</button>
              </>
            ) : undefined
          }
        >
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Pelapor</div><div className="detail-value">{detail.nama || "-"} {detail.nrp ? `(${detail.nrp})` : ""}</div></div>
            <div className="detail-item"><div className="detail-label">Jenis</div><div className="detail-value"><strong>{detail.jenis}</strong></div></div>
            <div className="detail-item"><div className="detail-label">Prioritas</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.prioritas)}`}>{statusLabel(detail.prioritas)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Waktu Kejadian</div><div className="detail-value">{fmtDateTime(detail.waktu_kejadian || detail.created_at)}</div></div>
            <div className="detail-item"><div className="detail-label">Lokasi Klien</div><div className="detail-value">{detail.lokasi_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Lokasi Kejadian</div><div className="detail-value">{detail.lokasi_text || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Koordinat</div><div className="detail-value" style={{ fontFamily: "monospace" }}>
              {detail.latitude ? <a href={`https://maps.google.com/?q=${detail.latitude},${detail.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{Number(detail.latitude).toFixed(5)}, {Number(detail.longitude).toFixed(5)} 📍</a> : "-"}
            </div></div>
            {detail.validated_by_nama && <div className="detail-item"><div className="detail-label">Divalidasi oleh</div><div className="detail-value">{detail.validated_by_nama} · {fmtDateTime(detail.updated_at)}</div></div>}
          </div>
          {detail.kronologi && <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Kronologi</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.kronologi}</div></div>}
          {detail.bukti_media?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">Bukti Media ({detail.bukti_media.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginTop: 8 }}>
                {detail.bukti_media.map((f: string, i: number) => (
                  <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "4/3", cursor: "pointer" }} onClick={() => setPreview(f)}>
                    <img src={f} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} alt={`bukti ${i + 1}`} />
                    <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>#{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {CAN_VALIDATE.includes(role) && ["pending", "revision", "draft"].includes(detail.status) && (
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Catatan Komandan (wajib untuk Revisi/Tolak)</label>
              <textarea className="form-textarea" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Alasan revisi/penolakan atau tindak lanjut" />
            </div>
          )}
          {detail.catatan_komandan && !["pending", "draft"].includes(detail.status) && (
            <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Catatan Komandan</div><div className="detail-value">{detail.catatan_komandan}</div></div>
          )}
        </Modal>
      )}
      <ImagePreview src={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
