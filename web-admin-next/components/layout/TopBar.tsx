"use client";
import React, { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getUser, setUser, panicApi, authApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { useSettings } from "@/hooks/useSettings";
import { useToast } from "@/hooks/useToast";
import { Modal } from "@/components/ui/Modal";

const BREADCRUMB_MAP: Record<string, string> = {
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
};

/**
 * [Audit 2B/2G] Modal Ganti PIN. Web-admin sebelumnya tidak punya jalur ganti
 * PIN sama sekali, padahal akun baru/reset dibuat dengan must_change_pin =
 * true. Dipicu dari avatar pengguna di TopBar atau otomatis (mode wajib) bila
 * user.must_change_pin bernilai true.
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
            <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-key"}`} /> Simpan PIN Baru
          </button>
        </>
      }
    >
      {wajib && (
        <div style={{ background: "var(--warning-light)", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12.5, color: "var(--warning)" }}>
          <i className="fas fa-exclamation-triangle" /> Akun Anda masih memakai PIN awal. Demi keamanan, ganti PIN sebelum melanjutkan.
        </div>
      )}
      <div className="form-group">
        <label className="form-label">PIN Saat Ini</label>
        <input className="form-input" type="password" inputMode="numeric" autoComplete="current-password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">PIN Baru (6 digit angka)</label>
          <input className="form-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={20} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="form-group">
          <label className="form-label">Ulangi PIN Baru</label>
          <input className="form-input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={20} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>
      {newPin && newPin.length < 6 && <small className="muted" style={{ color: "var(--danger)" }}>PIN minimal 6 digit</small>}
      {confirm && newPin !== confirm && <small className="muted" style={{ color: "var(--danger)" }}>PIN baru dan ulangan tidak sama</small>}
      {newPin && oldPin && newPin === oldPin && <small className="muted" style={{ color: "var(--danger)" }}>PIN baru harus berbeda dari PIN lama</small>}
    </Modal>
  );
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { isDark, toggleDark, lang, setLang, t } = useSettings();
  const pathname = usePathname();
  const [time, setTime] = useState(new Date());
  const [unreadCount, setUnreadCount] = useState(0);
  const [pinModal, setPinModal] = useState<null | "wajib" | "bebas">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const user = getUser();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Paksa ganti PIN bila akun masih memakai PIN awal.
  useEffect(() => {
    const u = getUser();
    if (u && u.role !== "klien" && (u.must_change_pin === true || u.mustChangePin === true)) setPinModal("wajib");
  }, []);

  const loadNotifCount = useCallback(async () => {
    try {
      const data = await panicApi.list("status=active");
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadNotifCount();
    const unsub = onRealtimeEvent((ev) => {
      if (ev.includes("panic") || ev.includes("broadcast") || ev.includes("laporan")) {
        loadNotifCount();
      }
    });
    return unsub;
  }, [loadNotifCount]);

  if (!user) return null;

  const roleColors: Record<string, string> = {
    admin: "var(--danger)",
    supervisor: "var(--purple)",
    komandan: "var(--brand-primary)",
    anggota: "var(--success)",
    klien: "var(--warning)",
  };

  const breadcrumb = BREADCRUMB_MAP[pathname] || "Dashboard";

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          className="btn-hamburger"
          aria-label="Menu"
          onClick={onMenuClick}
        >
          <i className="fas fa-bars" />
        </button>
        <div className="topbar-breadcrumb">
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>PT Sopiak Satria Saga</span>
          <i className="fas fa-chevron-right" style={{ fontSize: 8, color: "var(--text-muted)", margin: "0 8px" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{breadcrumb}</span>
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-clock">
          <i className="fas fa-clock" style={{ fontSize: 12, opacity: 0.5 }} />
          <span>{time.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          <span style={{ fontFamily: "var(--font-sora), monospace", fontWeight: 600 }}>
            {time.toLocaleTimeString("id-ID")}
          </span>
        </div>
        <a href="/panic" className="btn-icon" style={{ position: "relative" }} title="Panic alert aktif">
          <i className="fas fa-bell" />
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              background: "var(--danger)", color: "#fff",
              fontSize: 9, fontWeight: 800, minWidth: 16, height: 16,
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 4px",
            }}>{unreadCount}</span>
          )}
        </a>
        <button className="theme-toggle" onClick={toggleDark} title={isDark ? t("light_mode") : t("dark_mode")}>
          <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} />
        </button>
        <button className="lang-toggle" onClick={() => setLang(lang === "id" ? "en" : "id")}>
          <span className={lang === "id" ? "lang-active" : "lang-inactive"}>ID</span>
          <span className={lang === "en" ? "lang-active" : "lang-inactive"}>EN</span>
        </button>
        <div style={{ position: "relative" }}>
          <button
            className="topbar-user"
            onClick={() => setMenuOpen((v) => !v)}
            title="Menu akun"
            style={{ cursor: "pointer", fontFamily: "inherit" }}
          >
            <div className="topbar-user-avatar" style={{ background: roleColors[user.role] || "var(--brand-primary)" }}>
              {user.nama?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="topbar-user-info" style={{ textAlign: "left" }}>
              <div className="topbar-user-name">{user.nama}</div>
              <div className="topbar-user-role">
                {user.nrp} · <span style={{ textTransform: "capitalize" }}>{user.role}</span>
              </div>
            </div>
            <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "var(--text-muted)" }} />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 45 }} onClick={() => setMenuOpen(false)} />
              <div
                style={{
                  position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 46, minWidth: 200,
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                  boxShadow: "var(--shadow-lg)", padding: 6,
                }}
              >
                {user.role !== "klien" && (
                  <button className="nav-item" style={{ color: "var(--text)" }} onClick={() => { setMenuOpen(false); setPinModal("bebas"); }}>
                    <i className="fas fa-key" /> <span>Ganti PIN</span>
                  </button>
                )}
                <button className="nav-item" style={{ color: "var(--danger)" }} onClick={() => { authApi.logout(); window.location.href = "/login"; }}>
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
