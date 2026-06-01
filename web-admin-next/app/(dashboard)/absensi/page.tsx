"use client";
import React, { useState, useEffect, useCallback } from "react";
import { absensiApi, lokasiApi } from "@/lib/api";
import { fmtDate, fmtTime, fmtDateTime, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

export default function AbsensiPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipe, setFilterTipe] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [sortCol, setSortCol] = useState("waktu");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterDate ? `date=${filterDate}` : "";
      const d = await absensiApi.list(params);
      setData(Array.isArray(d) ? d : []);
      try { setLokasi(await lokasiApi.list()); } catch {}
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      // BUG #4 (P2-2): finally so loading clears even if something
      // unexpected bubbles up.
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCurrentPage(1); }, [search, filterTipe, filterStatus, filterLokasi, filterDate]);
  useEffect(() => {
    const unsub = onRealtimeEvent((ev) => {
      if (ev === "absensi:new") load();
    });
    return unsub;
  }, [load]);

  const filtered = data
    .filter((r) => {
      const nama = (r.users?.nama || r.nama || "").toLowerCase();
      const nrp = (r.users?.nrp || r.nrp || "").toLowerCase();
      const s = search.toLowerCase();
      return (!search || nama.includes(s) || nrp.includes(s)) &&
        (!filterTipe || r.tipe === filterTipe) &&
        (!filterStatus || r.status === filterStatus) &&
        (!filterLokasi || r.users?.lokasi_id === filterLokasi);
    })
    .sort((a, b) => {
      let va = a[sortCol] || a.users?.[sortCol] || "";
      let vb = b[sortCol] || b.users?.[sortCol] || "";
      if (sortCol === "waktu" || sortCol === "created_at") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  // Stats
  const totalMasuk = data.filter(r => r.tipe === "masuk").length;
  const totalKeluar = data.filter(r => r.tipe === "keluar").length;
  const hadir = data.filter(r => r.status === "hadir").length;
  const terlambat = data.filter(r => r.status === "terlambat").length;
  const luarRadius = data.filter(r => r.dalam_radius === false).length;

  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const SortIcon = ({ col }: { col: string }) => (
    <i className={`fas fa-sort${sortCol === col ? (sortDir === "asc" ? "-up" : "-down") : ""}`}
      style={{ marginLeft: 4, fontSize: 10, opacity: sortCol === col ? 1 : 0.3 }} />
  );

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

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Record", value: data.length, color: "var(--primary)", icon: "fa-database" },
          { label: "Masuk", value: totalMasuk, color: "var(--success)", icon: "fa-sign-in-alt" },
          { label: "Keluar", value: totalKeluar, color: "var(--primary)", icon: "fa-sign-out-alt" },
          { label: "Hadir", value: hadir, color: "var(--success)", icon: "fa-check" },
          { label: "Terlambat", value: terlambat, color: "var(--warning)", icon: "fa-clock" },
          { label: "Luar Radius", value: luarRadius, color: "var(--danger)", icon: "fa-map-marker-alt" },
        ].map((s, i) => (
          <div key={i} className="section-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 0 }}>
            <i className={`fas ${s.icon}`} style={{ fontSize: 16, color: s.color }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: s.color }}>{s.value}</div>
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
          <input type="date" className="form-input" style={{ width: "auto" }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
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
          </select>
          <select className="form-select" style={{ width: "auto" }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)}>
            <option value="">Semua Lokasi</option>
            {lokasi.map((l: any) => <option key={l.id} value={l.id}>{l.nama}</option>)}
          </select>
          {(search || filterTipe || filterStatus || filterLokasi || filterDate) && (
            <button className="btn btn-sm btn-outline" onClick={() => { setSearch(""); setFilterTipe(""); setFilterStatus(""); setFilterLokasi(""); setFilterDate(""); }}>
              <i className="fas fa-times" /> Reset
            </button>
          )}
          <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} dari {data.length} record</span>
        </div>

        {loading ? (
          // BUG #4 (P2-3): skeleton placeholder while data is loading.
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  background: "var(--hover-row, #e5e7eb)",
                  height: 44,
                  borderRadius: 6,
                }}
              />
            ))}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th onClick={() => toggleSort("nama")} style={{ cursor: "pointer" }}>Personil <SortIcon col="nama" /></th>
                <th>NRP</th>
                <th onClick={() => toggleSort("tipe")} style={{ cursor: "pointer" }}>Tipe <SortIcon col="tipe" /></th>
                <th onClick={() => toggleSort("waktu")} style={{ cursor: "pointer" }}>Waktu <SortIcon col="waktu" /></th>
                <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }}>Status <SortIcon col="status" /></th>
                <th>Pos Jaga</th>
                <th>Radius</th>
                <th>Koordinat</th>
                <th>Foto</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pagedData.map((r) => (
                <tr key={r.id}>
                  <td className="user-cell">
                    <img className="avatar avatar-sm" src={avatarUrl(r.users?.foto_url)} alt="avatar" />
                    <span>{r.users?.nama || r.nama || "-"}</span>
                  </td>
                  <td><code style={{ fontSize: 11 }}>{r.users?.nrp || r.nrp || "-"}</code></td>
                  <td><span className={`badge badge-${r.tipe === "masuk" ? "success" : "info"}`}>{r.tipe}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.waktu ? fmtDateTime(r.waktu) : <span className="muted">-</span>}</td>
                  <td><span className={`badge badge-${statusColor(r.status)}`}>{r.status}</span></td>
                  <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pos_jaga || "-"}</td>
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
                      <img src={r.foto_url} className="foto-thumb" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} alt="foto"
                        onClick={() => setDetail(r)} />
                    ) : <span className="muted">-</span>}
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => setDetail(r)} title="Lihat Detail">
                      <i className="fas fa-eye" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={10} className="empty-row">Tidak ada data absensi{filterDate ? ` untuk tanggal ${filterDate}` : ""}</td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>

      {/* Detail Modal */}
      {detail && (
        <Modal title="Detail Absensi" onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Personil</div><div className="detail-value">{detail.users?.nama || detail.nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">NRP</div><div className="detail-value"><code>{detail.users?.nrp || detail.nrp || "-"}</code></div></div>
            <div className="detail-item"><div className="detail-label">Tipe</div><div className="detail-value"><span className={`badge badge-${detail.tipe === "masuk" ? "success" : "info"}`}>{detail.tipe}</span></div></div>
            <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.status)}`}>{detail.status}</span></div></div>
            <div className="detail-item"><div className="detail-label">Waktu</div><div className="detail-value">{detail.waktu ? fmtDateTime(detail.waktu) : "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Pos Jaga</div><div className="detail-value">{detail.pos_jaga || "-"}</div></div>
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