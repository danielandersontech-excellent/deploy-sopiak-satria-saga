"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

export type Lang = "id" | "en";

interface AppSettingsContextType {
  isDark: boolean;
  toggleDark: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

export const AppSettingsCtx = createContext<AppSettingsContextType>({
  isDark: true,
  toggleDark: () => {},
  lang: "id",
  setLang: () => {},
  t: (k) => k,
});

export function useSettings() {
  return useContext(AppSettingsCtx);
}

const i18n: Record<Lang, Record<string, string>> = {
  id: {
    dashboard: "Dashboard", lokasi: "Lokasi", klien_mgmt: "Klien", personil: "Personil",
    absensi: "Absensi", patroli: "Patroli", lap_harian: "Lap. Harian", lap_kejadian: "Lap. Kejadian",
    serah_terima: "Serah Terima", checkpoint: "Checkpoint", rute_patroli: "Rute Patroli",
    pos_jaga: "Pos Jaga", jadwal_shift: "Jadwal Shift", penugasan_shift: "Penugasan Shift",
    broadcast: "Broadcast", panic_alert: "Panic Alert", export: "Export",
    utama: "Utama", operasional: "Operasional", konfigurasi: "Konfigurasi", lainnya: "Lainnya",
    logout: "Logout", masuk: "Masuk", tambah: "Tambah", edit: "Edit", hapus: "Hapus",
    simpan: "Simpan", batal: "Batal", semua: "Semua", cari: "Cari nama / NRP...",
    total_personil: "Total Personil", sedang_bertugas: "Sedang Bertugas",
    absensi_hari_ini: "Absensi Hari Ini", laporan_pending: "Laporan Pending",
    panic_aktif: "Panic Aktif", lokasi_klien: "Lokasi Klien",
    aktivitas_terbaru: "Aktivitas Terbaru", absensi_7hari: "Absensi 7 Hari Terakhir",
    semua_lokasi: "Semua Lokasi", filter_lokasi: "Filter Lokasi", periode: "Periode",
    export_laporan: "Export Laporan", riwayat_export: "Riwayat Export",
    dark_mode: "Mode Gelap", light_mode: "Mode Terang", bahasa: "Bahasa",
    backup: "Backup DB", backup_restore: "Backup & Restore", buat_backup: "Buat Backup",
    restore_db: "Restore Database", upload_gdrive: "Upload ke Google Drive",
    backup_berhasil: "Backup berhasil!", restore_berhasil: "Restore berhasil!",
    jadwal_backup: "Jadwal Backup Otomatis", riwayat_backup: "Riwayat Backup",
  },
  en: {
    dashboard: "Dashboard", lokasi: "Locations", klien_mgmt: "Clients", personil: "Personnel",
    absensi: "Attendance", patroli: "Patrol", lap_harian: "Daily Reports", lap_kejadian: "Incident Reports",
    serah_terima: "Shift Handover", checkpoint: "Checkpoint", rute_patroli: "Patrol Routes",
    pos_jaga: "Guard Posts", jadwal_shift: "Shift Schedule", penugasan_shift: "Shift Assignment",
    broadcast: "Broadcast", panic_alert: "Panic Alert", export: "Export",
    utama: "Main", operasional: "Operational", konfigurasi: "Configuration", lainnya: "Others",
    logout: "Logout", masuk: "Sign In", tambah: "Add", edit: "Edit", hapus: "Delete",
    simpan: "Save", batal: "Cancel", semua: "All", cari: "Search name / ID...",
    total_personil: "Total Personnel", sedang_bertugas: "On Duty",
    absensi_hari_ini: "Attendance Today", laporan_pending: "Pending Reports",
    panic_aktif: "Active Panic", lokasi_klien: "Client Locations",
    aktivitas_terbaru: "Recent Activity", absensi_7hari: "Attendance Last 7 Days",
    semua_lokasi: "All Locations", filter_lokasi: "Filter Location", periode: "Period",
    export_laporan: "Export Reports", riwayat_export: "Export History",
    dark_mode: "Dark Mode", light_mode: "Light Mode", bahasa: "Language",
    backup: "Backup DB", backup_restore: "Backup & Restore", buat_backup: "Create Backup",
    restore_db: "Restore Database", upload_gdrive: "Upload to Google Drive",
    backup_berhasil: "Backup successful!", restore_berhasil: "Restore successful!",
    jadwal_backup: "Auto Backup Schedule", riwayat_backup: "Backup History",
  },
};

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const [lang, setLangState] = useState<Lang>("id");

  useEffect(() => {
    const saved = localStorage.getItem("ptsss_theme");
    if (saved === "light") setIsDark(false);
    const savedLang = localStorage.getItem("ptsss_lang") as Lang;
    if (savedLang) setLangState(savedLang);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("ptsss_theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggleDark = () => setIsDark((p) => !p);
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem("ptsss_lang", l); };
  const t = (key: string) => i18n[lang][key] || i18n.id[key] || key;

  return (
    <AppSettingsCtx.Provider value={{ isDark, toggleDark, lang, setLang, t }}>
      {children}
    </AppSettingsCtx.Provider>
  );
}
