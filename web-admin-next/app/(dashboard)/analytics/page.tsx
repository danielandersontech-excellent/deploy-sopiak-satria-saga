"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { dashboardApi, lokasiApi } from "@/lib/api";
import { avatarUrl } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

/**
 * ANALYTICS
 * [Audit 2B] Sebelumnya semua agregat dihitung di browser dari 20 baris
 * pertama (halaman default API) → angka kehadiran/insiden/patroli SALAH
 * begitu data > 20. Kini memakai GET /api/data/dashboard/analytics yang
 * menghitung di server (scope per peran tetap berlaku), dengan filter
 * periode & lokasi. Grid memakai kelas responsif agar tidak pecah di HP.
 */
const COLORS = ["#10B981", "#F59E0B", "#EF4444", "#1A56DB", "#8B5CF6", "#0EA5E9"];
const ROLE_LABEL: Record<string, string> = { anggota: "Anggota", komandan: "Komandan", supervisor: "Supervisor", admin: "Admin", klien: "Klien" };

const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00`);
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit" });
};
const last7 = () => {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
};

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(days) });
      if (filterLokasi) qs.set("lokasi_id", filterLokasi);
      const d = await dashboardApi.analytics(qs.toString());
      setData(d || null);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat analytics", "error");
    } finally { setLoading(false); }
  }, [days, filterLokasi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { lokasiApi.list("status=active").then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const abs = data?.absensi || {};
  const lh = data?.laporan_harian || {};
  const lk = data?.laporan_kejadian || {};
  const pt = data?.patroli || {};
  const masuk = Number(abs.masuk) || 0;
  const hadir = Number(abs.hadir) || 0;
  const terlambat = Number(abs.terlambat) || 0;
  const tidakHadir = Number(abs.tidak_hadir) || 0;
  const kehadiranPct = masuk > 0 ? Math.round(((hadir + terlambat) / masuk) * 100) : 0;
  const totalPersonil = (data?.distribusi_role || []).filter((r: any) => r.role !== "klien").reduce((s: number, r: any) => s + (Number(r.jumlah) || 0), 0);
  const topPerformers: any[] = data?.top_performers || [];

  const absensiPieData = useMemo(() => [
    { name: "Hadir", value: hadir }, { name: "Terlambat", value: terlambat }, { name: "Tidak Hadir", value: tidakHadir },
  ].filter((d) => d.value > 0), [hadir, terlambat, tidakHadir]);

  const laporanBarData = useMemo(() => [
    { name: "Harian", approved: Number(lh.approved) || 0, pending: Number(lh.pending) || 0, revision: Number(lh.revision) || 0 },
    { name: "Kejadian", approved: Number(lk.approved) || 0, pending: (Number(lk.total) || 0) - (Number(lk.approved) || 0), revision: Number(lk.kritis) || 0 },
  ], [lh, lk]);

  const weeklyData = useMemo(() => {
    const map: Record<string, any> = {};
    (data?.absensi_mingguan || []).forEach((r: any) => { map[r.tanggal] = r; });
    return last7().map((ymd) => ({ day: dayLabel(ymd), hadir: Number(map[ymd]?.hadir) || 0, terlambat: Number(map[ymd]?.terlambat) || 0 }));
  }, [data]);
  const patroliWeekly = useMemo(() => {
    const map: Record<string, any> = {};
    (data?.patroli_mingguan || []).forEach((r: any) => { map[r.tanggal] = r; });
    return last7().map((ymd) => ({ day: dayLabel(ymd), selesai: Number(map[ymd]?.selesai) || 0, berlangsung: Number(map[ymd]?.berlangsung) || 0 }));
  }, [data]);
  const rolePieData = useMemo(() => (data?.distribusi_role || []).map((r: any) => ({ name: ROLE_LABEL[r.role] || r.role, value: Number(r.jumlah) || 0 })), [data]);

  const tooltipStyle = { contentStyle: { background: "#1E293B", border: "1px solid #334155", borderRadius: 8, color: "#F1F5F9", fontSize: 12 } };
  const kpis = [
    { label: "Personil Aktif", value: totalPersonil, icon: "fa-users", color: "var(--primary)" },
    { label: `Kehadiran (${days} hari)`, value: `${kehadiranPct}%`, icon: "fa-check-circle", color: "var(--success)" },
    { label: "Insiden", value: Number(lk.total) || 0, icon: "fa-exclamation-triangle", color: "var(--warning)" },
    { label: "Patroli Selesai", value: Number(pt.completed) || 0, icon: "fa-route", color: "var(--primary)" },
    { label: "Laporan Menunggu", value: Number(lh.pending) || 0, icon: "fa-clock", color: "var(--warning)" },
    { label: "Insiden Kritis", value: Number(lk.kritis) || 0, icon: "fa-fire", color: "var(--danger)" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-chart-bar" /> Analytics</h1>
        <div className="page-actions">
          {lokasi.length > 1 && (
            <select className="form-select" style={{ width: "auto" }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)}>
              <option value="">Semua Lokasi</option>
              {lokasi.map((l: any) => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
          )}
          <div className="form-chip-row">
            {[7, 30, 90].map((d) => <button key={d} className={`form-chip ${days === d ? "active" : ""}`} onClick={() => setDays(d)}>{d} hari</button>)}
          </div>
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {kpis.map((kpi, i) => (
          <div key={i} className="section-card" style={{ textAlign: "center", padding: 16, marginBottom: 0 }}>
            <i className={`fas ${kpi.icon}`} style={{ fontSize: 22, color: kpi.color, marginBottom: 8 }} />
            <div style={{ fontSize: 26, fontWeight: 800, color: kpi.color }}>{loading && !data ? "…" : kpi.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2-1">
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-chart-area" /> Absensi 7 Hari Terakhir</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="hadir" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.4} name="Hadir" />
              <Area type="monotone" dataKey="terlambat" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.4} name="Terlambat" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-chart-pie" /> Status Absensi ({days} hari)</h3>
          {absensiPieData.length === 0 ? <p className="muted" style={{ textAlign: "center", padding: 40 }}>Belum ada absensi pada periode ini</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={absensiPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {absensiPieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-chart-bar" /> Status Laporan ({days} hari)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={laporanBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              <Bar dataKey="approved" fill="#10B981" name="Disetujui" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pending" fill="#F59E0B" name="Menunggu/Terbuka" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revision" fill="#EF4444" name="Revisi / Kritis" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-chart-line" /> Patroli 7 Hari</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={patroliWeekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="selesai" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} name="Selesai" />
              <Line type="monotone" dataKey="berlangsung" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} name="Belum Selesai" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-1-2">
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-users-cog" /> Distribusi Peran</h3>
          {rolePieData.length === 0 ? <p className="muted" style={{ textAlign: "center", padding: 40 }}>Belum ada data</p> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={rolePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {rolePieData.map((_: any, idx: number) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="section-card">
          <h3 style={{ marginBottom: 12 }}><i className="fas fa-trophy" /> Top Performers</h3>
          <table>
            <thead><tr><th>Rank</th><th>Nama</th><th>NRP</th><th>Peran</th><th>Shift</th><th>Skor</th></tr></thead>
            <tbody>
              {topPerformers.map((u: any, i: number) => (
                <tr key={u.id}>
                  <td><span className={`badge badge-${i === 0 ? "warning" : i < 3 ? "info" : "default"}`}>#{i + 1}</span></td>
                  <td className="user-cell"><img className="avatar avatar-sm" src={avatarUrl(u.foto_url)} alt="" /><span title={u.nama}>{u.nama}</span></td>
                  <td><code>{u.nrp}</code></td>
                  <td><span className="badge badge-default">{ROLE_LABEL[u.role] || u.role}</span></td>
                  <td>{u.shift || "-"}</td>
                  <td><span className="badge badge-success">{u.skor ?? 0}</span></td>
                </tr>
              ))}
              {topPerformers.length === 0 && <tr><td colSpan={6} className="empty-row">Belum ada data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
