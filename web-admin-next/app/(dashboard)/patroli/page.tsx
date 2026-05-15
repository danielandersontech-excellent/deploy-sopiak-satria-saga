"use client";
import React, { useState, useEffect } from "react";
import { patroliApi } from "@/lib/api";
import { fmtDate, fmtTime, fmtDateTime, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";

export default function PatroliPage() {
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      const d = await patroliApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch {
      // intentionally silent — empty data state will show "tidak ada data"
    } finally {
      // BUG #4 (P2-2): finally so loading clears on error too.
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const filtered = data.filter(
    (r) =>
      !search ||
      (r.users?.nama || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.route_name || "").toLowerCase().includes(search.toLowerCase()),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-route" />
          Riwayat Patroli
        </h1>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari petugas/rute..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Petugas</th>
              <th>NRP</th>
              <th>Rute</th>
              <th>Mulai</th>
              <th>Selesai</th>
              <th>Checkpoint</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((p) => (
              <tr key={p.id}>
                <td className="user-cell">
                  <img
                    className="avatar avatar-sm"
                    src={avatarUrl(p.users?.foto_url)}
                   alt="avatar" />
                  <span>{p.users?.nama || p.nama}</span>
                </td>
                <td>
                  <code>{p.users?.nrp || "-"}</code>
                </td>
                <td>{p.route_name || "-"}</td>
                <td>{fmtDateTime(p.start_time)}</td>
                <td>
                  {p.end_time ? (
                    fmtDateTime(p.end_time)
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td>
                  {p.checkpoint_scanned || p.patrol_scans?.length || 0}/
                  {p.checkpoint_total || "?"}
                </td>
                <td>
                  <span className={`badge badge-${statusColor(p.status)}`}>
                    {p.status}
                  </span>
                </td>
                <td>
                  <button className="btn-icon" onClick={() => setDetail(p)}>
                    <i className="fas fa-eye" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  Belum ada data patroli
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {detail && (
        <Modal title="Detail Patroli" onClose={() => setDetail(null)}>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Petugas</div>
              <div className="detail-value">
                {detail.users?.nama} ({detail.users?.nrp})
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Rute</div>
              <div className="detail-value">{detail.route_name || "-"}</div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Status</div>
              <div className="detail-value">
                <span className={`badge badge-${statusColor(detail.status)}`}>
                  {detail.status}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Mulai</div>
              <div className="detail-value">
                {fmtDateTime(detail.start_time)}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Selesai</div>
              <div className="detail-value">
                {detail.end_time ? fmtDateTime(detail.end_time) : "-"}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Checkpoint</div>
              <div className="detail-value">
                {detail.checkpoint_scanned || 0}/{detail.checkpoint_total || 0}
              </div>
            </div>
          </div>
          {detail.patrol_scans?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="detail-label">Scan Log</div>
              <table style={{ marginTop: 6 }}>
                <thead>
                  <tr>
                    <th>Checkpoint</th>
                    <th>Waktu</th>
                    <th>Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.patrol_scans.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.checkpoints?.nama || s.checkpoint_nama || "-"}</td>
                      <td>{fmtTime(s.scan_time)}</td>
                      <td>
                        {s.foto_url ? (
                          <img src={s.foto_url} className="foto-thumb"  alt="foto" />
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

