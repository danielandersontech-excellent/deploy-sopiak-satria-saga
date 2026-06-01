"use client";
/**
 * PWA Update Prompt - Shows notification when a new version is available.
 *
 * Tahap 10 Bug #4 (P3-11): hardcoded hex colors replaced with CSS variables
 * from styles/globals.css. This is a dark-themed floating toast — uses the
 * --brand-dark-* family. Note: --brand-dark-text-muted-strong (#94A3B8) ≈
 * the original #94a3b8 from the close button.
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
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'var(--brand-dark-surface)',
      color: 'var(--brand-dark-text)',
      padding: '14px 24px',
      borderRadius: 12,
      boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      fontSize: 14,
      fontWeight: 500,
      animation: 'slideUp 0.3s ease',
    }}>
      <i className="fas fa-arrow-rotate-right" style={{ color: 'var(--brand-accent-light)' }}></i>
      <span>Versi baru tersedia!</span>
      <button
        onClick={handleUpdate}
        style={{
          background: 'var(--brand-accent-strong)',
          color: 'var(--brand-dark-text)',
          border: 'none',
          padding: '6px 16px',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Update
      </button>
      <button
        onClick={() => setShowUpdate(false)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--brand-dark-text-muted-strong)',
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        ✕
      </button>
    </div>
  );
}