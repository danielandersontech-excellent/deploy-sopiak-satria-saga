"use client";
import React, { useState, useEffect } from "react";
import { authApi, lokasiApi, reportExportsApi } from "@/lib/api";
import {
  exportToExcel,
  exportAbsensiPDF,
  exportLaporanPDF,
  exportPatroliPDF,
  fetchAbsensiForExport,
  fetchLaporanForExport,
  fetchPatroliForExport,
} from "@/lib/reportExport";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";

/**
 * TAHAP 7 BUG #2:
 *   Excel exports no longer use the `xlsx` package on the client.
 *   `exportToExcel` now hits the existing backend /api/export/{type}
 *   endpoint and streams the .xlsx file to the user's downloads.
 *   PDF exports remain client-side via jsPDF.
 */
export default function ExportPage() {
  const { toast } = useToast();
  const { t } = useSettings();
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [loading, setLoading] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [filterLokasi, setFilterLokasi] = useState("");
  const loadHistory = async () => {
    try {
      const d = await reportExportsApi.list();
      setHistory(Array.isArray(d) ? d : []);
    } catch {}
  };
  useEffect(() => {
    loadHistory();
    lokasiApi
      .list("status=active")
      .then((d) => setLokasi(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  const handle = async (type: "absensi" | "laporan" | "patroli", format: "pdf" | "excel") => {
    setLoading(`${type}-${format}`);
    try {
      const uid = authApi.getUserId();
      if (format === "excel") {
        // BUG #2: server-side export. The browser receives a ready .xlsx
        // blob; no spreadsheet library on the client.
        await exportToExcel(
          type,
          startDate,
          endDate,
          filterLokasi || undefined,
          `${type === "absensi" ? "Absensi" : type === "laporan" ? "Laporan" : "Patroli"}_${startDate}_${endDate}.xlsx`,
        );
      } else {
        // PDF path unchanged — uses jsPDF in the browser.
        if (type === "absensi") {
          const d = await fetchAbsensiForExport(startDate, endDate, filterLokasi || undefined);
          exportAbsensiPDF(d, `${startDate} - ${endDate}`);
        } else if (type === "laporan") {
          const { harian, kejadian } = await fetchLaporanForExport(startDate, endDate);
          exportLaporanPDF(harian, kejadian, `${startDate} - ${endDate}`);
        } else if (type === "patroli") {
          const d = await fetchPatroliForExport(startDate, endDate);
          exportPatroliPDF(d, `${startDate} - ${endDate}`);
        }
      }
      try {
        await reportExportsApi.create({
          tipe: type,
          lokasi_id: filterLokasi || null,
          periode_start: startDate,
          periode_end: endDate,
          file_url: `${type}_${startDate}_${endDate}.${format}`,
          generated_by: uid,
        });
      } catch {
        // history logging is best-effort; don't block on it
      }
      toast(`Export ${type} (${format.toUpperCase()}) berhasil! 📥`);
      loadHistory();
    } catch (err: any) {
      toast(`Error: ${err.message}`, "error");
    } finally {
      // BUG #4: always clear loading, even if an error escapes the try block.
      setLoading("");
    }
  };
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-download" />
          {t("export_laporan")}
        </h1>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <label className="form-label" style={{ margin: 0 }}>
            {t("periode")}:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="form-input"
            style={{ width: "auto" }}
          />
          <span>s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="form-input"
            style={{ width: "auto" }}
          />
          <select
            className="form-select"
            style={{ width: "auto", minWidth: 180 }}
            value={filterLokasi}
            onChange={(e) => setFilterLokasi(e.target.value)}
          >
            <option value="">{t("semua_lokasi")}</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="export-grid">
          {([
            { type: "absensi" as const, icon: "📋", label: t("absensi") },
            { type: "laporan" as const, icon: "📝", label: t("lap_harian") },
            { type: "patroli" as const, icon: "🚶", label: t("patroli") },
          ]).map((e) => (
            <div key={e.type} className="export-card">
              <h4>
                {e.icon} {e.label}
              </h4>
              <div className="export-btns">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handle(e.type, "pdf")}
                  disabled={!!loading}
                >
                  📄 PDF
                </button>
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handle(e.type, "excel")}
                  disabled={!!loading}
                >
                  📊 Excel
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}