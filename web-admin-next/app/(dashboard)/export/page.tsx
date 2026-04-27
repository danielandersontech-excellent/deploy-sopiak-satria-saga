"use client";
import React, { useState, useEffect } from "react";
import { authApi, getUser, lokasiApi, reportExportsApi } from "@/lib/api";
import { exportToExcel, exportAbsensiPDF, exportLaporanPDF, exportPatroliPDF, fetchAbsensiForExport, fetchLaporanForExport, fetchPatroliForExport } from "@/lib/reportExport";
import { useToast } from "@/hooks/useToast";
import { useSettings } from "@/hooks/useSettings";

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
  const handle = async (type: string, format: string) => {
    setLoading(`${type}-${format}`);
    try {
      const uid = authApi.getUserId();
      if (type === "absensi") {
        const d = await fetchAbsensiForExport(
          startDate,
          endDate,
          filterLokasi || undefined,
        );
        if (format === "pdf") exportAbsensiPDF(d, `${startDate} - ${endDate}`);
        else
          exportToExcel(
            d.map((r: any) => ({
              Nama: r.users?.nama || r.nama,
              NRP: r.users?.nrp || r.nrp,
              Tipe: r.tipe,
              Waktu: r.waktu,
              Status: r.status,
              Pos_Jaga: r.pos_jaga,
              Alamat: r.alamat,
            })),
            `Absensi_${startDate}`,
          );
      }
      if (type === "laporan") {
        const { harian, kejadian } = await fetchLaporanForExport(
          startDate,
          endDate,
        );
        if (format === "pdf")
          exportLaporanPDF(harian, kejadian, `${startDate} - ${endDate}`);
        else
          exportToExcel(
            [
              ...harian.map((h: any) => ({
                Tipe: "Harian",
                Pelapor: h.users?.nama,
                Kondisi: h.kondisi,
                Status: h.status,
                Tanggal: h.tanggal,
              })),
              ...kejadian.map((k: any) => ({
                Tipe: "Kejadian",
                Pelapor: k.users?.nama,
                Jenis: k.jenis,
                Prioritas: k.prioritas,
                Status: k.status,
              })),
            ],
            `Laporan_${startDate}`,
          );
      }
      if (type === "patroli") {
        const d = await fetchPatroliForExport(startDate, endDate);
        if (format === "pdf") exportPatroliPDF(d, `${startDate} - ${endDate}`);
        else
          exportToExcel(
            d.map((r: any) => ({
              Petugas: r.users?.nama,
              NRP: r.users?.nrp,
              Rute: r.route_name,
              Status: r.status,
              Checkpoint: `${r.checkpoint_scanned || 0}/${r.checkpoint_total || 0}`,
              Mulai: r.start_time,
            })),
            `Patroli_${startDate}`,
          );
      }
      await reportExportsApi.create({
        tipe: type,
        lokasi_id: filterLokasi || null,
        periode_start: startDate,
        periode_end: endDate,
        file_url: `${type}_${startDate}_${endDate}.${format}`,
        generated_by: uid,
      });
      toast(`Export ${type} (${format.toUpperCase()}) berhasil! 📥`);
      loadHistory();
    } catch (err: any) {
      toast(`Error: ${err.message}`, "error");
    }
    setLoading("");
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
          {[
            { type: "absensi", icon: "📋", label: t("absensi") },
            { type: "laporan", icon: "📝", label: t("lap_harian") },
            { type: "patroli", icon: "🚶", label: t("patroli") },
          ].map((e) => (
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

