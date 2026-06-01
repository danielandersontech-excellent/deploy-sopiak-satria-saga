"use client";
import React, { useState, useEffect, useCallback } from "react";
import { absensiApi, dashboardApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtTime, statusColor, avatarUrl } from "@/lib/formatters";
import { useSettings } from "@/hooks/useSettings";

export default function DashboardPage() {
  const [s, setS] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [act, setAct] = useState<any[]>([]);
  const [weekly, setWeekly] = useState<any[]>([]);
  const { t } = useSettings();
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const stats = await dashboardApi.stats();
        setS(stats);
        const absData = await absensiApi.today();
        setAct(Array.isArray(absData) ? absData.slice(0, 8) : []);
      } catch {}
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split("T")[0]);
      }
      try {
        const weekData = await Promise.all(
          days.map(async (day) => {
            const d = await absensiApi.byDate(day);
            return {
              day: new Date(day).toLocaleDateString("id-ID", {
                weekday: "short",
                day: "2-digit",
              }),
              count: Array.isArray(d) ? d.length : 0,
            };
          }),
        );
        setWeekly(weekData);
      } catch {}
    } finally {
      // BUG #4 (P2-2): finally guarantees loading clears on any error.
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadDashboard();
    const unsub = onRealtimeEvent((ev) => {
      if (
        [
          "absensi:new",
          "patroli:update",
          "laporan:new",
          "panic:alert",
          "panic:resolved",
          "stats:update",
          "user:status",
        ].includes(ev)
      )
        loadDashboard();
    });
    return unsub;
  }, []);
  const maxW = Math.max(...weekly.map((w) => w.count), 1);
  const kpis = [
    {
      label: t("total_personil"),
      value: s.total_personil || s.total || 0,
      icon: "fa-users",
      color: "blue",
    },
    {
      label: t("sedang_bertugas"),
      value: s.on_duty || s.onDuty || 0,
      icon: "fa-user-check",
      color: "green",
    },
    {
      label: t("absensi_hari_ini"),
      value: s.absensi_today || s.absToday || 0,
      icon: "fa-fingerprint",
      color: "purple",
    },
    {
      label: t("laporan_pending"),
      value: s.pending_reports || s.pending || 0,
      icon: "fa-file-alt",
      color: "orange",
    },
    {
      label: t("panic_aktif"),
      value: s.active_panic || s.panic || 0,
      icon: "fa-bell",
      color: "red",
    },
    {
      label: t("lokasi_klien"),
      value: s.total_lokasi || s.lokasi || 0,
      icon: "fa-building",
      color: "blue",
    },
  ];
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-th-large" />
          {t("dashboard")}
        </h1>
        <span className="muted">
          {new Date().toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <div key={i} className={`kpi-card ${k.color}`}>
            <div className="kpi-icon">
              <i className={`fas ${k.icon}`} />
            </div>
            <div>
              <div className="kpi-val">{k.value}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="section-card">
          <h3 style={{ marginBottom: 12 }}>📊 {t("absensi_7hari")}</h3>
          <div className="bar-chart">
            {weekly.map((w, i) => (
              <div key={i} className="bar-col">
                <div className="bar-val">{w.count}</div>
                <div
                  className="bar-fill"
                  style={{
                    height: `${(w.count / maxW) * 140}px`,
                    background: "var(--primary)",
                  }}
                />
                <div className="bar-label">{w.day}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="section-card">
          <h3 style={{ marginBottom: 12 }}>📋 {t("aktivitas_terbaru")}</h3>
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
                    <img
                      className="avatar avatar-sm"
                      src={avatarUrl(a.users?.foto_url || a.foto_url)}
                     alt="avatar" />
                    <span>{a.users?.nama || a.nama || "-"}</span>
                  </td>
                  <td>
                    <span
                      className={`badge badge-${a.tipe === "masuk" ? "success" : "info"}`}
                    >
                      {a.tipe}
                    </span>
                  </td>
                  <td>{fmtTime(a.waktu)}</td>
                  <td>
                    <span className={`badge badge-${statusColor(a.status)}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}