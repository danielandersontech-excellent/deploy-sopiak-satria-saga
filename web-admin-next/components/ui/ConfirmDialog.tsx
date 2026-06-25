"use client";
import React from "react";

export function ConfirmDialog({
  title,
  msg,
  onConfirm,
  onCancel,
  // [6-2] Label & gaya tombol kini dapat dikonfigurasi. Default menjaga
  // perilaku lama (pemanggil hapus tetap menampilkan "Hapus"/"Batal").
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  confirmClass = "btn-danger",
}: {
  title: string;
  msg: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmClass?: string;
}) {
  return (
    // [6-2] Klik area overlay (di luar box) = batal. Box ber-stopPropagation
    // sehingga klik di dalam tidak ikut menutup.
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <p>{msg}</p>
        <div className="confirm-btns">
          <button className="btn btn-outline" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
