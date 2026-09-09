"use client";
import React, { useState, useEffect, useCallback } from "react";
import { authApi, getUser, lokasiApi, reportExportsApi } from "@/lib/api";
import {
  exportToExcel,
  exportAbsensiPDF,
  exportLaporanPDF,
  exportPatroliPDF,
  fetchAbsensiForExport,
  fetchLaporanForExport,
  fetchPatroliForExport,
} from "@/lib/reportExport";
import { fmtDate, fmtDateTime, toYMD } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";

/**
 * EXPORT LAPORAN
 * [Audit 2B]
 *  - Riwayat export dimuat tapi tidak pernah ditampilkan → kini tabel riwayat.
 *  - tipe 'laporan' ditolak CHECK constraint report_exports (riwayat laporan
 *    tidak pernah tercatat) → dipetakan ke 'laporan_harian'.
 *  - Validasi rentang tanggal (≤ 366 hari, end ≥ start) sebelum request.
 *  - Tanggal default memakai zona lokal (bukan toISOString/UTC).
 */
const TIPE_DB: Record<string, string> = { absensi: "absensi", laporan: "laporan_harian", patroli: "patroli" };

export default function ExportPage() {
  const { toast } = useToast();
  const { t } = useSettings();
  const user = getUser();
  const [startDate, setStartDate] = useState(toYMD(new Date(Date.now() - 7 * 86400000)));
  const [endDate, setEndDate] = useState(toYMD(new Date()));
  const [loading, setLoading] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      const d = await reportExportsApi.list("limit=30");
      setHistory(Array.isArray(d) ? d : []);
    } catch { /* riwayat opsional */ }
  }, []);
  useEffect(() => {
    loadHistory();
    lokasiApi.list("status=active").then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
  }, [loadHistory]);

  const rentangValid = (() => {
    const s = Date.parse(startDate), e = Date.parse(endDate);
    if (isNaN(s) || isNaN(e)) return "Tanggal tidak valid";
    if (e < s) return "Tanggal akhir tidak boleh sebelum tanggal awal";
    if ((e - s) / 86400000 > 366) return "Rentang maksimal 366 hari";
    return "";
  })();

  const handle = async (type: "absensi" | "laporan" | "patroli", format: "pdf" | "excel") => {
    if (loading) return;
    if (rentangValid) return toast(rentangValid, "warning");
    setLoading(`${type}-${format}`);
    try {
      const uid = authApi.getUserId();
      const periode = `${startDate} - ${endDate}`;
      if (format === "excel") {
        await exportToExcel(type, startDate, endDate, filterLokasi || undefined,
          `${type === "absensi" ? "Absensi" : type === "laporan" ? "Laporan" : "Patroli"}_${startDate}_${endDate}.xlsx`);
      } else if (type === "absensi") {
        const d = await fetchAbsensiForExport(startDate, endDate, filterLokasi || undefined);
        if (!d.length) { toast("Tidak ada data absensi pada periode ini", "warning"); return; }
        exportAbsensiPDF(d, periode);
      } else if (type === "laporan") {
        const { harian, kejadian } = await fetchLaporanForExport(startDate, endDate, filterLokasi || undefined);
        if (!harian.length && !kejadian.length) { toast("Tidak ada laporan pada periode ini", "warning"); return; }
        exportLaporanPDF(harian, kejadian, periode);
      } else {
        const d = await fetchPatroliForExport(startDate, endDate, filterLokasi || undefined);
        if (!d.length) { toast("Tidak ada patroli pada periode ini", "warning"); return; }
        exportPatroliPDF(d, periode);
      }
      try {
        await reportExportsApi.create({
          tipe: TIPE_DB[type],
          lokasi_id: filterLokasi || null,
          periode_start: startDate,
          periode_end: endDate,
          file_url: `${type}_${startDate}_${endDate}.${format === "excel" ? "xlsx" : "pdf"}`,
          generated_by: user?.role === "klien" ? null : uid,
        });
      } catch { /* riwayat bersifat best-effort */ }
      toast(`Export ${type} (${format.toUpperCase()}) berhasil 📥`);
      loadHistory();
    } catch (err: any) {
      toast(`Gagal export: ${err.message}`, "error");
    } finally {
      setLoading("");
    }
  };

  const cards = [
    { type: "absensi" as const, icon: "📋", label: t("absensi"), desc: "Masuk/keluar, status, radius, koordinat" },
    { type: "laporan" as const, icon: "📝", label: `${t("lap_harian")} & ${t("lap_kejadian")}`, desc: "Dua sheet: harian & kejadian" },
    { type: "patroli" as const, icon: "🚶", label: t("patroli"), desc: "Rute, waktu, checkpoint terpindai" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-download" /> {t("export_laporan")}</h1>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <label className="form-label" style={{ margin: 0 }}>{t("periode")}:</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input" style={{ width: "auto" }} />
          <span>s/d</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input" style={{ width: "auto" }} />
          {lokasi.length > 1 && (
            <select className="form-select" style={{ width: "auto", minWidth: 180 }} value={filterLokasi} onChange={(e) => setFilterLokasi(e.target.value)}>
              <option value="">{t("semua_lokasi")}</option>
              {lokasi.map((l) => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
          )}
          <div className="form-chip-row">
            {[{ l: "7 hari", d: 7 }, { l: "30 hari", d: 30 }, { l: "Bulan ini", d: 0 }].map((p) => (
              <button key={p.l} className="form-chip" onClick={() => {
                const now = new Date();
                if (p.d === 0) { setStartDate(toYMD(new Date(now.getFullYear(), now.getMonth(), 1))); setEndDate(toYMD(now)); }
                else { setStartDate(toYMD(new Date(Date.now() - p.d * 86400000))); setEndDate(toYMD(now)); }
              }}>{p.l}</button>
            ))}
          </div>
        </div>
        {rentangValid && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10 }}><i className="fas fa-exclamation-circle" /> {rentangValid}</div>}
        <div className="export-grid">
          {cards.map((e) => (
            <div key={e.type} className="export-card">
              <h4>{e.icon} {e.label}</h4>
              <p className="muted" style={{ marginBottom: 12 }}>{e.desc}</p>
              <div className="export-btns">
                <button className="btn btn-danger btn-sm" onClick={() => handle(e.type, "pdf")} disabled={!!loading || !!rentangValid}>
                  <i className={`fas ${loading === `${e.type}-pdf` ? "fa-spinner fa-spin" : "fa-file-pdf"}`} /> PDF
                </button>
                <button className="btn btn-success btn-sm" onClick={() => handle(e.type, "excel")} disabled={!!loading || !!rentangValid}>
                  <i className={`fas ${loading === `${e.type}-excel` ? "fa-spinner fa-spin" : "fa-file-excel"}`} /> Excel
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
          <i className="fas fa-info-circle" /> Excel dibuat di server (lengkap, semua kolom). PDF dibuat di browser dari data periode yang dipilih (maks 5.000 baris per jenis).
        </p>
      </div>

      <div className="section-card">
        <div className="section-header">
          <h3>🕘 {t("riwayat_export")}</h3>
          <button className="btn btn-outline btn-sm" onClick={loadHistory}><i className="fas fa-sync-alt" /></button>
        </div>
        <table>
          <thead>
            <tr><th>Waktu</th><th>Jenis</th><th>Periode</th><th>Lokasi</th><th>File</th></tr>
          </thead>
          <tbody>
            {history.map((h: any) => (
              <tr key={h.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(h.created_at)}</td>
                <td><span className="badge badge-info">{h.tipe}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(h.periode_start)} – {fmtDate(h.periode_end)}</td>
                <td className="cell-ellipsis-sm" title={lokasi.find((l) => l.id === h.lokasi_id)?.nama || "Semua"}>{lokasi.find((l) => l.id === h.lokasi_id)?.nama || "Semua"}</td>
                <td className="cell-ellipsis" title={h.file_url || "-"}><code style={{ fontSize: 11 }}>{h.file_url || "-"}</code></td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={5} className="empty-row">Belum ada riwayat export</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
