"use client";
/**
 * PWA Update Prompt - notifikasi saat versi baru tersedia.
 *
 * Tahap 10 Bug #4 (P3-11): hex hardcode diganti CSS variable.
 * [Misi V3 / B2]: memakai kelas bersama `.floating-prompt` + `.btn` agar seragam
 * dengan InstallPrompt dan mengikuti tema terang/gelap (sebelumnya toast gelap
 * permanen dengan keluarga token --brand-dark-*).
 */
import { useState, useEffect } from 'react';

export default function PWAUpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Listen for new service worker
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdate(true);
                setRegistration(reg);
              }
            });
          }
        });
      });
    }
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  if (!showUpdate) return null;

  return (
    <div className="floating-prompt" role="status" aria-live="polite">
      <i className="fas fa-arrow-rotate-right floating-prompt-icon" />
      <span>Versi baru tersedia!</span>
      <button className="btn btn-primary btn-sm" onClick={handleUpdate}><i className="fas fa-sync-alt" /> Perbarui</button>
      <button className="btn btn-outline btn-sm" onClick={() => setShowUpdate(false)} aria-label="Tutup">✕</button>
    </div>
  );
}
