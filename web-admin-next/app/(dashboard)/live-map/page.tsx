"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { lokasiApi, geofenceApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtDate, fmtDateTime, statusColor } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";

export default function LiveMapPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [selLok, setSelLok] = useState("");
  const [loading, setLoading] = useState(true);
  const loadMap = useCallback(async () => {
    try {
      const d = await geofenceApi.liveMap(selLok || undefined);
      setData(d);
    } catch (e: any) {
      toast(e.message, "error");
    }
    setLoading(false);
  }, [selLok]);
  useEffect(() => {
    lokasiApi
      .list("status=active")
      .then((d) => setLokasi(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadMap();
    const t = setInterval(loadMap, 15000);
    const unsub = onRealtimeEvent((ev) => {
      if (ev.includes("geofence") || ev.includes("location")) loadMap();
    });
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [selLok]);
  const mapHtml = useMemo(() => {
    if (!data) return "";
    const p = data.personnel || [];
    const locs = data.lokasi || [];
    const cLat = locs[0]?.latitude || p[0]?.latitude || -0.5;
    const cLng = locs[0]?.longitude || p[0]?.longitude || 101.4;
    const markers = p
      .map((u: any) => {
        const c = !u.dalam_radius
          ? "#ef4444"
          : u.status === "on_duty"
            ? "#22c55e"
            : "#64748b";
        return `L.circleMarker([${u.latitude},${u.longitude}],{radius:8,fillColor:'${c}',color:'#fff',weight:2,fillOpacity:0.9}).addTo(m).bindPopup('<b>${(u.nama || "").replace(/'/g, "\\\\'")}</b><br>${u.status}<br>${u.lokasi_nama || ""}<br>Jarak: ${u.jarak || 0}m');`;
      })
      .join("\n");
    const circles = locs
      .map((l: any) =>
        l.latitude
          ? `L.circle([${l.latitude},${l.longitude}],{radius:${l.radius || 500},color:'#3b82f6',fillOpacity:0.08,weight:2,dashArray:'5,5'}).addTo(m).bindPopup('${(l.nama || "").replace(/'/g, "\\\\'")} (${l.radius || 500}m)');`
          : "",
      )
      .join("\n");
    return `<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><style>body{margin:0}#m{height:100vh}</style></head><body><div id="m"></div><script>var m=L.map('m').setView([${cLat},${cLng}],14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(m);${circles}${markers}</script></body></html>`;
  }, [data]);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-map-marked-alt" />
          Live Map - Posisi Real-time
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            className="form-select"
            style={{ width: 200 }}
            value={selLok}
            onChange={(e) => setSelLok(e.target.value)}
          >
            <option value="">Semua Lokasi</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nama}
              </option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={loadMap}>
            <i className="fas fa-sync-alt" />
          </button>
        </div>
      </div>
      {data && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div className="kpi-card blue" style={{ flex: 1 }}>
            <div className="kpi-icon">
              <i className="fas fa-users" />
            </div>
            <div>
              <div className="kpi-val">{data.personnel?.length || 0}</div>
              <div className="kpi-label">Tertrack</div>
            </div>
          </div>
          <div className="kpi-card green" style={{ flex: 1 }}>
            <div className="kpi-icon">
              <i className="fas fa-check-circle" />
            </div>
            <div>
              <div className="kpi-val">{data.total_online || 0}</div>
              <div className="kpi-label">Online</div>
            </div>
          </div>
          <div className="kpi-card red" style={{ flex: 1 }}>
            <div className="kpi-icon">
              <i className="fas fa-exclamation-circle" />
            </div>
            <div>
              <div className="kpi-val">{data.total_outside || 0}</div>
              <div className="kpi-label">Di Luar Radius</div>
            </div>
          </div>
        </div>
      )}
      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}>Memuat peta...</div>
        ) : (
          <iframe
            srcDoc={mapHtml}
            style={{ width: "100%", height: 550, border: "none" }}
            title="live-map"
          />
        )}
      </div>
      {data?.personnel?.length > 0 && (
        <div className="section-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>
            📋 Daftar Personil ({data.personnel.length})
          </h3>
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>NRP</th>
                <th>Role</th>
                <th>Status</th>
                <th>Lokasi</th>
                <th>Jarak</th>
                <th>Dalam Radius</th>
                <th>Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {data.personnel.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nama}</strong>
                  </td>
                  <td>
                    <code>{p.nrp}</code>
                  </td>
                  <td>{p.role}</td>
                  <td>
                    <span className={`badge badge-${statusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>{p.lokasi_nama || "-"}</td>
                  <td>{p.jarak !== null ? `${p.jarak}m` : "-"}</td>
                  <td>{p.dalam_radius ? "✅" : "❌"}</td>
                  <td>{fmtDateTime(p.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

