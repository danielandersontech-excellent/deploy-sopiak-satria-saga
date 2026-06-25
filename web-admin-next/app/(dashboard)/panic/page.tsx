"use client";
import React, { useState, useEffect } from "react";
import { authApi, getUser, panicApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtDate, fmtDateTime, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";

export default function PanicPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    try {
      const d = await panicApi.list();
      // Normalize flat backend data into nested user/resolver objects for frontend
      const normalized = (Array.isArray(d) ? d : []).map((p: any) => ({
        ...p,
        user: {
          nama: p.nama_pelapor || p.user?.nama || '-',
          nrp: p.nrp_pelapor || p.user?.nrp || '-',
          no_hp: p.no_hp || p.user?.no_hp || '-',
          foto_url: p.foto_pelapor || p.user?.foto_url || null,
          role: p.role_pelapor || p.user?.role || '-',
        },
        resolver: {
          nama: p.resolver_nama || p.resolver?.nama || null,
        },
        lokasi_nama: p.lokasi_nama || null,
      }));
      setData(normalized);
    } catch {}
  };
  useEffect(() => {
    load();
    const unsub = onRealtimeEvent((ev) => {
      if (ev.includes("panic")) load();
    });
    return unsub;
  }, []);
  const resolve = async (id: string, status: string, catatan?: string) => {
    try {
      const uid = authApi.getUserId();
      await panicApi.resolve(id, status, uid, catatan);
      toast(status === "resolved" ? "Panic resolved ✓" : "False alarm");
      setDetail(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const active = data.filter((d) => d.status === "active");
  const filtered = data.filter(
    (r) =>
      (!filterStatus || r.status === filterStatus) &&
      (!search ||
        (r.user?.nama || r.nama || "")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-bell" />
          Panic Alerts
        </h1>
        {active.length > 0 && (
          <span
            className="badge badge-danger"
            style={{ fontSize: 14, padding: "6px 14px" }}
          >
            {active.length} AKTIF
          </span>
        )}
      </div>
      {active.length > 0 && (
        <div
          className="section-card"
          style={{ borderLeft: "4px solid var(--danger)", marginBottom: 16 }}
        >
          <h3 style={{ color: "var(--danger)", marginBottom: 12 }}>
            🚨 AKTIF - Butuh Respons Segera
          </h3>
          {active.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                background: "var(--danger-light)",
                borderRadius: 8,
                marginBottom: 8,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div className="user-cell">
                <img className="avatar" src={avatarUrl(p.user?.foto_url)}  alt="avatar" />
                <div>
                  <strong>{p.user?.nama || "Unknown"}</strong> (
                  {p.user?.nrp || "-"}) -{" "}
                  <span
                    className={`badge badge-${p.user?.role === "komandan" ? "info" : "default"}`}
                  >
                    {p.user?.role || "-"}
                  </span>
                  <br />
                  <span className="muted">{fmtDateTime(p.created_at)}</span>
                  {p.pesan && (
                    <>
                      <br />
                      <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                        💬 {p.pesan}
                      </span>
                    </>
                  )}
                  {p.jenis_darurat && p.jenis_darurat !== "umum" && (
                    <>
                      <br />
                      <span className="badge badge-warning">
                        {p.jenis_darurat}
                      </span>
                    </>
                  )}
                  {p.alamat && (
                    <>
                      <br />
                      <span className="muted">
                        <i className="fas fa-map-marker-alt" /> {p.alamat}
                      </span>
                    </>
                  )}
                  {p.lokasi_text && (
                    <>
                      <br />
                      <span className="muted">📍 {p.lokasi_text}</span>
                    </>
                  )}
                  {p.latitude && (
                    <>
                      <br />
                      <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                        GPS: {p.latitude?.toFixed?.(6)},{" "}
                        {p.longitude?.toFixed?.(6)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="btn-group">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setDetail(p)}
                >
                  <i className="fas fa-eye" /> Detail
                </button>
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => resolve(p.id, "resolved")}
                >
                  ✓ Resolved
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => resolve(p.id, "false_alarm")}
                >
                  False Alarm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="section-card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginBottom: 12 }}>Riwayat Semua Panic Alert</h3>
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari personil..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {["", "active", "resolved", "false_alarm"].map((s) => (
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
              <th>Personil</th>
              <th>NRP</th>
              <th>Role</th>
              <th>No. HP</th>
              <th>Pesan / Jenis</th>
              <th>Lokasi / Alamat</th>
              <th>GPS</th>
              <th>Waktu Lapor</th>
              <th>Status</th>
              <th>Ditangani Oleh</th>
              <th>Waktu Respon</th>
              <th>Catatan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((p) => (
              <tr key={p.id}>
                <td className="user-cell">
                  <img
                    className="avatar avatar-sm"
                    src={avatarUrl(p.user?.foto_url)}
                   alt="avatar" />
                  <span title={p.user?.nama || "?"}>{p.user?.nama || "?"}</span>
                </td>
                <td>
                  <code>{p.user?.nrp || "-"}</code>
                </td>
                <td>
                  <span
                    className={`badge badge-${p.user?.role === "komandan" ? "info" : "default"}`}
                  >
                    {p.user?.role || "-"}
                  </span>
                </td>
                <td
                  style={{
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.pesan || "-"}
                </td>
                <td className="cell-ellipsis-sm" title={p.jenis_darurat || "umum"}>{p.jenis_darurat || "umum"}</td>
                <td
                  style={{
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.alamat || p.lokasi_text || "-"}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                  {p.latitude
                    ? `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`
                    : "-"}
                </td>
                <td>{fmtDateTime(p.created_at)}</td>
                <td>
                  <span className={`badge badge-${statusColor(p.status)}`}>
                    {p.status}
                  </span>
                </td>
                <td>
                  {p.resolver?.nama || (p.resolved_by ? "..." : "-")}
                  {p.resolved_at && (
                    <>
                      <br />
                      <span className="muted" style={{ fontSize: 10 }}>
                        {fmtDateTime(p.resolved_at)}
                      </span>
                    </>
                  )}
                </td>
                <td
                  style={{
                    maxWidth: 100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.catatan_resolver || "-"}
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
                <td colSpan={12} className="empty-row">
                  Tidak ada panic alert
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {detail && (
        <Modal title="🚨 Detail Panic Alert" onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-label">Personil</div>
              <div className="detail-value">
                {detail.user?.nama} ({detail.user?.nrp})
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Role</div>
              <div className="detail-value">
                <span
                  className={`badge badge-${detail.user?.role === "komandan" ? "info" : "default"}`}
                >
                  {detail.user?.role}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Waktu</div>
              <div className="detail-value">
                {fmtDateTime(detail.created_at)}
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
            <div className="detail-item">
              <div className="detail-label">Jenis Darurat</div>
              <div className="detail-value">
                {detail.jenis_darurat || "Umum"}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Nomor Kontak</div>
              <div className="detail-value">
                {detail.nomor_kontak || detail.user?.no_hp || "-"}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">Lokasi/Alamat</div>
              <div className="detail-value">
                {detail.alamat || detail.lokasi_text || "-"}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-label">GPS</div>
              <div className="detail-value" style={{ fontFamily: "monospace" }}>
                {detail.latitude ? (
                  <a href={`https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`} target="_blank" rel="noreferrer" style={{color:'var(--primary)',textDecoration:'underline'}}>
                    {detail.latitude?.toFixed?.(6)}, {detail.longitude?.toFixed?.(6)} 🗺️
                  </a>
                ) : "-"}
              </div>
            </div>
            {detail.resolved_at && detail.created_at && (
              <div className="detail-item">
                <div className="detail-label">Waktu Respon</div>
                <div className="detail-value" style={{fontWeight:700,color:'var(--success)'}}>
                  {(() => { const diff = (new Date(detail.resolved_at).getTime() - new Date(detail.created_at).getTime()) / 60000; return diff < 60 ? `${Math.round(diff)} menit` : `${Math.floor(diff/60)} jam ${Math.round(diff%60)} menit`; })()}
                </div>
              </div>
            )}
            {detail.pesan && (
              <div className="detail-item" style={{ gridColumn: "1/-1" }}>
                <div className="detail-label">Pesan Darurat</div>
                <div
                  className="detail-value"
                  style={{ color: "var(--danger)", fontWeight: 600 }}
                >
                  {detail.pesan}
                </div>
              </div>
            )}
            {detail.foto_url && (
              <div className="detail-item" style={{ gridColumn: "1/-1" }}>
                <div className="detail-label">Foto</div>
                <div className="detail-value">
                  <img
                    src={detail.foto_url}
                    style={{ maxWidth: 300, borderRadius: 8 }}
                   alt="foto" />
                </div>
              </div>
            )}
            {detail.resolved_by && (
              <>
                <div className="detail-item">
                  <div className="detail-label">Resolved By</div>
                  <div className="detail-value">
                    {detail.resolver?.nama || detail.resolved_by}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Resolved At</div>
                  <div className="detail-value">
                    {fmtDateTime(detail.resolved_at)}
                  </div>
                </div>
              </>
            )}
            {detail.catatan_resolver && (
              <div className="detail-item" style={{ gridColumn: "1/-1" }}>
                <div className="detail-label">Catatan Resolver</div>
                <div className="detail-value">{detail.catatan_resolver}</div>
              </div>
            )}
            {detail.respon_detail && (
              <div className="detail-item" style={{ gridColumn: "1/-1" }}>
                <div className="detail-label">Detail Respon</div>
                <div className="detail-value">{detail.respon_detail}</div>
              </div>
            )}
          </div>
          {detail.status === "active" && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--danger-light)', borderRadius: 12 }}>
              <label className="form-label" style={{marginBottom:8}}>Catatan Penanganan (opsional)</label>
              <textarea
                className="form-textarea"
                id="panic-catatan"
                placeholder="Jelaskan bagaimana situasi ditangani..."
                style={{marginBottom:12,minHeight:60}}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-success"
                  onClick={() => {
                    const cat = (document.getElementById('panic-catatan') as HTMLTextAreaElement)?.value || 'Ditangani';
                    resolve(detail.id, "resolved", cat);
                  }}
                >
                  ✓ Tandai Resolved
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => resolve(detail.id, "false_alarm", "False alarm")}
                >
                  Tandai False Alarm
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
