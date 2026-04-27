"use client";
/**
 * PWA Update Prompt - Shows notification when a new version is available
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
      background: '#1e293b',
      color: '#fff',
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
      <i className="fas fa-arrow-rotate-right" style={{ color: '#60a5fa' }}></i>
      <span>Versi baru tersedia!</span>
      <button
        onClick={handleUpdate}
        style={{
          background: '#2563eb',
          color: '#fff',
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
          color: '#94a3b8',
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        ✕
      </button>
    </div>
  );
}
