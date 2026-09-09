"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getUser, setUser, panicApi, authApi, notifApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/useToast";
import { Modal } from "@/components/ui/Modal";
import { roleColor } from "@/lib/formatters";
import { pageTitle } from "@/lib/pageTitles";

/**
 * [Audit 2B/2G] Modal Ganti PIN. Dipicu dari menu akun atau otomatis (mode wajib)
 * bila user.must_change_pin bernilai true.
 * [Misi V3 / B3] Berlaku juga untuk akun klien (backend sudah mendukung
 * change-pin klien; sebelumnya menu & mode wajib dilewati untuk klien).
 */
function GantiPinModal({ wajib, onClose }: { wajib: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = oldPin.length >= 4 && /^\d{6,20}$/.test(newPin) && newPin === confirm && newPin !== oldPin;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await authApi.changePin(oldPin, newPin);
      const u = getUser();
      if (u) setUser({ ...u, must_change_pin: false, mustChangePin: false });
      toast("PIN berhasil diubah. Gunakan PIN baru saat login berikutnya.");
      onClose();
    } catch (e: any) {
      toast(e?.message || "Gagal mengubah PIN", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={wajib ? "Wajib Ganti PIN" : "Ganti PIN"}
      onClose={() => { if (!wajib) onClose(); }}
      footer={
        <>
          {!wajib && <button className="btn btn-outline" onClick={onClose} disabled={saving}>Batal</button>}
          {wajib && (
            <button className="btn btn-outline" onClick={() => { authApi.logout(); window.location.href = "/login"; }} disabled={saving}>
              Keluar
            </button>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={!valid || saving}>
            <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-key"}`} /> {saving ? "Menyimpan..." : "Simpan PIN Baru"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {wajib && (
          <div className="confirm-danger-note warning mb-14" style={{ marginTop: 0 }}>
            <i className="fas fa-exclamation-triangle" /> Akun Anda masih memakai PIN awal. Demi keamanan, ganti PIN sebelum melanjutkan.
          </div>
        )}
        <div className="form-group">
          <label className="form-label">PIN Saat Ini</label>
          <input className="form-input" type="password" inputMode="numeric" autoComplete="current-password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">PIN Baru (6 digit angka)</label>
            <input className={`form-input ${newPin && newPin.length < 6 ? "is-invalid" : ""}`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={20} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="form-group">
            <label className="form-label">Ulangi PIN Baru</label>
            <input className={`form-input ${confirm && newPin !== confirm ? "is-invalid" : ""}`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={20} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        {newPin && newPin.length < 6 && <small className="form-error">PIN minimal 6 digit</small>}
        {confirm && newPin !== confirm && <small className="form-error">PIN baru dan ulangan tidak sama</small>}
        {newPin && oldPin && newPin === oldPin && <small className="form-error">PIN baru harus berbeda dari PIN lama</small>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}

/** Waktu relatif ringkas (Bahasa Indonesia) untuk daftar notifikasi. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60); if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

const NOTIF_ICON: Record<string, string> = {
  info: "fa-info-circle", success: "fa-check-circle", warning: "fa-exclamation-triangle", danger: "fa-exclamation-circle",
};

/** Tujuan navigasi sebuah notifikasi: data.path (backend) → fallback per entitas. */
function notifTarget(n: any): string | null {
  const d = n?.data || {};
  if (typeof d.path === "string" && d.path.startsWith("/")) {
    if (d.id && !d.path.includes("?")) return `${d.path}?focus=${encodeURIComponent(d.id)}`;
    return d.path;
  }
  const byEntity: Record<string, string> = {
    laporan_harian: "/laporan-harian", laporan_kejadian: "/laporan-kejadian", panic: "/panic",
    broadcast: "/broadcast", rekrutmen: "/rekrutmen", geofence_izin: "/geofence", geofence_violation: "/geofence",
  };
  const base = byEntity[d.entity];
  if (!base) return null;
  return d.id ? `${base}?focus=${encodeURIComponent(d.id)}` : base;
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { isDark, toggleDark, lang, setLang, t } = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [time, setTime] = useState(new Date());
  const [panicCount, setPanicCount] = useState(0);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pinModal, setPinModal] = useState<null | "wajib" | "bebas">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const user = getUser();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Paksa ganti PIN bila akun (staf maupun klien) masih memakai PIN awal.
  useEffect(() => {
    const u = getUser();
    if (u && (u.must_change_pin === true || u.mustChangePin === true)) setPinModal("wajib");
  }, []);

  const loadNotif = useCallback(async () => {
    try {
      const [pa, list] = await Promise.all([
        panicApi.list("status=active").catch(() => []),
        notifApi.list().catch(() => []),
      ]);
      setPanicCount(Array.isArray(pa) ? pa.length : 0);
      setNotifs(Array.isArray(list) ? list : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadNotif();
    const iv = setInterval(loadNotif, 60000);
    const unsub = onRealtimeEvent((ev) => {
      if (/panic|broadcast|laporan|rekrutmen|geofence|notif/.test(ev)) loadNotif();
    });
    return () => { clearInterval(iv); unsub(); };
  }, [loadNotif]);

  const unread = useMemo(() => notifs.filter((n) => !n.dibaca).length, [notifs]);

  const openNotif = async (n: any) => {
    if (!n.dibaca) {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, dibaca: true } : x)));
      notifApi.read(n.id).catch(() => {});
    }
    const target = notifTarget(n);
    setNotifOpen(false);
    if (target) router.push(target);
  };

  const readAll = async () => {
    setNotifs((prev) => prev.map((x) => ({ ...x, dibaca: true })));
    try { await notifApi.readAll(); } catch (e: any) { toast(e?.message || "Gagal menandai notifikasi", "error"); }
  };

  if (!user) return null;

  const breadcrumb = pageTitle(pathname);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="btn-hamburger" aria-label="Menu" onClick={onMenuClick}>
          <i className="fas fa-bars" />
        </button>
        <div className="topbar-breadcrumb">
          <span className="topbar-brand">PT Sopiak Satria Saga</span>
          <i className="fas fa-chevron-right topbar-sep" />
          <span className="topbar-page">{breadcrumb}</span>
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-clock">
          <i className="fas fa-clock" />
          <span>{time.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          <span className="topbar-time">{time.toLocaleTimeString("id-ID")}</span>
        </div>

        {/* [Misi V3 / D3] Bel notifikasi: panel in-app (sebelumnya hanya tautan ke /panic). */}
        <div className="dropdown-anchor">
          <button className="btn-icon topbar-bell" title="Notifikasi" aria-label="Notifikasi" onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}>
            <i className={`fas fa-bell ${panicCount > 0 ? "text-danger" : ""}`} />
            {unread > 0 && <span className="icon-badge">{unread > 99 ? "99+" : unread}</span>}
          </button>
          {notifOpen && (
            <>
              <div className="dropdown-backdrop" onClick={() => setNotifOpen(false)} />
              <div className="dropdown-menu notif-panel">
                <div className="notif-panel-header">
                  <span><i className="fas fa-bell" /> Notifikasi {unread > 0 && <span className="badge badge-danger">{unread} baru</span>}</span>
                  <div className="btn-group">
                    {unread > 0 && <button className="btn btn-sm btn-outline" onClick={readAll}><i className="fas fa-check-double" /> Tandai semua</button>}
                    <button className="btn btn-sm btn-outline" onClick={loadNotif} title="Muat ulang"><i className="fas fa-sync-alt" /></button>
                  </div>
                </div>
                {panicCount > 0 && (
                  <button className="notif-item unread" onClick={() => { setNotifOpen(false); router.push("/panic"); }}>
                    <span className="notif-item-icon danger"><i className="fas fa-exclamation-circle" /></span>
                    <span className="notif-item-body">
                      <span className="notif-item-title">{panicCount} panic alert aktif</span>
                      <span className="notif-item-msg">Buka halaman Panic Alert untuk menindaklanjuti.</span>
                    </span>
                  </button>
                )}
                <div className="notif-list">
                  {notifs.length === 0 && <div className="notif-empty"><i className="fas fa-bell-slash" /> Belum ada notifikasi</div>}
                  {notifs.map((n) => (
                    <button key={n.id} className={`notif-item ${n.dibaca ? "" : "unread"}`} onClick={() => openNotif(n)}>
                      <span className={`notif-item-icon ${NOTIF_ICON[n.tipe] ? n.tipe : "info"}`}><i className={`fas ${NOTIF_ICON[n.tipe] || NOTIF_ICON.info}`} /></span>
                      <span className="notif-item-body">
                        <span className="notif-item-title">{n.judul}</span>
                        {n.pesan && <span className="notif-item-msg">{n.pesan}</span>}
                        <span className="notif-item-time">{relTime(n.created_at)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <button className="theme-toggle" onClick={toggleDark} title={isDark ? t("light_mode") : t("dark_mode")}>
          <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} />
        </button>
        <button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>
          <span className={lang === "id" ? "lang-active" : "lang-inactive"}>ID</span>
          <span className={lang === "en" ? "lang-active" : "lang-inactive"}>EN</span>
        </button>
        <div className="dropdown-anchor">
          <button className="topbar-user" onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }} title="Menu akun">
            <div className={`topbar-user-avatar avatar-role-${roleColor(user.role)}`}>
              {user.nama?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="topbar-user-info">
              <div className="topbar-user-name">{user.nama}</div>
              <div className="topbar-user-role">{user.nrp} · <span className="capitalize">{user.role}</span></div>
            </div>
            <i className="fas fa-chevron-down topbar-caret" />
          </button>
          {menuOpen && (
            <>
              <div className="dropdown-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="dropdown-menu">
                <button className="nav-item" onClick={() => { setMenuOpen(false); setPinModal("bebas"); }}>
                  <i className="fas fa-key" /> <span>Ganti PIN</span>
                </button>
                <button className="nav-item danger" onClick={() => { authApi.logout(); window.location.href = "/login"; }}>
                  <i className="fas fa-sign-out-alt" /> <span>{t("logout")}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {pinModal && <GantiPinModal wajib={pinModal === "wajib"} onClose={() => setPinModal(null)} />}
    </div>
  );
}
