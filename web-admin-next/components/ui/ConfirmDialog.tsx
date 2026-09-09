"use client";
import React, { useState } from "react";

/**
 * Dialog konfirmasi bersama.
 * [6-2] Label & gaya tombol dapat dikonfigurasi (default "Hapus"/"Batal").
 * [Misi V3 / B3] Tambahan:
 *  - `note`: catatan efek aksi (ditampilkan mencolok, mis. "klien tidak bisa login").
 *  - `requireText`: konfirmasi keras — pengguna harus mengetik teks persis sebelum tombol aktif.
 *  - `busy`: tombol dinonaktifkan + spinner saat proses (anti dobel klik).
 */
export function ConfirmDialog({
  title,
  msg,
  onConfirm,
  onCancel,
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  confirmClass = "btn-danger",
  note,
  requireText,
  busy = false,
}: {
  title: string;
  msg: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmClass?: string;
  note?: string;
  requireText?: string;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const locked = !!requireText && typed.trim() !== requireText;
  return (
    // [6-2] Klik area overlay (di luar box) = batal. Box ber-stopPropagation
    // sehingga klik di dalam tidak ikut menutup.
    <div className="confirm-overlay" onClick={() => !busy && onCancel()}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <p>{msg}</p>
        {note && (
          <div className="confirm-danger-note">
            <i className="fas fa-exclamation-triangle" /> {note}
          </div>
        )}
        {requireText && (
          <div className="confirm-input">
            <label className="form-label">Ketik <code>{requireText}</code> untuk melanjutkan</label>
            <input
              className="form-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter" && !locked && !busy) onConfirm(); }}
            />
          </div>
        )}
        <div className="confirm-btns">
          <button className="btn btn-outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm} disabled={busy || locked}>
            {busy && <i className="fas fa-spinner fa-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
