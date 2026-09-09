"use client";
import React, { useEffect, useRef } from "react";

/**
 * Modal bersama.
 * [6-2] Klik overlay = tutup; konten ber-stopPropagation.
 * [Misi V3 / B3] Perilaku keyboard yang seragam untuk SEMUA modal tanpa perlu
 * mengubah tiap halaman:
 *  - Esc menutup modal (memanggil onClose).
 *  - Field pertama otomatis mendapat fokus saat modal dibuka.
 *  - Enter di dalam <input> (bukan textarea/select/checkbox/file) memicu tombol
 *    utama di footer (.btn-primary / .btn-success / .btn-danger) bila tidak disabled
 *    → "enter-to-submit" di modal tambah/edit yang sebelumnya hanya onClick.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Fokus otomatis ke field pertama yang bisa diisi.
    const t = window.setTimeout(() => {
      const root = contentRef.current;
      if (!root || root.contains(document.activeElement)) return;
      const first = root.querySelector<HTMLElement>(
        '.modal-body input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]):not([readonly]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])'
      );
      first?.focus();
    }, 30);
    return () => { window.removeEventListener("keydown", onKey); window.clearTimeout(t); };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (!el || el.tagName !== "INPUT") return;
    const type = (el as HTMLInputElement).type;
    if (["checkbox", "radio", "file", "button", "submit"].includes(type)) return;
    // Bila input berada di dalam <form>, biarkan form yang menangani submit.
    if (el.closest("form")) return;
    const primary = footerRef.current?.querySelector<HTMLButtonElement>(
      ".btn-primary:not(:disabled), .btn-success:not(:disabled), .btn-danger:not(:disabled), .btn-warning:not(:disabled)"
    );
    if (primary) { e.preventDefault(); primary.click(); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={contentRef}
        className={`modal-content ${wide ? "modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Tutup">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer" ref={footerRef}>{footer}</div>}
      </div>
    </div>
  );
}
