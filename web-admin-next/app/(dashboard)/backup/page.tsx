"use client";
import React, { useState, useEffect, useCallback } from "react";
import { backupApi, getUser, API_URL } from "@/lib/api";
import { fmtDateTime } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * BACKUP & RESTORE
 * [Audit 2B]
 *  - Endpoint download & delete sudah ada di backend tapi tidak ada tombolnya.
 *  - Jadwal backup otomatis (GET/PUT /api/backup/schedule) tidak punya UI →
 *    fitur backend "mati" karena tidak pernah bisa diaktifkan dari admin.
 *  - Teks info menyebut "Laragon" (lingkungan dev lama) → diperbarui.
 *  - Restore hanya untuk admin (backend adminGuard) → tombol disembunyikan
 *    untuk supervisor agar tidak mendapat 403 misterius.
 */
export default function BackupPage() {
  const { toast } = useToast();
  const { t } = useSettings();
  const user = getUser();
  const isAdmin = user?.role === "admin";
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ enabled: boolean; time: string }>({ enabled: false, time: "02:00" });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const d = await backupApi.list();
      setBackups(Array.isArray(d) ? d : []);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat daftar backup", "error");
    } finally { setListLoading(false); }
    try {
      const s: any = await backupApi.getSchedule();
      if (s && typeof s === "object") setSchedule({ enabled: !!s.enabled, time: s.time || "02:00" });
    } catch { /* opsional */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const createBackup = async () => {
    if (loading) return;
    setLoading("create");
    try {
      const r: any = await backupApi.create();
      toast(`${t("backup_berhasil")}${r?.filename ? ` (${r.filename})` : ""}`);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setLoading(""); }
  };
  const uploadDrive = async (filename: string) => {
    if (loading) return;
    setLoading(`drive-${filename}`);
    try {
      await backupApi.uploadDrive(filename);
      toast("Upload ke Google Drive berhasil");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setLoading(""); }
  };
  const doRestore = async () => {
    const filename = restoreTarget;
    if (!filename) return;
    setRestoreTarget(null);
    setLoading("restore");
    try {
      await backupApi.restore(filename);
      toast(t("restore_berhasil"));
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setLoading(""); }
  };
  const doDelete = async () => {
    const filename = deleteTarget;
    if (!filename) return;
    setDeleteTarget(null);
    setLoading(`del-${filename}`);
    try {
      await backupApi.del(filename);
      toast("File backup dihapus");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setLoading(""); }
  };
  const saveSchedule = async (next: { enabled: boolean; time: string }) => {
    if (scheduleSaving) return;
    if (!/^\d{2}:\d{2}$/.test(next.time)) return toast("Format jam harus HH:MM", "warning");
    setScheduleSaving(true);
    try {
      await backupApi.schedule(next.enabled, next.time);
      setSchedule(next);
      toast(next.enabled ? `Backup otomatis aktif setiap hari pukul ${next.time}` : "Backup otomatis dinonaktifkan");
    } catch (e: any) {
      toast(e.message, "error");
    } finally { setScheduleSaving(false); }
  };
  const fmtSize = (b: any) => {
    if (typeof b.size === "string") return b.size;
    const n = Number(b.size || b.size_bytes || 0);
    if (!n) return "-";
    return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-database" /> {t("backup_restore")}</h1>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={load} disabled={listLoading}><i className={`fas fa-sync-alt ${listLoading ? "fa-spin" : ""}`} /></button>
          <button className="btn btn-primary" onClick={createBackup} disabled={!!loading}>
            {loading === "create" ? <><i className="fas fa-spinner fa-spin" /> Membuat backup...</> : <><i className="fas fa-plus" /> {t("buat_backup")}</>}
          </button>
        </div>
      </div>

      <div className="grid-2-1">
        <div className="section-card">
          <h3 style={{ marginBottom: 12 }}>📁 {t("riwayat_backup")} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>({backups.length} file)</span></h3>
          <table>
            <thead>
              <tr><th>File</th><th>Ukuran</th><th>Tanggal</th><th>Drive</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {listLoading && backups.length === 0 ? (
                <tr><td colSpan={5}><div className="animate-pulse" style={{ background: "var(--hover-row, #e5e7eb)", height: 40, borderRadius: 6 }} /></td></tr>
              ) : backups.map((b: any) => (
                <tr key={b.filename}>
                  <td className="cell-ellipsis" title={b.filename}><code style={{ fontSize: 11 }}>{b.filename}</code></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtSize(b)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{b.created_at ? fmtDateTime(b.created_at) : "-"}</td>
                  <td>{b.drive_url ? <a href={b.drive_url} target="_blank" rel="noreferrer" className="badge badge-success">✅ Drive</a> : <span className="muted">-</span>}</td>
                  <td>
                    <div className="btn-group">
                      <a className="btn btn-sm btn-outline" href={`${API_URL}/api/backup/download/${encodeURIComponent(b.filename)}`} title="Unduh" target="_blank" rel="noreferrer">
                        <i className="fas fa-download" />
                      </a>
                      <button className="btn btn-sm btn-outline" onClick={() => uploadDrive(b.filename)} disabled={!!loading} title="Upload ke Google Drive">
                        <i className={`fas ${loading === `drive-${b.filename}` ? "fa-spinner fa-spin" : "fa-cloud-upload-alt"}`} />
                      </button>
                      {isAdmin && (
                        <button className="btn btn-sm btn-outline" onClick={() => setRestoreTarget(b.filename)} disabled={!!loading} title="Restore (timpa database)" style={{ color: "var(--warning)" }}>
                          <i className={`fas ${loading === "restore" ? "fa-spinner fa-spin" : "fa-undo"}`} />
                        </button>
                      )}
                      <button className="btn btn-sm btn-outline" onClick={() => setDeleteTarget(b.filename)} disabled={!!loading} title="Hapus file" style={{ color: "var(--danger)" }}>
                        <i className={`fas ${loading === `del-${b.filename}` ? "fa-spinner fa-spin" : "fa-trash"}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!listLoading && backups.length === 0 && (
                <tr><td colSpan={5} className="empty-row">Belum ada backup. Klik "{t("buat_backup")}" untuk membuat backup pertama.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div className="section-card">
            <h3 style={{ marginBottom: 10 }}>⏰ Backup Otomatis</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Backup harian dijalankan oleh server pada jam yang ditentukan (zona waktu server, WIB). Pengaturan tersimpan dan tetap aktif setelah redeploy.
            </p>
            <div className="form-group">
              <label className="form-label">Status</label>
              <div className="form-chip-row">
                <button className={`form-chip ${schedule.enabled ? "active" : ""}`} disabled={scheduleSaving} onClick={() => saveSchedule({ ...schedule, enabled: true })}>Aktif</button>
                <button className={`form-chip ${!schedule.enabled ? "active" : ""}`} disabled={scheduleSaving} onClick={() => saveSchedule({ ...schedule, enabled: false })}>Nonaktif</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Jam backup</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="time" className="form-input" style={{ width: "auto" }} value={schedule.time} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} />
                <button className="btn btn-sm btn-primary" disabled={scheduleSaving} onClick={() => saveSchedule(schedule)}>
                  <i className={`fas ${scheduleSaving ? "fa-spinner fa-spin" : "fa-save"}`} /> Simpan
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              {schedule.enabled
                ? <span className="badge badge-success">Aktif · setiap hari {schedule.time}</span>
                : <span className="badge badge-default">Nonaktif</span>}
            </div>
          </div>
          <div className="section-card">
            <h3 style={{ marginBottom: 8 }}>ℹ️ Informasi</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
              Database: <strong>PostgreSQL 16</strong> (container Docker) · <code>ptsss_db</code><br />
              Backup dibuat dengan <code>pg_dump</code> (format SQL, <code>--clean --if-exists</code>) dan disimpan pada volume <code>backend/backups/</code> di server.<br />
              <strong>Restore</strong> menimpa seluruh isi database dan hanya dapat dilakukan oleh admin. Unduh salinan backup secara berkala ke penyimpanan di luar server.
            </p>
          </div>
        </div>
      </div>

      {restoreTarget && (
        <ConfirmDialog
          title="Restore Database?"
          msg={`PERHATIAN: Restore dari "${restoreTarget}" akan MENIMPA seluruh database saat ini. Buat backup terbaru sebelum melanjutkan. Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel="Ya, Restore"
          onConfirm={doRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Hapus File Backup?"
          msg={`File "${deleteTarget}" akan dihapus permanen dari server.`}
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
