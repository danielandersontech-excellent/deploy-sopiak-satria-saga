/**
 * [Misi V3 / E] Satu sumber judul halaman — dipakai TopBar (breadcrumb) dan
 * layout dashboard (judul tab browser `document.title`), sebelumnya semua tab
 * berjudul "PT Sopiak Satria Saga" sehingga sulit dibedakan saat banyak tab.
 */
export const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/lokasi": "Lokasi",
  "/personil": "Personil",
  "/rekrutmen": "Rekrutmen",
  "/absensi": "Absensi",
  "/patroli": "Patroli",
  "/laporan-harian": "Laporan Harian",
  "/laporan-kejadian": "Laporan Kejadian",
  "/serah-terima": "Serah Terima",
  "/checkpoint": "Checkpoint",
  "/routes": "Rute Patroli",
  "/pos-jaga": "Pos Jaga",
  "/jadwal": "Jadwal Shift",
  "/shift-assignment": "Penugasan Shift",
  "/broadcast": "Broadcast",
  "/panic": "Panic Alert",
  "/clients": "Klien",
  "/export": "Export",
  "/live-map": "Live Map",
  "/geofence": "Geofence",
  "/backup": "Backup",
  "/analytics": "Analytics",
  "/qr-generator": "QR Generator",
  "/unauthorized": "Akses Ditolak",
  "/login": "Masuk",
};

export const APP_NAME = "PT Sopiak Satria Saga";

export function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] || "Dashboard";
}

/** Judul tab: "Laporan Harian · PT Sopiak Satria Saga" */
export function documentTitle(pathname: string): string {
  return `${pageTitle(pathname)} · ${APP_NAME}`;
}
