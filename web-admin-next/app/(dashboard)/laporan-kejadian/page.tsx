"use client";
import React, { useState, useEffect } from "react";
import { authApi, getUser, laporanKejadianApi } from "@/lib/api";
import { fmtDate, fmtDateTime, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";

export default function LaporanKejadianPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      const d = await laporanKejadianApi.list();
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
      await laporanKejadianApi.validate(id, status, authApi.getUserId());
      toast(`Laporan ${status}`);
      setDetail(null);
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const filtered = data.filter(
    (r) =>
      (!search ||
        (r.users?.nama || "").toLowerCase().includes(search.toLowerCase())) &&
      (!filterStatus || r.status === filterStatus),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-exclamation-triangle" />
          Laporan Kejadian
        </h1>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
      </div>
      <div className="section-card">
        <div className="filters-row">
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
              {s || "Semua"}
            </button>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <th>Pelapor</th>
              <th>Jenis</th>
              <th>Prioritas</th>
              <th>Lokasi</th>
              <th>Waktu</th>
              <th>Kronologi</th>
              <th>Bukti</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              // BUG #4 (P2-3): skeleton rows while initial fetch in flight.
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td colSpan={9}>
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
              <>
                {pagedData.map((r) => (
                  <tr key={r.id}>
                    <td className="user-cell">
                      <img
                        className="avatar avatar-sm"
                        src={avatarUrl(r.users?.foto_url)}
                       alt="avatar" />
                      <span title={r.users?.nama}>{r.users?.nama}</span>
                    </td>
                    <td className="cell-ellipsis-sm" title={r.jenis}>
                      <strong>{r.jenis}</strong>
                    </td>
                    <td>
                      <span className={`badge badge-${statusColor(r.prioritas)}`}>
                        {r.prioritas}
                      </span>
                    </td>
                    <td className="cell-ellipsis" title={r.lokasi_text || "-"}>{r.lokasi_text || "-"}</td>
                    <td>{fmtDateTime(r.waktu_kejadian)}</td>
                    <td
                      style={{
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.kronologi || "-"}
                    </td>
                    <td>
                      {r.bukti_media?.length > 0
                        ? `${r.bukti_media.length} foto`
                        : "-"}
                    </td>
                    <td>
                      <span className={`badge badge-${statusColor(r.status)}`}>
                        {r.status}
                      </span>
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
                    <td colSpan={9} className="empty-row">
                      Tidak ada laporan kejadian
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {detail && (
        <Modal
          title="Detail Laporan Kejadian"
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
              <div className="detail-label">Jenis</div>
              <div className="detail-value">
                <strong>{detail.jenis}</strong>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Prioritas</div>
              <div className="detail-value">
                <span
                  className={`badge badge-${statusColor(detail.prioritas)}`}
                >
                  {detail.prioritas}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Waktu</div>
              <div className="detail-value">
                {fmtDateTime(detail.waktu_kejadian)}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Lokasi</div>
              <div className="detail-value">{detail.lokasi_text || "-"}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Koordinat</div>
              <div className="detail-value" style={{ fontFamily: "monospace" }}>
                {detail.latitude
                  ? `${Number(detail.latitude).toFixed(5)}, ${Number(detail.longitude).toFixed(5)}`
                  : "-"}
              </div>
            </div>
          </div>
          {detail.kronologi && (
            <div className="detail-item" style={{ marginTop: 12 }}>
              <div className="detail-label">Kronologi</div>
              <div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>
                {detail.kronologi}
              </div>
            </div>
          )}
          {detail.bukti_media?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">
                Bukti Media ({detail.bukti_media.length})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
                  gap: 10,
                  marginTop: 8,
                }}
              >
                {detail.bukti_media.map((f: string, i: number) => (
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
                        cursor: "pointer",
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