"use client";
import React from "react";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
      <span className="muted">
        Menampilkan {Math.min((currentPage - 1) * pageSize + 1, totalItems)}–{Math.min(currentPage * pageSize, totalItems)} dari {totalItems}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          className="btn btn-sm btn-outline"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <i className="fas fa-chevron-left" />
        </button>
        {pages.map((p, i) =>
          typeof p === "string" ? (
            <span key={`e${i}`} style={{ padding: "6px 8px", color: "var(--text-muted)" }}>…</span>
          ) : (
            <button
              key={p}
              className={`btn btn-sm ${p === currentPage ? "btn-primary" : "btn-outline"}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button
          className="btn btn-sm btn-outline"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <i className="fas fa-chevron-right" />
        </button>
      </div>
    </div>
  );
}