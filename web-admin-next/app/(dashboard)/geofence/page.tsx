"use client";
import React, { useState, useEffect, useCallback } from "react";
import { geofenceApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtDateTime, statusColor, statusLabel } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";

/**
 * GEOFENCE & IZIN KELUAR
 * [Audit 2B]
 *  - Tolak izin langsung mengirim catatan "Ditolak" tanpa alasan → kini modal
 *    dengan alasan wajib (anggota melihat alasannya di aplikasi).
 *  - Durasi 0/kosong bisa dikirim (backend 400) → validasi 1–1440 menit.
 *  - Tombol aksi nonaktif saat proses; filter status; pagination; error load
 *    ditampilkan (sebelumnya ditelan diam-diam).
 */
export default function GeofencePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"izin" | "violations">("izin");
  const [izinList, setIzinList] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [approveModal, setApproveModal] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [durasi, setDurasi] = useState(30);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState("");
  const [filterIzin, setFilterIzin] = useState("pending");
  const [filterVio, setFilterVio] = useState("belum");
  const [pageIzin, setPageIzin] = useState(1);
  const [pageVio, setPageVio] = useState(1);
  const PAGE_SIZE = 15;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [iz, vi] = await Promise.all([geofenceApi.izinList("limit=200"), geofenceApi.violations("limit=200")]);
      setIzinList(Array.isArray(iz) ? iz : []);
      setViolations(Array.isArray(vi) ? vi : []);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat data geofence", "error");
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadData();
    const unsub = onRealtimeEvent((ev) => { if (ev.includes("geofence") || ev.includes("izin")) loadData(); });
    return unsub;
  }, [loadData]);
  useEffect(() => { setPageIzin(1); }, [filterIzin]);
  useEffect(() => { setPageVio(1); }, [filterVio]);

  const handleApprove = async () => {
    if (!approveModal || saving) return;
    const d = Number(durasi);
    if (!Number.isInteger(d) || d < 1 || d > 1440) return toast("Durasi harus 1–1440 menit", "warning");
    setSaving("approve");
    try {
      await geofenceApi.izinApprove(approveModal.id, d, catatan.trim() || undefined);
      toast("Izin disetujui ✓");
      setApproveModal(null);
      loadData();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setSaving(""); }
  };
  const handleReject = async () => {
    if (!rejectModal || saving) return;
    const alasan = catatan.trim();
    if (alasan.length < 3) return toast("Alasan penolakan wajib diisi (min. 3 karakter)", "warning");
    setSaving("reject");
    try {
      await geofenceApi.izinReject(rejectModal.id, alasan);
      toast("Izin ditolak");
      setRejectModal(null);
      loadData();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setSaving(""); }
  };
  const handleAck = async (id: string) => {
    if (saving) return;
    setSaving(`ack-${id}`);
    try {
      await geofenceApi.ackViolation(id);
      toast("Pelanggaran ditanggapi");
      loadData();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setSaving(""); }
  };

  const pendingCount = izinList.filter((i) => i.status === "pending").length;
  const belumCount = violations.filter((v) => !v.acknowledged).length;
  const izinFiltered = izinList.filter((i) => !filterIzin || i.status === filterIzin);
  const vioFiltered = violations.filter((v) => filterVio === "" ? true : filterVio === "belum" ? !v.acknowledged : !!v.acknowledged);
  const izinPaged = izinFiltered.slice((pageIzin - 1) * PAGE_SIZE, pageIzin * PAGE_SIZE);
  const vioPaged = vioFiltered.slice((pageVio - 1) * PAGE_SIZE, pageVio * PAGE_SIZE);
  const countIzin = (s: string) => (s ? izinList.filter((i) => i.status === s).length : izinList.length);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-shield-alt" /> Geofence & Izin Keluar</h1>
        <button className="btn btn-outline btn-sm" onClick={loadData} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Kelola izin keluar radius bagi anggota. Anggota yang ingin keluar dari radius lokasi harus meminta izin; setelah disetujui berlaku batas waktu. Keluar tanpa izin atau melewati batas waktu tercatat sebagai pelanggaran.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={`btn ${tab === "izin" ? "btn-primary" : "btn-outline"}`} onClick={() => setTab("izin")}>
          📋 Izin Keluar {pendingCount > 0 && <span className="badge badge-warning" style={{ marginLeft: 6 }}>{pendingCount} menunggu</span>}
        </button>
        <button className={`btn ${tab === "violations" ? "btn-danger" : "btn-outline"}`} onClick={() => setTab("violations")}>
          ⚠️ Pelanggaran {belumCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 6 }}>{belumCount} belum</span>}
        </button>
      </div>

      {tab === "izin" && (
        <div className="section-card">
          <div className="filters-row">
            <div className="form-chip-row">
              {[{ v: "pending", l: "Menunggu" }, { v: "approved", l: "Disetujui" }, { v: "rejected", l: "Ditolak" }, { v: "expired", l: "Kedaluwarsa" }, { v: "returned", l: "Kembali" }, { v: "", l: "Semua" }].map((s) => (
                <button key={s.v} className={`form-chip ${filterIzin === s.v ? "active" : ""}`} onClick={() => setFilterIzin(s.v)}>{s.l} ({countIzin(s.v)})</button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Nama</th><th>NRP</th><th>Alasan</th><th>Durasi</th><th>Batas Waktu</th><th>Status</th><th>Catatan</th><th>Diajukan</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {izinPaged.map((iz) => (
                <tr key={iz.id}>
                  <td className="cell-ellipsis-sm" title={iz.user_nama}><strong>{iz.user_nama}</strong></td>
                  <td><code>{iz.nrp}</code></td>
                  <td className="cell-ellipsis-lg" title={iz.alasan}>{iz.alasan}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{iz.durasi_menit ? `${iz.durasi_menit} mnt` : "-"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{iz.batas_waktu ? fmtDateTime(iz.batas_waktu) : "-"}</td>
                  <td><span className={`badge badge-${statusColor(iz.status)}`}>{statusLabel(iz.status)}</span></td>
                  <td className="cell-ellipsis" title={iz.catatan_komandan || iz.catatan || "-"}>{iz.catatan_komandan || iz.catatan || <span className="muted">-</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(iz.created_at)}</td>
                  <td>
                    {iz.status === "pending" && (
                      <div className="btn-group">
                        <button className="btn btn-sm btn-primary" disabled={!!saving} onClick={() => { setApproveModal(iz); setDurasi(30); setCatatan(""); }}>✓ Setujui</button>
                        <button className="btn btn-sm btn-outline" disabled={!!saving} onClick={() => { setRejectModal(iz); setCatatan(""); }} style={{ color: "var(--danger)" }}>✗ Tolak</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {izinFiltered.length === 0 && (
                <tr><td colSpan={9} className="empty-row">{loading ? "Memuat..." : `Tidak ada izin${filterIzin ? ` berstatus ${statusLabel(filterIzin).toLowerCase()}` : ""}`}</td></tr>
              )}
            </tbody>
          </table>
          <Pagination currentPage={pageIzin} totalItems={izinFiltered.length} pageSize={PAGE_SIZE} onPageChange={setPageIzin} />
        </div>
      )}

      {tab === "violations" && (
        <div className="section-card">
          <div className="filters-row">
            <div className="form-chip-row">
              {[{ v: "belum", l: `Belum ditanggapi (${belumCount})` }, { v: "sudah", l: `Ditanggapi (${violations.length - belumCount})` }, { v: "", l: `Semua (${violations.length})` }].map((s) => (
                <button key={s.v} className={`form-chip ${filterVio === s.v ? "active" : ""}`} onClick={() => setFilterVio(s.v)}>{s.l}</button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Nama</th><th>Tipe</th><th>Jarak</th><th>Lokasi</th><th>Waktu</th><th>Status</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {vioPaged.map((v) => (
                <tr key={v.id}>
                  <td className="cell-ellipsis-sm" title={v.user_nama}><strong>{v.user_nama}</strong> {v.nrp && <code style={{ fontSize: 10 }}>{v.nrp}</code>}</td>
                  <td>{v.tipe === "no_permission" ? <span className="badge badge-danger">Tanpa Izin</span> : <span className="badge badge-warning">Lewat Waktu</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{v.jarak_dari_pusat != null ? `${Math.round(Number(v.jarak_dari_pusat))} m` : "-"}</td>
                  <td className="cell-ellipsis-sm" title={v.lokasi_nama || "-"}>{v.lokasi_nama || "-"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(v.created_at)}</td>
                  <td>{v.acknowledged ? <span className="badge badge-success">Ditanggapi</span> : <span className="badge badge-warning">Belum</span>}</td>
                  <td>
                    {!v.acknowledged && (
                      <button className="btn btn-sm btn-outline" disabled={!!saving} onClick={() => handleAck(v.id)}>
                        <i className={`fas ${saving === `ack-${v.id}` ? "fa-spinner fa-spin" : "fa-check"}`} /> Tanggapi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {vioFiltered.length === 0 && (
                <tr><td colSpan={7} className="empty-row">{loading ? "Memuat..." : "Tidak ada pelanggaran"}</td></tr>
              )}
            </tbody>
          </table>
          <Pagination currentPage={pageVio} totalItems={vioFiltered.length} pageSize={PAGE_SIZE} onPageChange={setPageVio} />
        </div>
      )}

      {approveModal && (
        <Modal
          title={`Setujui Izin - ${approveModal.user_nama}`}
          onClose={() => !saving && setApproveModal(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setApproveModal(null)} disabled={!!saving}>Batal</button>
              <button className="btn btn-primary" onClick={handleApprove} disabled={!!saving}>
                <i className={`fas ${saving === "approve" ? "fa-spinner fa-spin" : "fa-check"}`} /> Setujui
              </button>
            </>
          }
        >
          <p className="muted" style={{ marginBottom: 12 }}>
            Alasan: <em>{approveModal.alasan}</em><br />
            Tentukan berapa menit anggota boleh keluar dari radius. Setelah waktu habis, status izin menjadi kedaluwarsa dan posisi di luar radius dicatat sebagai pelanggaran.
          </p>
          <div className="form-group">
            <label className="form-label">Durasi (menit) *</label>
            <div className="form-chip-row" style={{ marginBottom: 6 }}>
              {[15, 30, 60, 120].map((m) => <button key={m} className={`form-chip ${durasi === m ? "active" : ""}`} onClick={() => setDurasi(m)}>{m} mnt</button>)}
            </div>
            <input type="number" className="form-input" value={durasi} onChange={(e) => setDurasi(parseInt(e.target.value) || 0)} min={1} max={1440} />
          </div>
          <div className="form-group">
            <label className="form-label">Catatan (opsional)</label>
            <textarea className="form-textarea" rows={2} value={catatan} maxLength={500} onChange={(e) => setCatatan(e.target.value)} />
          </div>
        </Modal>
      )}

      {rejectModal && (
        <Modal
          title={`Tolak Izin - ${rejectModal.user_nama}`}
          onClose={() => !saving && setRejectModal(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setRejectModal(null)} disabled={!!saving}>Batal</button>
              <button className="btn btn-danger" onClick={handleReject} disabled={!!saving || catatan.trim().length < 3}>
                <i className={`fas ${saving === "reject" ? "fa-spinner fa-spin" : "fa-times"}`} /> Tolak Izin
              </button>
            </>
          }
        >
          <p className="muted" style={{ marginBottom: 12 }}>Alasan pengajuan: <em>{rejectModal.alasan}</em></p>
          <div className="form-group">
            <label className="form-label">Alasan penolakan * <small className="muted">(dilihat anggota)</small></label>
            <textarea className="form-textarea" rows={3} value={catatan} maxLength={500} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. Pos tidak boleh kosong pada jam ini" autoFocus />
          </div>
        </Modal>
      )}
    </div>
  );
}
