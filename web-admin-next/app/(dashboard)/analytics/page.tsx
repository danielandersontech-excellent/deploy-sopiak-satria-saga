"use client";
import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { usersApi, absensiApi, patroliApi, laporanHarianApi, laporanKejadianApi, dashboardApi } from "@/lib/api";
import { avatarUrl } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#10B981", "#F59E0B", "#EF4444", "#1A56DB", "#8B5CF6", "#0EA5E9"];

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const { t } = useSettings();
  const [stats, setStats] = useState<any>(null);
  const [absensiData, setAbsensiData] = useState<any[]>([]);
  const [laporanH, setLaporanH] = useState<any[]>([]);
  const [laporanK, setLaporanK] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [patroliData, setPatroliData] = useState<any[]>([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      try { const s = await dashboardApi.stats(); setStats(s); } catch {}
      try { setAbsensiData(await absensiApi.list()); } catch {}
      try { setLaporanH(await laporanHarianApi.list()); } catch {}
      try { setLaporanK(await laporanKejadianApi.list()); } catch {}
      // BUG #5 (P2-4): /api/users now paginates by default. Analytics
      // needs every user to aggregate over — opt in to the legacy
      // unbounded list via ?all=true.
      try { setUsers(await usersApi.list("all=true")); } catch {}
      try { setPatroliData(await patroliApi.list()); } catch {}
    } finally {
      // BUG #4 (P2-2): finally so loading clears even if something
      // unexpected bubbles up.
      setLoading(false);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const totalPersonil = users.length;
  const absensiMasuk = absensiData.filter((a: any) => a.tipe === "masuk");
  const hadir = absensiMasuk.filter((a: any) => a.status === "hadir").length;
  const terlambat = absensiMasuk.filter((a: any) => a.status === "terlambat").length;
  const tidakHadir = absensiMasuk.filter((a: any) => a.status === "tidak_hadir").length;
  const kehadiranPct = absensiMasuk.length > 0 ? Math.round(((hadir + terlambat) / absensiMasuk.length) * 100) : 0;
  const lhApproved = laporanH.filter((l: any) => l.status === "approved").length;
  const lhPending = laporanH.filter((l: any) => l.status === "pending").length;
  const lhRevision = laporanH.filter((l: any) => l.status === "revision").length;
  const lkOpen = laporanK.filter((l: any) => l.status !== "approved").length;
  const lkResolved = laporanK.filter((l: any) => l.status === "approved").length;
  const lkKritis = laporanK.filter((l: any) => l.prioritas === "kritis").length;
  const patroliCompleted = patroliData.filter((p: any) => p.status === "completed").length;
  const topPerformers = [...users].filter((u: any) => u.role === "anggota" || u.role === "komandan").sort((a: any, b: any) => (b.skor || 0) - (a.skor || 0)).slice(0, 10);

  // Donut chart data - absensi status
  const absensiPieData = useMemo(() => [
    { name: "Hadir", value: hadir },
    { name: "Terlambat", value: terlambat },
    { name: "Tidak Hadir", value: tidakHadir },
  ].filter(d => d.value > 0), [hadir, terlambat, tidakHadir]);

  // Bar chart - laporan status
  const laporanBarData = useMemo(() => [
    { name: "Harian", approved: lhApproved, pending: lhPending, revision: lhRevision },
    { name: "Kejadian", approved: lkResolved, pending: lkOpen, revision: lkKritis },
  ], [lhApproved, lhPending, lhRevision, lkResolved, lkOpen, lkKritis]);

  // Area chart - absensi 7 hari terakhir
  const weeklyData = useMemo(() => {
    const days: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayAbs = absensiData.filter((a: any) => a.waktu?.startsWith(dateStr) && a.tipe === "masuk");
      days.push({
        day: d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit" }),
        hadir: dayAbs.filter((a: any) => a.status === "hadir").length,
        terlambat: dayAbs.filter((a: any) => a.status === "terlambat").length,
      });
    }
    return days;
  }, [absensiData]);

  // Line chart - patroli 7 hari
  const patroliWeekly = useMemo(() => {
    const days: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayP = patroliData.filter((p: any) => p.start_time?.startsWith(dateStr));
      days.push({
        day: d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit" }),
        selesai: dayP.filter((p: any) => p.status === "completed").length,
        berlangsung: dayP.filter((p: any) => p.status !== "completed").length,
      });
    }
    return days;
  }, [patroliData]);

  // Role distribution pie
  const rolePieData = useMemo(() => {
    const counts: any = {};
    users.forEach((u: any) => { counts[u.role] = (counts[u.role] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [users]);

  const tooltipStyle = { contentStyle: { background: "#1E293B", border: "1px solid #334155", borderRadius: 8, color: "#F1F5F9", fontSize: 12 } };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-chart-bar" /> Analytics</h1>
        <button className="btn btn-outline btn-sm" onClick={loadAll} disabled={loading}><i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Personil", value: totalPersonil, icon: "fa-users", color: "#1A56DB" },
          { label: "Kehadiran", value: `${kehadiranPct}%`, icon: "fa-check-circle", color: "#10B981" },
          { label: "Total Insiden", value: laporanK.length, icon: "fa-exclamation-triangle", color: "#F59E0B" },
          { label: "Patroli Selesai", value: patroliCompleted, icon: "fa-route", color: "#1A56DB" },
          { label: "Laporan Pending", value: lhPending, icon: "fa-clock", color: "#F59E0B" },
          { label: "Insiden Kritis", value: lkKritis, icon: "fa-fire", color: "#EF4444" },
        ].map((kpi, i) => (
          <div key={i} className="section-card" style={{ textAlign: "center", padding: 16 }}>
            <i className={`fas ${kpi.icon}`} style={{ fontSize: 24, color: kpi.color, marginBottom: 8 }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 - Area + Donut */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
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
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-chart-pie" /> Status Absensi</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={absensiPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {absensiPieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 - Bar + Line */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-chart-bar" /> Status Laporan</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={laporanBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend />
              <Bar dataKey="approved" fill="#10B981" name="Disetujui" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pending" fill="#F59E0B" name="Pending" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revision" fill="#EF4444" name="Revisi/Kritis" radius={[4, 4, 0, 0]} />
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
              <Line type="monotone" dataKey="berlangsung" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} name="Berlangsung" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 3 - Role Pie */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 16 }}>
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}><i className="fas fa-users-cog" /> Distribusi Role</h3>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={rolePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {rolePieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Performers */}
        <div className="section-card">
          <h3 style={{ marginBottom: 12 }}><i className="fas fa-trophy" /> Top Performers</h3>
          <table>
            <thead><tr><th>Rank</th><th>Nama</th><th>Role</th><th>Shift</th><th>Skor</th></tr></thead>
            <tbody>
              {topPerformers.map((u: any, i) => (
                <tr key={u.id}>
                  <td><span className={`badge badge-${i === 0 ? "warning" : i < 3 ? "info" : "default"}`}>#{i + 1}</span></td>
                  <td className="user-cell"><img className="avatar avatar-sm" src={avatarUrl(u.foto_url)} alt="avatar" /><span title={u.nama}>{u.nama}</span></td>
                  <td><span className="badge badge-default">{u.role}</span></td>
                  <td>{u.shift || "-"}</td>
                  <td><span className="badge badge-success">{u.skor || 0}</span></td>
                </tr>
              ))}
              {topPerformers.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>Belum ada data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}