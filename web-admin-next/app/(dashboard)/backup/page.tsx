"use client";
import React, { useState, useEffect } from "react";
import { backupApi } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function BackupPage() {
  const { toast } = useToast();
  const { t } = useSettings();
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null); // [6-1] ConfirmDialog target
  const load = async () => {
    try {
      const d = await backupApi.list();
      setBackups(Array.isArray(d) ? d : []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
  const createBackup = async () => {
    setLoading("create");
    try {
      await backupApi.create();
      toast(t("backup_berhasil"));
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
    setLoading("");
  };
  const uploadDrive = async (filename: string) => {
    setLoading(filename);
    try {
      await backupApi.uploadDrive(filename);
      toast("Upload berhasil!");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
    setLoading("");
  };
  // [6-1] Buka ConfirmDialog (konsisten dgn halaman lain) alih-alih window.confirm.
  const restoreDB = (filename: string) => setRestoreTarget(filename);
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
    }
    setLoading("");
  };
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-database" />
          {t("backup_restore")}
        </h1>
        <button
          className="btn btn-primary"
          onClick={createBackup}
          disabled={loading === "create"}
        >
          {loading === "create" ? (
            "Backup..."
          ) : (
            <>
              <i className="fas fa-plus" /> {t("buat_backup")}
            </>
          )}
        </button>
      </div>
      <div className="section-card">
        <h3 style={{ marginBottom: 12 }}>📁 {t("riwayat_backup")}</h3>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Ukuran</th>
              <th>Tanggal</th>
              <th>Google Drive</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b: any, i: number) => (
              <tr key={i}>
                <td className="cell-ellipsis" title={b.filename}>
                  <code>{b.filename}</code>
                </td>
                <td>{b.size || "-"}</td>
                <td>{b.created_at ? fmtDateTime(b.created_at) : "-"}</td>
                <td>
                  {b.drive_url ? (
                    <a
                      href={b.drive_url}
                      target="_blank"
                      rel="noreferrer"
                      className="badge badge-success"
                    >
                      ✅ Uploaded
                    </a>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td>
                  <div className="btn-group">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => uploadDrive(b.filename)}
                      disabled={!!loading}
                      title="Upload Drive"
                    >
                      <i className="fas fa-cloud-upload-alt" />
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => restoreDB(b.filename)}
                      disabled={!!loading}
                      title="Restore"
                      style={{ color: "var(--warning)" }}
                    >
                      <i className="fas fa-undo" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  Belum ada backup. Klik "Buat Backup" untuk membuat backup
                  pertama.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="section-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>ℹ️ Informasi</h3>
        <p
          style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}
        >
          Database: <strong>PostgreSQL (Laragon)</strong> - ptsss_db
          <br />
          Backup menggunakan <code>pg_dump</code> (atau SQL fallback). File
          disimpan di <code>backend/backups/</code>
          <br />
          Jika pg_dump tidak tersedia, backup dilakukan via SQL query otomatis.
        </p>
      </div>
      {restoreTarget && (
        <ConfirmDialog
          title="Restore Database?"
          msg={`PERHATIAN: Restore dari "${restoreTarget}" akan MENIMPA seluruh database saat ini. Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel="Restore"
          onConfirm={doRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
