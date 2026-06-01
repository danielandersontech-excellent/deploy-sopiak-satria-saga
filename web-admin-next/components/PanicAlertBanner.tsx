"use client";
import { useState, useEffect, useCallback } from "react";
import { panicApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";

export default function PanicAlertBanner() {
  const [activeCount, setActiveCount] = useState(0);
  const [latestName, setLatestName] = useState("");

  const loadPanic = useCallback(async () => {
    try {
      const data = await panicApi.list("status=active");
      const list = Array.isArray(data) ? data : [];
      setActiveCount(list.length);
      if (list.length > 0) {
        const p = list[0];
        setLatestName(p.nama_pelapor || p.user?.nama || "Anggota");
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadPanic();
    const unsub = onRealtimeEvent((ev) => {
      if (ev === "panic:alert" || ev === "panic:resolved") loadPanic();
    });
    return unsub;
  }, [loadPanic]);

  if (activeCount === 0) return null;

  return (
    <div className="panic-banner">
      <i className="fas fa-exclamation-triangle" style={{ fontSize: 18 }} />
      <span>
        PANIC ALERT AKTIF - {latestName} membutuhkan bantuan!
        {activeCount > 1 && ` (+${activeCount - 1} lainnya)`}
      </span>
      <a
        href="/panic"
        style={{
          color: "#fff",
          textDecoration: "underline",
          fontWeight: 700,
          marginLeft: 8,
        }}
      >
        Lihat Detail →
      </a>
    </div>
  );
}