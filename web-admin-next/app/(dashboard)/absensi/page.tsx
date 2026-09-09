"use client";
import React, { useState, useEffect, useCallback } from "react";
import { apiFetchPaged, lokasiApi } from "@/lib/api";
import { fmtDateTime, statusColor, statusLabel, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

/**
 * ABSENSI
 * [Audit 2B] Sebelumnya halaman memuat 20 baris pertama (pagination default
 * backend) lalu memfilter/sort/paginate di klien → "Total Record" selalu 20,
 * filter lokasi tidak pernah cocok (membaca users.lokasi_id yang tidak ada),
 * dan foto absensi tidak tampil (kolom tertimpa avatar). Kini seluruh filter,
 * sort, pagination, dan ringkasan dihitung di server.
 */
export default function AbsensiPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [total, setTotal] = useState(0);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filterTipe, setFilterTipe] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [filterRadius, setFilterRadius] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: sortCol, order: sortDir });
      if (debounced) qs.set("search", debounced);
      if (filterTipe) qs.set("tipe", filterTipe);
      if (filterStatus) qs.set("status", filterStatus);
      if (filterLokasi) qs.set("lokasi_id", filterLokasi);
      if (filterRadius) qs.set("dalam_radius", filterRadius);
      if (startDate) qs.set("start_date", startDate);
      if (endDate) qs.set("end_date", endDate);
      const r = await apiFetchPaged("/api/absensi", qs);
      setData(r.data);
      setTotal(Number(r.pagination?.total) || 0);
      setSummary(r.summary || {});
    } catch (e: any) {
      toast(e?.message || "Gagal memuat absensi", "error");
    } finally {
      setLoading(false);
    }
  }, [page, sortCol, sortDir, debounced, filterTipe, filterStatus, filterLokasi, filterRadius, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debounced, filterTipe, filterStatus, filterLokasi, filterRadius, startDate, endDate]);
  useEffect(() => {
    lokasiApi.list().then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
    const unsub = onRealtimeEvent((ev) => { if (ev === "absensi:new") load(); });
    return unsub;
  }, [load]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };
  const SortIcon = ({ col }: { col: string }) => (
    <i className={`fas fa-sort${sortCol === col ? (sortDir === "asc" ? "-up" : "-down") : ""}`}
      style={{ marginLeft: 4, fontSize: 10, opacity: sortCol === col ? 1 : 0.3 }} />
  );
  const adaFilter = !!(search || filterTipe || filterStatus || filterLokasi || filterRadius || startDate || endDate);
  const resetFilter = () => { setSearch(""); setFilterTipe(""); setFilterStatus(""); setFilterLokasi(""); setFilterRadius(""); setStartDate(""); setEndDate(""); };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-fingerprint" /> Absensi</h1>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Ringkasan dihitung server untuk filter yang sama (bukan hanya halaman ini) */}
      <div className="stat-grid">
        {[
          { label: "Total Record", value: summary.total ?? total, color: "var(--primary)", icon: "fa-database" },
          { label: "Masuk", value: summary.masuk ?? 0, color: "var(--success)", icon: "fa-sign-in-alt" },
          { label: "Keluar", value: summary.keluar ?? 0, color: "var(--primary)", icon: "fa-sign-out-alt" },
          { label: "Hadir", value: summary.hadir ?? 0, color: "var(--success)", icon: "fa-check" },
          { label: "Terlambat", value: summary.terlambat ?? 0, color: "var(--warning)", icon: "fa-clock" },
          { label: "Luar Radius", value: summary.luar_radius ?? 0, color: "var(--danger)", icon: "fa-map-marker-alt" },
        ].map((s, i) => (
          <div key={i} className="section-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 0 }}>
            <i className={`fas ${s.icon}`} style={{ fontSize: 16, color: s.color }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-sora), monospace", color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari nama/NRP..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input type="date" className="form-input" style={{ width: "auto" }} value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Dari tanggal" />
          <span className="muted">s/d</span>
          <input type="date" className="form-input" style={{ width: "auto" }} value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Sampai tanggal" />
          <select className="form-select" style={{ width: "auto" }} value={filterTipe} onChange={(e) => setFilterTipe(e.target.value)}>
            <option value="">Semua Tipe</option>
            <option value="masuk">Masuk</option>
            <option value="keluar">Keluar</option>
          </select>
          <select className="form-select" style={{ width: "auto" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="hadir">Hadir</option>
            <option value="terlambat">Terlambat</option>
            <option value="tidak_hadir">Tidak Hadir</option>
            <option value="libur">Libur</option>
          </select>
          <select className="form-select" style={{ width: "auto" }} value={filterRadius} onChange={(e) => setFilterRadius(e.target.value)}>
            <option value="">Semua Radius</option>
            <option value="true">Dalam Radius</option>
            <option value="false">Luar Radius</option>
          </select>
          {lokasi.length > 1 && (
            <select className="form-select" style={{ width: "auto" }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)}>
              <option value="">Semua Lokasi</option>
              {lokasi.map((l: any) => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
          )}
          {adaFilter && (
            <button className="btn btn-sm btn-outline" onClick={resetFilter}>
              <i className="fas fa-times" /> Reset
            </button>
          )}
          <span className="muted" style={{ marginLeft: "auto" }}>{total} record</span>
        </div>

        {loading && data.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse" style={{ background: "var(--hover-row)", height: 44, borderRadius: 6 }} />
            ))}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Personil</th>
                <th>NRP</th>
                <th onClick={() => toggleSort("tipe")} style={{ cursor: "pointer" }}>Tipe <SortIcon col="tipe" /></th>
                <th onClick={() => toggleSort("created_at")} style={{ cursor: "pointer" }}>Waktu <SortIcon col="created_at" /></th>
                <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }}>Status <SortIcon col="status" /></th>
                <th>Lokasi</th>
                <th>Pos Jaga</th>
                <th>Radius</th>
                <th>Koordinat</th>
                <th>Foto</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="user-cell">
                    <img className="avatar avatar-sm" src={avatarUrl(r.user_foto_url)} alt="" />
                    <span title={r.nama || "-"}>{r.nama || "-"}</span>
                  </td>
                  <td><code style={{ fontSize: 11 }}>{r.nrp || "-"}</code></td>
                  <td><span className={`badge badge-${r.tipe === "masuk" ? "success" : "info"}`}>{r.tipe}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.waktu || r.created_at)}</td>
                  <td><span className={`badge badge-${statusColor(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td className="cell-ellipsis-sm" title={r.lokasi_nama || "-"}>{r.lokasi_nama || "-"}</td>
                  <td className="cell-ellipsis-sm" title={r.pos_jaga || "-"}>{r.pos_jaga || "-"}</td>
                  <td>
                    {r.dalam_radius === false
                      ? <span className="badge badge-danger">✗ Luar</span>
                      : r.dalam_radius === true
                      ? <span className="badge badge-success">✓ Dalam</span>
                      : <span className="muted">-</span>}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>
                    {r.latitude ? (
                      <a href={`https://maps.google.com/?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
                        {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                      </a>
                    ) : "-"}
                  </td>
                  <td>
                    {r.foto_url ? (
                      <img src={r.foto_url} className="foto-thumb" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} alt="foto" onClick={() => setDetail(r)} />
                    ) : <span className="muted">-</span>}
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => setDetail(r)} title="Lihat Detail">
                      <i className="fas fa-eye" />
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && !loading && (
                <tr><td colSpan={11} className="empty-row">
                  Tidak ada data absensi{adaFilter ? " untuk filter ini" : ""}
                  {adaFilter && <span className="empty-hint">Coba longgarkan filter atau klik Reset.</span>}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {detail && (
        <Modal title="Detail Absensi" onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Personil</div><div className="detail-value">{detail.nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">NRP</div><div className="detail-value"><code>{detail.nrp || "-"}</code></div></div>
            <div className="detail-item"><div className="detail-label">Tipe</div><div className="detail-value"><span className={`badge badge-${detail.tipe === "masuk" ? "success" : "info"}`}>{detail.tipe}</span></div></div>
            <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Waktu</div><div className="detail-value">{fmtDateTime(detail.waktu || detail.created_at)}</div></div>
            <div className="detail-item"><div className="detail-label">Lokasi / Pos Jaga</div><div className="detail-value">{detail.lokasi_nama || "-"} / {detail.pos_jaga || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Dalam Radius</div><div className="detail-value">
              {detail.dalam_radius === false ? <span className="badge badge-danger">✗ Luar Radius</span> : detail.dalam_radius === true ? <span className="badge badge-success">✓ Dalam Radius</span> : "-"}
            </div></div>
            <div className="detail-item"><div className="detail-label">Koordinat</div><div className="detail-value" style={{ fontFamily: "monospace" }}>
              {detail.latitude ? <a href={`https://maps.google.com/?q=${detail.latitude},${detail.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{Number(detail.latitude).toFixed(6)}, {Number(detail.longitude).toFixed(6)} 📍</a> : "-"}
            </div></div>
          </div>
          {detail.alamat && <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Alamat</div><div className="detail-value">{detail.alamat}</div></div>}
          {detail.foto_url && (
            <div style={{ marginTop: 16 }}>
              <div className="detail-label">Foto Absensi</div>
              <img src={detail.foto_url} alt="Foto absensi" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 10, marginTop: 8, border: "1px solid var(--border)", cursor: "pointer" }}
                onClick={() => window.open(detail.foto_url, "_blank")} />
            </div>
          )}
          <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--bg)", borderRadius: 8, fontSize: 11, color: "var(--text-muted)" }}>
            <strong>ID:</strong> {detail.id} &nbsp;|&nbsp; <strong>Dibuat:</strong> {fmtDateTime(detail.created_at)}
          </div>
        </Modal>
      )}
    </div>
  );
}
