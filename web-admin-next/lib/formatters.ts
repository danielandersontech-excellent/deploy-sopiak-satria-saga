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
  })[s] || "default";

export const avatarUrl = (url: string | null) =>
  url && url.startsWith("http")
    ? url
    : "https://ui-avatars.com/api/?name=U&background=e2e8f0&color=64748b&size=80";
