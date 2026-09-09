"use client";
import { useState, useEffect } from "react";

/**
 * Prompt pasang PWA. [Misi V3 / B2] Memakai kelas bersama `.floating-prompt`
 * + `.btn` (sebelumnya seluruh gaya inline dengan token keluarga lama).
 */
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
    <div className="floating-prompt" role="dialog" aria-label="Pasang aplikasi">
      <img src="/logo-ptsss.png" alt="Logo" />
      <span>Pasang PT Sopiak Satria Saga di perangkat ini</span>
      <button className="btn btn-primary btn-sm" onClick={handleInstall}><i className="fas fa-download" /> Pasang</button>
      <button className="btn btn-outline btn-sm" onClick={handleDismiss}>Nanti</button>
    </div>
  );
}
