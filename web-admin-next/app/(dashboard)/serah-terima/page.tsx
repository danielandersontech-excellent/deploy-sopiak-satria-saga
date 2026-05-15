"use client";
import React, { useState, useEffect } from "react";
import { serahTerimaApi } from "@/lib/api";
import { fmtDate, fmtDateTime, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";

export default function SerahTerimaPage() {
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      const d = await serahTerimaApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch {
      // silent — caller flow will surface via empty state
    } finally {
      // BUG #4 (P2-2): finally so loading clears on error too.
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const pagedData = data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-handshake" />
          Serah Terima
        </h1>
      </div>
      <div className="section-card">
        <table>
          <thead>
            <tr>
              <th>Penyerah</th>
              <th>Penerima</th>
              <th>Kondisi</th>
              <th>Catatan</th>
              <th>Dikonfirmasi</th>
              <th>Waktu</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => (
              <tr key={r.id}>
                <td className="user-cell">
                  <img
                    className="avatar avatar-sm"
                    src={avatarUrl(r.user?.foto_url)}
                   alt="avatar" />
                  <span>{r.user?.nama || r.dari_nama || "-"}</span>
                </td>
                <td>{r.penerima?.nama || r.ke_nama || "-"}</td>
                <td>
                  <span
                    className={`badge badge-${statusColor(r.kondisi_area)}`}
                  >
                    {r.kondisi_area}
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
                  {r.catatan || "-"}
                </td>
                <td>{r.dikonfirmasi ? "✅" : "⏳"}</td>
                <td>{fmtDateTime(r.created_at)}</td>
                <td>
                  <button className="btn-icon" onClick={() => setDetail(r)}>
                    <i className="fas fa-eye" />
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  Belum ada serah terima
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={data.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {detail && (
        <Modal title="Detail Serah Terima" onClose={() => setDetail(null)}>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Penyerah</div>
              <div className="detail-value">
                {detail.user?.nama || detail.dari_nama}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Penerima</div>
              <div className="detail-value">
                {detail.penerima?.nama || detail.ke_nama || "-"}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Kondisi</div>
              <div className="detail-value">
                <span
                  className={`badge badge-${statusColor(detail.kondisi_area)}`}
                >
                  {detail.kondisi_area}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Dikonfirmasi</div>
              <div className="detail-value">
                {detail.dikonfirmasi ? "✅ Ya" : "⏳ Belum"}
              </div>
            </div>
          </div>
          {detail.catatan && (
            <div className="detail-item" style={{ marginTop: 12 }}>
              <div className="detail-label">Catatan</div>
              <div className="detail-value">{detail.catatan}</div>
            </div>
          )}
          {detail.fotos?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-label">Foto</div>
              <div className="foto-gallery" style={{ marginTop: 8 }}>
                {detail.fotos.map((f: string, i: number) => (
                  <img
                    key={i}
                    src={f}
                    style={{
                      width: 120,
                      height: 90,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                   alt="" />
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

