"use client";
import React, { useState, useEffect, useCallback } from "react";
import { broadcastsApi, lokasiApi, getUser } from "@/lib/api";
import { fmtDateTime, statusColor, statusLabel } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

/**
 * BROADCAST
 * [Audit 2B] Validasi judul/pesan sebelum kirim (dulu 500 dari NOT NULL),
 * tombol nonaktif saat mengirim, pilihan lokasi tujuan (komandan otomatis
 * terkunci ke lokasinya), pencarian, skeleton, refresh, detail pesan.
 */
export default function BroadcastPage() {
  const { toast } = useToast();
  const user = getUser();
  const isKomandan = user?.role === "komandan";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const emptyForm = { judul: "", pesan: "", prioritas: "normal", target: "all", lokasi_id: "" };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await broadcastsApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat broadcast", "error");
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    lokasiApi.list("status=active").then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
    const unsub = onRealtimeEvent((ev) => { if (ev === "broadcast:new") load(); });
    return unsub;
  }, [load]);
  useEffect(() => { setCurrentPage(1); }, [search]);

  const send = async () => {
    if (saving) return;
    const judul = form.judul.trim(); const pesan = form.pesan.trim();
    if (judul.length < 2) return toast("Judul minimal 2 karakter", "warning");
    if (pesan.length < 2) return toast("Pesan wajib diisi", "warning");
    setSaving(true);
    try {
      await broadcastsApi.create({ judul, pesan, prioritas: form.prioritas, target: form.target, lokasi_id: form.lokasi_id || null });
      toast("Broadcast dikirim 📢");
      setModal(false);
      setForm(emptyForm);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setSaving(false); }
  };

  const filtered = data.filter((r) => !search || `${r.judul || ""} ${r.pesan || ""} ${r.pengirim_nama || ""}`.toLowerCase().includes(search.toLowerCase()));
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-bullhorn" /> Broadcast</h1>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /></button>
          <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setModal(true); }}>
            <i className="fas fa-paper-plane" /> Kirim
          </button>
        </div>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari judul / pesan / pengirim..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} broadcast (50 terbaru)</span>
        </div>
        {loading && data.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse" style={{ background: "var(--hover-row)", height: 40, borderRadius: 6 }} />)}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Judul</th>
                <th>Pesan</th>
                <th>Pengirim</th>
                <th>Prioritas</th>
                <th>Target</th>
                <th>Lokasi</th>
                <th>Waktu</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pagedData.map((r) => (
                <tr key={r.id}>
                  <td className="cell-ellipsis" title={r.judul}><strong>{r.judul}</strong></td>
                  <td className="cell-ellipsis-lg" title={r.pesan}>{r.pesan}</td>
                  <td className="cell-ellipsis-sm" title={r.pengirim_nama || "-"}>{r.pengirim_nama || "-"}</td>
                  <td><span className={`badge badge-${statusColor(r.prioritas)}`}>{statusLabel(r.prioritas)}</span></td>
                  <td className="cell-ellipsis-sm" title={r.target}>{r.target === "all" ? "Semua" : r.target}</td>
                  <td className="cell-ellipsis-sm" title={r.lokasi_nama || "Semua lokasi"}>{r.lokasi_nama || <span className="muted">Semua lokasi</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.created_at)}</td>
                  <td><button className="btn-icon" onClick={() => setDetail(r)} title="Lihat"><i className="fas fa-eye" /></button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="empty-row">Tidak ada broadcast{search ? " yang cocok" : ""}</td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>

      {modal && (
        <Modal
          title="Kirim Broadcast"
          onClose={() => !saving && setModal(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setModal(false)} disabled={saving}>Batal</button>
              <button className="btn btn-primary" onClick={send} disabled={saving || form.judul.trim().length < 2 || form.pesan.trim().length < 2}>
                <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-paper-plane"}`} /> {saving ? "Mengirim..." : "Kirim"}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Judul *</label>
            <input className="form-input" value={form.judul} maxLength={200} onChange={(e) => setForm({ ...form, judul: e.target.value })} placeholder="mis. Apel pagi dipercepat" />
          </div>
          <div className="form-group">
            <label className="form-label">Pesan *</label>
            <textarea className="form-textarea" value={form.pesan} maxLength={5000} onChange={(e) => setForm({ ...form, pesan: e.target.value })} rows={4} />
            <small className="muted">{form.pesan.length}/5000</small>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prioritas</label>
              <div className="form-chip-row">
                {["normal", "urgent"].map((p) => (
                  <button key={p} className={`form-chip ${form.prioritas === p ? "active" : ""}`} onClick={() => setForm({ ...form, prioritas: p })}>{statusLabel(p)}</button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Target Peran</label>
              <select className="form-select" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                <option value="all">Semua</option>
                <option value="anggota">Anggota</option>
                <option value="komandan">Komandan</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Lokasi Tujuan</label>
            {isKomandan ? (
              <input className="form-input" value={lokasi.find((l) => l.id === user?.lokasi_id)?.nama || "Lokasi Anda"} disabled />
            ) : (
              <select className="form-select" value={form.lokasi_id} onChange={(e) => setForm({ ...form, lokasi_id: e.target.value })}>
                <option value="">-- Semua Lokasi (global) --</option>
                {lokasi.map((l) => <option key={l.id} value={l.id}>📍 {l.nama}</option>)}
              </select>
            )}
            <small className="muted">{isKomandan ? "Komandan hanya dapat mengirim ke lokasinya sendiri." : "Kosongkan untuk mengirim ke seluruh personil."}</small>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.judul} onClose={() => setDetail(null)}>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Pengirim</div><div className="detail-value">{detail.pengirim_nama || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Waktu</div><div className="detail-value">{fmtDateTime(detail.created_at)}</div></div>
            <div className="detail-item"><div className="detail-label">Prioritas</div><div className="detail-value"><span className={`badge badge-${statusColor(detail.prioritas)}`}>{statusLabel(detail.prioritas)}</span></div></div>
            <div className="detail-item"><div className="detail-label">Target / Lokasi</div><div className="detail-value">{detail.target === "all" ? "Semua" : detail.target} · {detail.lokasi_nama || "Semua lokasi"}</div></div>
          </div>
          <div className="detail-item" style={{ marginTop: 12 }}><div className="detail-label">Pesan</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.pesan}</div></div>
        </Modal>
      )}
    </div>
  );
}
