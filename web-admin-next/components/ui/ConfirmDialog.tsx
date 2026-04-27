"use client";
import React from "react";

export function ConfirmDialog({
  title,
  msg,
  onConfirm,
  onCancel,
}: {
  title: string;
  msg: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <p>{msg}</p>
        <div className="confirm-btns">
          <button className="btn btn-outline" onClick={onCancel}>
            Batal
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
