"use client";
import React, { useEffect } from "react";

/**
 * [Misi V3 / B2] Pratinjau gambar layar penuh — satu komponen untuk foto
 * laporan harian/kejadian, patroli, dan serah terima (sebelumnya markup
 * overlay digandakan di 4 halaman). Tutup dengan klik di mana saja atau Esc.
 */
export function ImagePreview({ src, alt = "Pratinjau", onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div className="modal-overlay image-preview-overlay" onClick={onClose} role="dialog" aria-label={alt}>
      <img src={src} alt={alt} onClick={onClose} />
    </div>
  );
}
