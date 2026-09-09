"use client";
import { useEffect, useState } from "react";

/**
 * [Misi V3 / B2] Warna token CSS untuk pustaka yang butuh string warna literal
 * (Recharts). Membaca nilai `--primary`, `--success`, ... dari :root saat mount
 * dan setiap kali atribut data-theme berubah, sehingga grafik & tooltip
 * mengikuti tema terang/gelap (sebelumnya hex hardcode gelap permanen).
 */
export type ThemeColors = {
  primary: string; success: string; warning: string; danger: string; purple: string; info: string;
  text: string; textSecondary: string; textMuted: string; border: string; card: string;
};

const FALLBACK: ThemeColors = {
  primary: "#1A56DB", success: "#10b981", warning: "#f59e0b", danger: "#ef4444", purple: "#8b5cf6", info: "#0EA5E9",
  text: "#111827", textSecondary: "#6b7280", textMuted: "#9ca3af", border: "#e5e7eb", card: "#ffffff",
};

function readColors(): ThemeColors {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => (cs.getPropertyValue(name) || "").trim() || fb;
  return {
    primary: v("--primary", FALLBACK.primary),
    success: v("--success", FALLBACK.success),
    warning: v("--warning", FALLBACK.warning),
    danger: v("--danger", FALLBACK.danger),
    purple: v("--purple", FALLBACK.purple),
    info: v("--info", FALLBACK.info),
    text: v("--text", FALLBACK.text),
    textSecondary: v("--text-secondary", FALLBACK.textSecondary),
    textMuted: v("--text-muted", FALLBACK.textMuted),
    border: v("--border", FALLBACK.border),
    card: v("--card", FALLBACK.card),
  };
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);
  useEffect(() => {
    setColors(readColors());
    const obs = new MutationObserver(() => setColors(readColors()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}
