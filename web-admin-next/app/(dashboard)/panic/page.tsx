"use client";
import React, { useState, useEffect, useCallback } from "react";
import { panicApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtDateTime, statusColor, statusLabel, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

/**
 * PANIC ALERTS
 * [Audit 2B] Catatan penanganan kini state React (bukan document.getElementById),
 * ada konfirmasi sebelum menandai resolved/false alarm dari daftar aktif,
 * tombol nonaktif saat proses, halaman reset ke 1 saat filter berubah,
 * skeleton & tombol refresh.
 */
export default function PanicPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmAct, setConfirmAct] = useState<{ id: string; status: string; nama: string } | null>(null);
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await panicApi.list();
      const normalized = (Array.isArray(d) ? d : []).map((p: any) => ({
        ...p,
        user: {
          nama: p.nama_pelapor || p.user?.nama || "-",
          nrp: p.nrp_pelapor || p.user?.nrp || "-",
          no_hp: p.no_hp || p.user?.no_hp || "-",
          foto_url: p.foto_pelapor || p.user?.foto_url || null,
          role: p.role_pelapor || p.user?.role || "-",
        },
        resolver: { nama: p.resolver_nama || p.resolver?.nama || null },
        lokasi_nama: p.lokasi_nama || null,
      }));
      setData(normalized);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat panic alert", "error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const unsub = onRealtimeEvent((ev) => { if (ev.includes("panic")) load(); });
    return unsub;
  }, [load]);
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus]);

  const resolve = async (id: string, status: string, note?: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await panicApi.resolve(id, status, "", note || (status === "false_alarm" ? "False alarm" : "Ditangani"));
      toast(status === "resolved" ? "Panic ditandai selesai ✓" : "Ditandai sebagai alarm palsu");
      setDetail(null); setCatatan(""); setConfirmAct(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const active = data.filter((d) => d.status === "active");
  const filtered = data.filter(
    (r) => (!filterStatus || r.status === filterStatus) &&
      (!search || (r.user?.nama || "").toLowerCase().includes(search.toLowerCase()) || (r.user?.nrp || "").toLowerCase().includes(search.toLowerCase())),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const responTime = (p: any) => {
    if (!p.resolved_at || !p.created_at) return null;
    const diff = (new Date(p.resolved_at).getTime() - new Date(p.created_at).getTime()) / 60000;
    return diff < 60 ? `${Math.round(diff)} menit` : `${Math.floor(diff / 60)} jam ${Math.round(diff % 60)} menit`;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-bell" /> Panic Alerts</h1>
        <div className="page-actions">
          {active.length > 0 && <span className="badge badge-danger badge-live" style={{ fontSize: 13, padding: "6px 14px" }}>{active.length} AKTIF</span>}
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="section-card" style={{ borderLeft: "4px solid var(--danger)", marginBottom: 16 }}>
          <h3 style={{ color: "var(--danger)", marginBottom: 12 }}>🚨 AKTIF - Butuh Respons Segera</h3>
          {active.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, background: "var(--danger-light)", borderRadius: 8, marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
              <div className="user-cell">
                <img className="avatar" src={avatarUrl(p.user?.foto_url)} alt="" />
                <div>
                  <strong>{p.user?.nama || "Unknown"}</strong> ({p.user?.nrp || "-"}) -{" "}
                  <span className={`badge badge-${p.user?.role === "komandan" ? "info" : "default"}`}>{p.user?.role || "-"}</span>
                  <br />
                  <span className="muted">{fmtDateTime(p.created_at)}{p.lokasi_nama ? ` · ${p.lokasi_nama}` : ""}</span>
                  {p.pesan && (<><br /><span style={{ color: "var(--danger)", fontWeight: 600 }}>💬 {p.pesan}</span></>)}
                  {p.jenis_darurat && p.jenis_darurat !== "umum" && (<><br /><span className="badge badge-warning">{p.jenis_darurat}</span></>)}
                  {(p.alamat || p.lokasi_text) && (<><br /><span className="muted"><i className="fas fa-map-marker-alt" /> {p.alamat || p.lokasi_text}</span></>)}
                  {p.latitude && (<><br /><a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontSize: 11, color: "var(--primary)" }}>GPS: {Number(p.latitude).toFixed(6)}, {Number(p.longitude).toFixed(6)} 🗺️</a></>)}
                  {p.user?.no_hp && p.user.no_hp !== "-" && (<><br /><a href={`tel:${p.user.no_hp}`} style={{ fontSize: 12, color: "var(--primary)" }}><i className="fas fa-phone" /> {p.user.no_hp}</a></>)}
                </div>
              </div>
              <div className="btn-group">
                <button className="btn btn-outline btn-sm" onClick={() => { setDetail(p); setCatatan(""); }}><i className="fas fa-eye" /> Detail</button>
                <button className="btn btn-success btn-sm" onClick={() => setConfirmAct({ id: p.id, status: "resolved", nama: p.user?.nama })} disabled={saving}>✓ Selesai</button>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirmAct({ id: p.id, status: "false_alarm", nama: p.user?.nama })} disabled={saving}>Alarm Palsu</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-card">
        <h3 style={{ marginBottom: 12 }}>Riwayat Semua Panic Alert</h3>
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari personil / NRP..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {[{ v: "", l: "Semua" }, { v: "active", l: "Aktif" }, { v: "resolved", l: "Selesai" }, { v: "false_alarm", l: "Alarm Palsu" }].map((s) => (
            <button key={s.v} className={`form-chip ${filterStatus === s.v ? "active" : ""}`} onClick={() => setFilterStatus(s.v)}>
              {s.l} ({s.v ? data.filter((d) => d.status === s.v).length : data.length})
            </button>
          ))}
        </div>
        {loading && data.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse" style={{ background: "var(--hover-row, #e5e7eb)", height: 40, borderRadius: 6 }} />)}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Personil</th>
                <th>NRP</th>
                <th>Role</th>
                <th>Lokasi</th>
                <th>Pesan / Jenis</th>
                <th>GPS</th>
                <th>Waktu Lapor</th>
                <th>Status</th>
                <th>Ditangani Oleh</th>
                <th>Respon</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pagedData.map((p) => (
                <tr key={p.id}>
                  <td className="user-cell">
                    <img className="avatar avatar-sm" src={avatarUrl(p.user?.foto_url)} alt="" />
                    <span title={p.user?.nama || "?"}>{p.user?.nama || "?"}</span>
                  </td>
                  <td><code>{p.user?.nrp || "-"}</code></td>
                  <td><span className={`badge badge-${p.user?.role === "komandan" ? "info" : "default"}`}>{p.user?.role || "-"}</span></td>
                  <td className="cell-ellipsis-sm" title={p.lokasi_nama || p.alamat || p.lokasi_text || "-"}>{p.lokasi_nama || p.alamat || p.lokasi_text || "-"}</td>
                  <td className="cell-ellipsis-sm" title={`${p.pesan || ""} ${p.jenis_darurat || ""}`}>{p.pesan || p.jenis_darurat || "-"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                    {p.latitude ? <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}</a> : "-"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(p.created_at)}</td>
                  <td><span className={`badge badge-${statusColor(p.status)}`}>{statusLabel(p.status)}</span></td>
                  <td className="cell-ellipsis-sm" title={p.resolver?.nama || "-"}>
                    {p.resolver?.nama || (p.resolved_by ? "…" : "-")}
                    {p.resolved_at && (<><br /><span className="muted" style={{ fontSize: 10 }}>{fmtDateTime(p.resolved_at)}</span></>)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{responTime(p) || "-"}</td>
                  <td><button className="btn-icon" onClick={() => { setDetail(p); setCatatan(""); }} title="Detail"><i className="fas fa-eye" /></button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="empty-row">Tidak ada panic alert{search || filterStatus ? " untuk filter ini" : ""}</td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>

      {detail && (
        <Modal title="🚨 Detail Panic Alert" onClose={() => setDetail(null)} wide>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Personil</div><div className="detail-value">{detail.user?.nama} ({detail.user?.nrp})</div></div>
            <div className="detail-item"><div className="detail-label">Role</div><div className="detail-value"><span className={`badge badge-${detail.user?.role === "komandan" ? "info" : "default"}`}>{detail.user?.role}</span></div></div>
            <div className="detail-item"><div className="detail-label">Waktu</div><div className="detail-value">{fmtDateTime(detail.created_at)}</div></div>
            <div className="detail-item"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Jenis Darurat</div><div className="detail-value">{detail.jenis_darurat || "Umum"}</div></div>
            <div className="detail-item"><div className="detail-label">Nomor Kontak</div><div className="detail-value">{detail.nomor_kontak || detail.user?.no_hp || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Lokasi Klien</div><div className="detail-value">{detail.lokasi_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Lokasi/Alamat</div><div className="detail-value">{detail.alamat || detail.lokasi_text || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">GPS</div><div className="detail-value" style={{ fontFamily: "monospace" }}>
              {detail.latitude ? <a href={`https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", textDecoration: "underline" }}>{Number(detail.latitude).toFixed(6)}, {Number(detail.longitude).toFixed(6)} 🗺️</a> : "-"}
            </div></div>
            {responTime(detail) && <div className="detail-item"><div className="detail-label">Waktu Respon</div><div className="detail-value" style={{ fontWeight: 700, color: "var(--success)" }}>{responTime(detail)}</div></div>}
            {detail.pesan && <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Pesan Darurat</div><div className="detail-value" style={{ color: "var(--danger)", fontWeight: 600 }}>{detail.pesan}</div></div>}
            {detail.foto_url && <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Foto</div><div className="detail-value"><img src={detail.foto_url} style={{ maxWidth: 300, borderRadius: 8, cursor: "pointer" }} alt="foto" onClick={() => window.open(detail.foto_url, "_blank")} /></div></div>}
            {detail.resolved_by && (<>
              <div className="detail-item"><div className="detail-label">Ditangani oleh</div><div className="detail-value">{detail.resolver?.nama || detail.resolved_by}</div></div>
              <div className="detail-item"><div className="detail-label">Waktu Penanganan</div><div className="detail-value">{fmtDateTime(detail.resolved_at)}</div></div>
            </>)}
            {detail.catatan_resolver && <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Catatan Penanganan</div><div className="detail-value">{detail.catatan_resolver}</div></div>}
          </div>
          {detail.status === "active" && (
            <div style={{ marginTop: 16, padding: 16, background: "var(--danger-light)", borderRadius: 12 }}>
              <label className="form-label" style={{ marginBottom: 8 }}>Catatan Penanganan (opsional)</label>
              <textarea className="form-textarea" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Jelaskan bagaimana situasi ditangani..." style={{ marginBottom: 12, minHeight: 60 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-success" onClick={() => resolve(detail.id, "resolved", catatan.trim() || undefined)} disabled={saving}>
                  <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-check"}`} /> Tandai Selesai
                </button>
                <button className="btn btn-outline" onClick={() => resolve(detail.id, "false_alarm", catatan.trim() || "False alarm")} disabled={saving}>Tandai Alarm Palsu</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {confirmAct && (
        <ConfirmDialog
          busy={saving}
          title={confirmAct.status === "resolved" ? "Tandai Selesai?" : "Tandai Alarm Palsu?"}
          msg={`Panic alert dari ${confirmAct.nama || "personil"} akan ditandai ${confirmAct.status === "resolved" ? "selesai ditangani" : "sebagai alarm palsu"}.`}
          confirmLabel={confirmAct.status === "resolved" ? "Ya, Selesai" : "Ya, Alarm Palsu"}
          confirmClass={confirmAct.status === "resolved" ? "btn-success" : "btn-primary"}
          onConfirm={() => resolve(confirmAct.id, confirmAct.status)}
          onCancel={() => !saving && setConfirmAct(null)}
        />
      )}
    </div>
  );
}
