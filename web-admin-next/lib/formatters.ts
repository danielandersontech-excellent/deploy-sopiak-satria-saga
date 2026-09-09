/**
 * Formatting & helper utilities
 */

export const fmtDate = (d: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

export const fmtTime = (d: string) =>
  d
    ? new Date(d).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

export const fmtDateTime = (d: string) =>
  d ? `${fmtDate(d)} ${fmtTime(d)}` : "-";

/** Tanggal panjang Indonesia: "Rabu, 9 September 2026" (judul dashboard, cetak). */
export const fmtDateLong = (d: string | Date | null | undefined) => {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export const statusColor = (s: string) =>
  ({
    hadir: "success",
    on_duty: "success",
    active: "success",
    approved: "success",
    completed: "success",
    aman: "success",
    terlambat: "warning",
    pending: "warning",
    patroli: "info",
    break: "warning",
    ada_masalah: "warning",
    perhatian_khusus: "warning",
    sedang: "warning",
    tinggi: "warning",
    revision: "warning",
    masalah: "warning",
    perhatian: "warning",
    kritis: "danger",
    urgent: "danger",
    danger: "danger",
    rejected: "danger",
    tidak_hadir: "danger",
    off_duty: "default",
    inactive: "default",
    draft: "default",
    resolved: "info",
    false_alarm: "default",
    cancelled: "default",
    rendah: "info",
    normal: "info",
    returned: "success",
    expired: "warning",
    belum_ditempatkan: "warning",
    ditempatkan: "success",
    nonaktif: "danger",
    // [Misi V3 / B2] status rekrutmen ikut satu peta warna (sebelumnya peta lokal di halaman rekrutmen)
    baru: "warning",
    diproses: "info",
    wawancara: "purple",
    diterima: "success",
    ditolak: "danger",
    dibatalkan: "default",
    // status klien
    Aktif: "success",
    "Non-Aktif": "default",
    Blacklist: "danger",
  })[s] || "default";

/**
 * [Misi V3 / B2] Warna & label peran — SATU pemetaan untuk tabel, kartu, modal,
 * TopBar (sebelumnya tiga pemetaan berbeda di halaman Personil).
 */
export const roleColor = (role: string | null | undefined): string =>
  ({ admin: "danger", supervisor: "purple", komandan: "info", anggota: "default", klien: "warning" })[role || ""] || "default";

export const roleLabel = (role: string | null | undefined): string =>
  ({ admin: "Admin", supervisor: "Supervisor", komandan: "Komandan", anggota: "Anggota", klien: "Klien" })[role || ""] || (role ? String(role) : "-");

/** Sisa hari sampai tanggal (negatif = sudah lewat); null bila tanggal kosong/invalid. */
export const daysUntil = (d: string | null | undefined): number | null => {
  if (!d) return null;
  const dt = new Date(typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d);
  if (isNaN(dt.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((dt.getTime() - today.getTime()) / 86400000);
};

/** Umur data dalam hari sejak tanggal pembuatan (0 = hari ini). */
export const ageDays = (d: string | null | undefined): number | null => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
};

/** Format Rupiah konsisten: Rp 1.250.000 */
export const fmtRupiah = (n: number | string | null | undefined): string => {
  const v = Number(n);
  if (n === null || n === undefined || n === "" || isNaN(v)) return "-";
  return "Rp " + Math.round(v).toLocaleString("id-ID");
};

export const avatarUrl = (url: string | null) =>
  url && url.startsWith("http")
    ? url
    : "https://ui-avatars.com/api/?name=U&background=e2e8f0&color=64748b&size=80";

/**
 * [Audit 2B] Escape untuk string apa pun yang dirender sebagai HTML mentah
 * (mis. jendela cetak QR via document.write). Wajib dipakai sesuai CLAUDE.md —
 * sebelumnya nama checkpoint/area disisipkan mentah (stored XSS).
 */
export const escapeHtml = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Tanggal → 'YYYY-MM-DD' zona waktu lokal (untuk filter & input type=date). */
export const toYMD = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

/** Label status Bahasa Indonesia yang rapi untuk badge. */
export const statusLabel = (s: string | null | undefined): string =>
  ({
    pending: "Menunggu", approved: "Disetujui", revision: "Revisi", rejected: "Ditolak", draft: "Draf",
    active: "Aktif", inactive: "Nonaktif", resolved: "Selesai", false_alarm: "Alarm Palsu",
    completed: "Selesai", incomplete: "Tidak Lengkap", cancelled: "Dibatalkan",
    hadir: "Hadir", terlambat: "Terlambat", tidak_hadir: "Tidak Hadir", libur: "Libur",
    on_duty: "Bertugas", off_duty: "Tidak Bertugas", patroli: "Patroli", break: "Istirahat",
    aman: "Aman", ada_masalah: "Ada Masalah", perhatian_khusus: "Perhatian Khusus",
    masalah: "Masalah", perhatian: "Perhatian",
    rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi", kritis: "Kritis",
    normal: "Normal", urgent: "Mendesak",
    belum_ditempatkan: "Belum Ditempatkan", ditempatkan: "Ditempatkan", nonaktif: "Nonaktif",
    expired: "Kedaluwarsa", returned: "Kembali",
    baru: "Baru", diproses: "Diproses", wawancara: "Wawancara", diterima: "Diterima", ditolak: "Ditolak", dibatalkan: "Dibatalkan",
    masuk: "Masuk", keluar: "Keluar",
  })[s || ""] || (s ? String(s).replace(/_/g, " ") : "-");
