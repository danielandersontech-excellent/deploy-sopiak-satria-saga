"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { absensiApi, dashboardApi, getUser } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtTime, fmtDateTime, fmtDateLong, statusColor, statusLabel, avatarUrl } from "@/lib/formatters";
import { useSettings } from "@/hooks/useSettings";

/**
 * DASHBOARD
 * [Audit 2B]
 *  - Grafik 7 hari kini memakai `weekly_absensi` dari /dashboard/stats
 *    (dihitung di DB). Sebelumnya 7 request /api/absensi?date= yang masing-
 *    masing dibatasi 20 baris → grafik mentok di 20.
 *  - Grid 2 kolom inline diganti .grid-2 responsif (≤900px jadi 1 kolom).
 *  - State error & kosong yang jelas; insiden terbaru ditampilkan.
 */
export default function DashboardPage() {
  const [s, setS] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [act, setAct] = useState<any[]>([]);
  const { t } = useSettings();
  const user = getUser();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [stats, absData] = await Promise.all([
        dashboardApi.stats(),
        absensiApi.today().catch(() => []),
      ]);
      setS(stats || {});
      setAct(Array.isArray(absData) ? absData.slice(0, 8) : []);
    } catch (e: any) {
      setError(e?.message || "Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const unsub = onRealtimeEvent((ev) => {
      if (["absensi:new", "patroli:update", "laporan:new", "panic:alert", "panic:resolved", "stats:update"].includes(ev)) loadDashboard();
    });
    return unsub;
  }, [loadDashboard]);

  // 7 hari terakhir (termasuk hari ini) — isi 0 untuk hari tanpa data.
  const weekly = (() => {
    const map: Record<string, number> = {};
    (s.weekly_absensi || []).forEach((w: any) => {
      const key = String(w.tanggal).slice(0, 10);
      map[key] = Number(w.jumlah) || 0;
    });
    const days: { key: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ key, label: d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit" }), count: map[key] || 0 });
    }
    return days;
  })();
  const maxW = Math.max(...weekly.map((w) => w.count), 1);

  const kpis = [
    { label: t("total_personil"), value: s.total_personil ?? s.total ?? 0, icon: "fa-users", color: "blue", href: "/personil" },
    { label: t("sedang_bertugas"), value: s.on_duty ?? s.onDuty ?? 0, icon: "fa-user-check", color: "green", href: "/live-map" },
    { label: t("absensi_hari_ini"), value: s.absensi_today ?? s.absToday ?? 0, icon: "fa-fingerprint", color: "purple", href: "/absensi" },
    { label: t("laporan_pending"), value: s.pending_laporan ?? s.pending_reports ?? s.pending ?? 0, icon: "fa-file-alt", color: "orange", href: "/laporan-harian" },
    { label: t("panic_aktif"), value: s.active_panic ?? s.panic ?? 0, icon: "fa-bell", color: "red", href: "/panic" },
    { label: t("lokasi_klien"), value: s.total_lokasi ?? s.lokasi ?? 0, icon: "fa-building", color: "blue", href: "/lokasi" },
  ];
  const pc = s.patrol_completion || { total: 0, completed: 0, rate: 0 };
  const incidents: any[] = Array.isArray(s.recent_incidents) ? s.recent_incidents : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-th-large" />
          {t("dashboard")}
        </h1>
        <div className="page-actions">
          <span className="muted">
            {fmtDateLong(new Date())}
          </span>
          <button className="btn btn-outline btn-sm" onClick={loadDashboard} disabled={loading} title="Muat ulang">
            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="section-card" style={{ borderLeft: "4px solid var(--danger)", color: "var(--danger)" }}>
          <i className="fas fa-exclamation-circle" /> {error}
        </div>
      )}

      {/* [Misi V3 / C1-C2] Peringatan yang butuh tindakan admin/komandan — data tidak diubah otomatis. */}
      {((s.kontrak_habis > 0 || s.kontrak_hampir_habis > 0) || s.pending_lama > 0) && (
        <div className="alert-grid">
          {s.kontrak_habis > 0 && (
            <Link href="/clients?filter=kontrak-habis" className="alert-card danger">
              <i className="fas fa-file-contract alert-icon" />
              <div className="alert-body">
                <div className="alert-title">{s.kontrak_habis} kontrak klien sudah habis</div>
                <div className="alert-sub">Klien masih berstatus Aktif. Tinjau: perpanjang kontrak atau nonaktifkan.</div>
              </div>
              <i className="fas fa-chevron-right text-danger" />
            </Link>
          )}
          {s.kontrak_hampir_habis > 0 && (
            <Link href="/clients?filter=kontrak-hampir" className="alert-card warning">
              <i className="fas fa-hourglass-half alert-icon" />
              <div className="alert-body">
                <div className="alert-title">{s.kontrak_hampir_habis} kontrak habis dalam 30 hari</div>
                <div className="alert-sub">Hubungi klien untuk perpanjangan sebelum jatuh tempo.</div>
              </div>
              <i className="fas fa-chevron-right text-warning" />
            </Link>
          )}
          {s.pending_lama > 0 && (
            <Link href="/laporan-harian?status=pending&min_age_days=30" className="alert-card warning">
              <i className="fas fa-file-signature alert-icon" />
              <div className="alert-body">
                <div className="alert-title">{s.pending_lama} laporan menunggu validasi &gt; 30 hari</div>
                <div className="alert-sub">Komandan dapat memvalidasi massal lewat checkbox di halaman Laporan.</div>
              </div>
              <i className="fas fa-chevron-right text-warning" />
            </Link>
          )}
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <Link key={i} href={k.href} className={`kpi-card ${k.color}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="kpi-icon">
              <i className={`fas ${k.icon}`} />
            </div>
            <div>
              <div className="kpi-val">{loading && !s.total_personil ? "…" : k.value}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <div className="section-card">
          <div className="section-header">
            <h3>📊 {t("absensi_7hari")}</h3>
            <span className="muted">Total: {weekly.reduce((a, w) => a + w.count, 0)}</span>
          </div>
          <div className="bar-chart">
            {weekly.map((w) => (
              <div key={w.key} className="bar-col" title={`${w.key}: ${w.count} absensi`}>
                <div className="bar-val">{w.count}</div>
                <div className="bar-fill" style={{ height: `${(w.count / maxW) * 140}px`, background: "var(--primary)" }} />
                <div className="bar-label">{w.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 12 }} className="muted">
            <span><i className="fas fa-route" /> Patroli 30 hari: <strong>{pc.completed}/{pc.total}</strong> selesai ({pc.rate}%)</span>
            <span><i className="fas fa-map-marker-alt" /> Checkpoint aktif: <strong>{s.total_checkpoints ?? 0}</strong></span>
          </div>
        </div>
        <div className="section-card">
          <div className="section-header">
            <h3>📋 {t("aktivitas_terbaru")}</h3>
            <Link href="/absensi" className="muted" style={{ fontSize: 12 }}>Lihat semua →</Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Personil</th>
                <th>Tipe</th>
                <th>Waktu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {act.map((a: any) => (
                <tr key={a.id}>
                  <td className="user-cell">
                    <img className="avatar avatar-sm" src={avatarUrl(a.user_foto_url || a.users?.foto_url)} alt="" />
                    <span title={a.nama || a.users?.nama || "-"}>{a.nama || a.users?.nama || "-"}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${a.tipe === "masuk" ? "success" : "info"}`}>{a.tipe}</span>
                  </td>
                  <td>{fmtTime(a.waktu || a.created_at)}</td>
                  <td>
                    <span className={`badge badge-${statusColor(a.status)}`}>{statusLabel(a.status)}</span>
                  </td>
                </tr>
              ))}
              {act.length === 0 && (
                <tr><td colSpan={4} className="empty-row">{loading ? "Memuat..." : "Belum ada absensi hari ini"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {incidents.length > 0 && (
        <div className="section-card">
          <div className="section-header">
            <h3>🚨 Insiden Terbaru</h3>
            <Link href="/laporan-kejadian" className="muted" style={{ fontSize: 12 }}>Lihat semua →</Link>
          </div>
          <table>
            <thead>
              <tr><th>Jenis</th><th>Pelapor</th><th>Prioritas</th><th>Status</th><th>Waktu</th></tr>
            </thead>
            <tbody>
              {incidents.map((k: any) => (
                <tr key={k.id}>
                  <td className="cell-ellipsis" title={k.jenis}><strong>{k.jenis}</strong></td>
                  <td className="cell-ellipsis-sm" title={k.nama || "-"}>{k.nama || "-"}</td>
                  <td><span className={`badge badge-${statusColor(k.prioritas)}`}>{statusLabel(k.prioritas)}</span></td>
                  <td><span className={`badge badge-${statusColor(k.status)}`}>{statusLabel(k.status)}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(k.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {user?.role === "klien" && (
        <p className="muted" style={{ marginTop: 8 }}>
          <i className="fas fa-info-circle" /> Anda melihat data untuk lokasi yang terdaftar atas nama klien Anda.
        </p>
      )}
    </div>
  );
}
