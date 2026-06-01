"use client";
import React, { useState, useEffect } from "react";
import { authApi, getUser, laporanHarianApi } from "@/lib/api";
import { fmtDate, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";

export default function LaporanHarianPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      const d = await laporanHarianApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch {
      // silent — empty state will show
    } finally {
      // BUG #4 (P2-2): finally so loading clears on error too.
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const validate = async (id: string, status: string) => {
    try {
      await laporanHarianApi.validate(id, status, authApi.getUserId());
      toast(`Laporan ${status}`);
      setDetail(null);
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const counts: Record<string, number> = {};
  data.forEach((r) => {
    counts[r.status] = (counts[r.status] || 0) + 1;
  });
  const filtered = data.filter(
    (r) =>
      (!search ||
        (r.users?.nama || "").toLowerCase().includes(search.toLowerCase())) &&
      (!filterStatus || r.status === filterStatus) &&
      (!filterDate || r.tanggal === filterDate),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-file-alt" />
          Laporan Harian
        </h1>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
      </div>
      <div className="section-card" style={{ overflowX: "auto" }}>
        <div className="filters-row">
          <input type="date" className="form-input" style={{ width: "auto" }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari pelapor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {["", "pending", "approved", "revision"].map((s) => (
            <button
              key={s}
              className={`form-chip ${filterStatus === s ? "active" : ""}`}
              onClick={() => setFilterStatus(s)}
            >
              {s || "Semua"} {s ? `(${counts[s] || 0})` : `(${data.length})`}
            </button>
          ))}
        </div>
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Pelapor</th>
              <th>Tanggal</th>
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
              // BUG #4 (P2-3): skeleton rows while initial fetch in flight.
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td colSpan={8}>
                    <div
                      className="animate-pulse"
                      style={{
                        background: "var(--hover-row, #e5e7eb)",
                        height: 36,
                        borderRadius: 6,
                      }}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <>{pagedData.map((r) => (
              <tr key={r.id}>
                <td className="user-cell">
                  <img
                    className="avatar avatar-sm"
                    src={avatarUrl(r.users?.foto_url)}
                   alt="avatar" />
                  <span>{r.users?.nama}</span>
                </td>
                <td>{fmtDate(r.tanggal)}</td>
                <td>
                  <span className={`badge badge-${statusColor(r.kondisi)}`}>
                    {r.kondisi}
                  </span>
                </td>
                <td
                  style={{
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.aktivitas || "-"}
                </td>
                <td
                  style={{
                    maxWidth: 180,
                    wordBreak: "break-word",
                    whiteSpace: "normal",
                  }}
                >
                  {r.perhatian_khusus || "-"}
                </td>
                <td>
                  <span className={`badge badge-${statusColor(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  {(r.fotos || r.foto_dokumentasi)?.length > 0
                    ? `${(r.fotos || r.foto_dokumentasi).length} 📷`
                    : "-"}
                </td>
                <td>
                  <button className="btn-icon" onClick={() => setDetail(r)}>
                    <i className="fas fa-eye" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  Tidak ada laporan harian
                </td>
              </tr>
            )}</>
            )}
          </tbody>
        </table>
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {detail && (
        <Modal
          title="Detail Laporan Harian"
          onClose={() => setDetail(null)}
          footer={
            detail.status === "pending" ? (
              <>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => validate(detail.id, "revision")}
                >
                  <i className="fas fa-undo" /> Revisi
                </button>
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => validate(detail.id, "approved")}
                >
                  <i className="fas fa-check" /> Setujui
                </button>
              </>
            ) : undefined
          }
        >
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Pelapor</div>
              <div className="detail-value">
                {detail.users?.nama} ({detail.users?.nrp})
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Tanggal</div>
              <div className="detail-value">{fmtDate(detail.tanggal)}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Kondisi</div>
              <div className="detail-value">
                <span className={`badge badge-${statusColor(detail.kondisi)}`}>
                  {detail.kondisi}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Status</div>
              <div className="detail-value">
                <span className={`badge badge-${statusColor(detail.status)}`}>
                  {detail.status}
                </span>
              </div>
            </div>
          </div>
          {detail.aktivitas && (
            <div className="detail-item" style={{ marginTop: 12 }}>
              <div className="detail-label">Aktivitas</div>
              <div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>
                {detail.aktivitas}
              </div>
            </div>
          )}
          {detail.perhatian_khusus && (
            <div className="detail-item" style={{ marginTop: 12 }}>
              <div className="detail-label">Perhatian Khusus</div>
              <div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>
                {detail.perhatian_khusus}
              </div>
            </div>
          )}
          {(detail.fotos || detail.foto_dokumentasi)?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">
                Foto Dokumentasi ({(detail.fotos || detail.foto_dokumentasi).length})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
                  gap: 10,
                  marginTop: 8,
                }}
              >
                {(detail.fotos || detail.foto_dokumentasi).map((f: string, i: number) => (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                      aspectRatio: "4/3",
                    }}
                  >
                    <img
                      src={f}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                      alt="foto" onClick={() => window.open(f, "_blank")}
                    />
                    <span
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      #{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
