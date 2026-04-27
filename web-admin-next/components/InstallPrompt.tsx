"use client";
import { useState, useEffect } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem("ptsss_install_dismissed");
      if (!dismissed) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem("ptsss_install_dismissed", "1");
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9998, background: "var(--bg-secondary)", border: "1px solid var(--border)",
      color: "var(--text-primary)", padding: "14px 24px", borderRadius: 12,
      boxShadow: "var(--shadow-xl)", display: "flex", alignItems: "center", gap: 16,
      fontSize: 14, fontWeight: 500, maxWidth: "90vw",
    }}>
      <img src="/logo-ptsss.png" alt="Logo" style={{ width: 32, height: 32, objectFit: "contain" }} />
      <span>Install PT Sopiak Satria Saga di perangkat ini</span>
      <button onClick={handleInstall} style={{
        background: "var(--brand-primary)", color: "#fff", border: "none",
        padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
      }}>Install</button>
      <button onClick={handleDismiss} style={{
        background: "transparent", border: "none", color: "var(--text-muted)",
        cursor: "pointer", fontSize: 13,
      }}>Nanti</button>
    </div>
  );
}
