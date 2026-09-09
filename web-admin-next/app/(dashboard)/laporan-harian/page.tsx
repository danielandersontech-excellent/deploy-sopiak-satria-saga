"use client";
import React, { useState, useEffect, useCallback } from "react";
import { apiFetchPaged, getUser, laporanHarianApi, lokasiApi } from "@/lib/api";
import { fmtDate, fmtDateTime, statusColor, statusLabel, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

/**
 * LAPORAN HARIAN
 * [Audit 2B]
 *  - Nama pelapor kosong: halaman membaca r.users?.nama padahal backend
 *    mengirim r.nama (flat) → kolom Pelapor & pencarian tidak pernah jalan.
 *  - Filter tanggal membandingkan string ISO vs 'YYYY-MM-DD' → tak pernah cocok.
 *  - Hanya 20 baris pertama dimuat → chip status & hitungan salah.
 *  Kini: pagination/filter/search/summary di server; validasi dengan catatan
 *  (Setujui / Revisi / Tolak) + tombol nonaktif saat proses.
 */
const STATUS_CHIPS = [
  { v: "", l: "Semua" }, { v: "pending", l: "Menunggu" }, { v: "approved", l: "Disetujui" },
  { v: "revision", l: "Revisi" }, { v: "rejected", l: "Ditolak" }, { v: "draft", l: "Draf" },
];
const CAN_VALIDATE = ["komandan", "supervisor", "admin"];

export default function LaporanHarianPage() {
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
  const [filterKondisi, setFilterKondisi] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [filterDate, setFilterDate] = useState("");
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
      if (filterKondisi) qs.set("kondisi", filterKondisi);
      if (filterLokasi) qs.set("lokasi_id", filterLokasi);
      if (filterDate) qs.set("tanggal", filterDate);
      const r = await apiFetchPaged("/api/laporan/harian", qs);
      setData(r.data); setTotal(Number(r.pagination?.total) || 0); setSummary(r.summary || {});
    } catch (e: any) {
      toast(e?.message || "Gagal memuat laporan", "error");
    } finally { setLoading(false); }
  }, [page, debounced, filterStatus, filterKondisi, filterLokasi, filterDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debounced, filterStatus, filterKondisi, filterLokasi, filterDate]);
  useEffect(() => {
    lokasiApi.list().then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
    const unsub = onRealtimeEvent((ev) => { if (ev === "laporan:new" || ev === "laporan:validated") load(); });
    return unsub;
  }, [load]);

  const validate = async (id: string, status: "approved" | "revision" | "rejected") => {
    if (saving) return;
    if (status !== "approved" && !catatan.trim()) return toast("Isi catatan alasan revisi/penolakan", "warning");
    setSaving(true);
    try {
      await laporanHarianApi.validate(id, status, "", catatan.trim() || undefined);
      toast(`Laporan ${statusLabel(status).toLowerCase()}`);
      setDetail(null); setCatatan("");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setSaving(false); }
  };

  const fotos = (r: any): string[] => (Array.isArray(r?.fotos) && r.fotos.length ? r.fotos : Array.isArray(r?.foto_dokumentasi) ? r.foto_dokumentasi : []);
  const adaFilter = !!(search || filterStatus || filterKondisi || filterLokasi || filterDate);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-file-alt" /> Laporan Harian</h1>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
        </div>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari pelapor / NRP..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input type="date" className="form-input" style={{ width: "auto" }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} title="Tanggal laporan" />
          <select className="form-select" style={{ width: "auto" }} value={filterKondisi} onChange={(e) => setFilterKondisi(e.target.value)}>
            <option value="">Semua Kondisi</option>
            <option value="aman">Aman</option>
            <option value="ada_masalah">Ada Masalah</option>
            <option value="perhatian_khusus">Perhatian Khusus</option>
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
            <button className="btn btn-sm btn-outline" onClick={() => { setSearch(""); setFilterStatus(""); setFilterKondisi(""); setFilterLokasi(""); setFilterDate(""); }}>
              <i className="fas fa-times" /> Reset
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Pelapor</th>
              <th>Tanggal</th>
              <th>Lokasi</th>
              <th>Shift / Pos</th>
              <th>Kondisi</th>
              <th>Aktivitas</th>
              <th>Perhatian Khusus</th>
              <th>Status</th>
              <th>Foto</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}><td colSpan={10}><div className="animate-pulse" style={{ background: "var(--hover-row, #e5e7eb)", height: 36, borderRadius: 6 }} /></td></tr>
              ))
            ) : (
              <>{data.map((r) => (
                <tr key={r.id}>
                  <td className="user-cell">
                    <img className="avatar avatar-sm" src={avatarUrl(r.user_foto_url)} alt="" />
                    <div style={{ minWidth: 0 }}>
                      <div className="user-name" title={r.nama || "-"}>{r.nama || "-"}</div>
                      <div className="user-sub">{r.nrp || ""}</div>
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.tanggal || r.created_at)}</td>
                  <td className="cell-ellipsis-sm" title={r.lokasi_nama || "-"}>{r.lokasi_nama || "-"}</td>
                  <td className="cell-ellipsis-sm" title={`${r.shift || "-"} / ${r.pos_jaga || "-"}`}>{r.shift || "-"}{r.pos_jaga ? ` / ${r.pos_jaga}` : ""}</td>
                  <td><span className={`badge badge-${statusColor(r.kondisi)}`}>{statusLabel(r.kondisi)}</span></td>
                  <td className="cell-ellipsis" title={r.aktivitas || "-"}>{r.aktivitas || "-"}</td>
                  <td className="cell-ellipsis-sm" title={r.perhatian_khusus || "-"}>{r.perhatian_khusus || "-"}</td>
                  <td><span className={`badge badge-${statusColor(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td>{fotos(r).length > 0 ? `${fotos(r).length} 📷` : "-"}</td>
                  <td>
                    <button className="btn-icon" onClick={() => { setDetail(r); setCatatan(r.catatan_komandan || ""); }} title="Detail"><i className="fas fa-eye" /></button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={10} className="empty-row">
                  Tidak ada laporan harian{adaFilter ? " untuk filter ini" : ""}
                  {adaFilter && <span className="empty-hint">Coba longgarkan filter atau klik Reset.</span>}
                </td></tr>
              )}</>
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {detail && (
        <Modal
          title="Detail Laporan Harian"
          onClose={() => setDetail(null)}
          wide
          footer={
            CAN_VALIDATE.includes(role) && ["pending", "revision", "draft"].includes(detail.status) ? (
              <>
                <button className="btn btn-outline btn-sm" style={{ color: "var(--danger)" }} onClick={() => validate(detail.id, "rejected")} disabled={saving}>
                  <i className="fas fa-times" /> Tolak
                </button>
                <button className="btn btn-outline btn-sm" style={{ color: "var(--warning)" }} onClick={() => validate(detail.id, "revision")} disabled={saving}>
                  <i className="fas fa-undo" /> Revisi
                </button>
                <button className="btn btn-success btn-sm" onClick={() => validate(detail.id, "approved")} disabled={saving}>
                  <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-check"}`} /> Setujui
                </button>
              </>
            ) : undefined
          }
        >
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Pelapor</div><div className="detail-value">{detail.nama || "-"} {detail.nrp ? `(${detail.nrp})` : ""}</div></div>
            <div className="detail-item"><div className="detail-label">Tanggal / Shift</div><div className="detail-value">{fmtDate(detail.tanggal || detail.created_at)} · {detail.shift || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Lokasi / Pos</div><div className="detail-value">{detail.lokasi_nama || "-"} / {detail.pos_jaga || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Kondisi</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.kondisi)}`}>{statusLabel(detail.kondisi)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Dikirim</div><div className="detail-value">{fmtDateTime(detail.created_at)}</div></div>
            {detail.validated_by_nama && <div className="detail-item"><div className="detail-label">Divalidasi oleh</div><div className="detail-value">{detail.validated_by_nama} · {fmtDateTime(detail.updated_at)}</div></div>}
          </div>
          {detail.aktivitas && <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Aktivitas</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.aktivitas}</div></div>}
          {detail.temuan && <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Temuan</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.temuan}</div></div>}
          {detail.perhatian_khusus && <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Perhatian Khusus</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.perhatian_khusus}</div></div>}
          {fotos(detail).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">Foto Dokumentasi ({fotos(detail).length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginTop: 8 }}>
                {fotos(detail).map((f: string, i: number) => (
                  <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "4/3", cursor: "pointer" }} onClick={() => setPreview(f)}>
                    <img src={f} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} alt={`foto ${i + 1}`} />
                    <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>#{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {CAN_VALIDATE.includes(role) && ["pending", "revision", "draft"].includes(detail.status) && (
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Catatan Komandan (wajib untuk Revisi/Tolak)</label>
              <textarea className="form-textarea" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Alasan revisi/penolakan atau catatan tambahan" />
            </div>
          )}
          {detail.catatan_komandan && !["pending", "draft"].includes(detail.status) && (
            <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Catatan Komandan</div><div className="detail-value">{detail.catatan_komandan}</div></div>
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
