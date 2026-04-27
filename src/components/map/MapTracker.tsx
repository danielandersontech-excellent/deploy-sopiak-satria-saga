/**
 * ============================================================
 * MAP TRACKER v3 - Enhanced Geofence + Interactive Map
 * ============================================================
 * UPGRADE dari v2:
 *  ✅ Geofence circle dengan animated pulse + gradient fill
 *  ✅ Geofence label di tengah circle (nama pos + radius)
 *  ✅ Geofence popup detail (status, jumlah guard, radius)
 *  ✅ Inner ring visual depth effect
 *  ✅ Bounds auto-extend to include full geofence radius
 *  ✅ Dark mode tiles + dark popups
 *  ✅ Better legend with geofence active/total count
 */
import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking,
  ActivityIndicator, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../../constants';

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  type: 'person' | 'checkpoint' | 'panic' | 'patrol' | 'pos';
  color?: string;
  imageUri?: string;
  status?: string;
}

export interface MapCircle {
  latitude: number;
  longitude: number;
  radius: number;
  color?: string;
  label?: string;
  guardCount?: number;
  status?: string;
}

export interface MapRoute {
  coordinates: { latitude: number; longitude: number }[];
  color?: string;
}

interface MapTrackerProps {
  markers?: MapMarker[];
  circles?: MapCircle[];
  routes?: MapRoute[];
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  showsUserLocation?: boolean;
  style?: any;
  onMarkerPress?: (marker: MapMarker) => void;
  isDark?: boolean;
  height?: number;
  showGeofenceLabels?: boolean;
  animateGeofence?: boolean;
}

const MARKER_COLORS: Record<string, string> = {
  person: '#2980b9', checkpoint: '#27ae60', panic: '#e74c3c', patrol: '#f39c12', pos: '#8b5cf6',
};
const MARKER_ICONS: Record<string, string> = {
  person: '👤', checkpoint: '🚩', panic: '🚨', patrol: '🚶', pos: '📍',
};
const STATUS_COLORS: Record<string, string> = {
  on_duty: '#27ae60', patroli: '#2980b9', break: '#f39c12', off_duty: '#94a3b8', active: '#e74c3c',
};

function esc(text: string): string {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function buildHTML(
  markers: MapMarker[], circles: MapCircle[], routes: MapRoute[],
  isDark: boolean, cLat: number, cLng: number, cZoom: number,
  showLabels: boolean, animate: boolean,
): string {
  const tile = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const pText = isDark ? '#e0e0e0' : '#333';
  const pMuted = isDark ? '#8b949e' : '#666';

  const mkJs = markers.map(m => {
    const c = m.color || MARKER_COLORS[m.type] || '#2980b9';
    const ic = MARKER_ICONS[m.type] || '📍';
    const sc = STATUS_COLORS[m.status||''] || '#94a3b8';
    const sl = m.status ? m.status.replace('_',' ').toUpperCase() : '';
    const desc = m.description ? `<br/><small style="color:${pMuted}">${esc(m.description)}</small>` : '';
    const badge = sl ? `<br/><span style="background:${sc}22;color:${sc};padding:2px 6px;border-radius:8px;font-size:10px;font-weight:700">${sl}</span>` : '';
    return `L.marker([${m.latitude},${m.longitude}],{icon:L.divIcon({className:'cm',html:'<div style="background:${c};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);font-size:16px">${ic}</div>',iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-18]})}).addTo(map).bindPopup('<div style="min-width:180px;color:${pText}"><b style="font-size:13px">${esc(m.title)}</b>${desc}${badge}<br/><small style="color:${pMuted};font-family:monospace">${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}</small><br/><a href="https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=17/${m.latitude}/${m.longitude}" target="_blank" style="color:${Colors.primary};font-size:11px;text-decoration:none">🗺️ Buka di Peta</a></div>',{maxWidth:260}).on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'marker',id:'${m.id}'}));});`;
  }).join('\n');

  const geoJs = circles.map((g, i) => {
    const c = g.color || '#8b5cf6';
    const active = g.status !== 'inactive';
    const fillOp = active ? 0.12 : 0.05;
    const w = active ? 2.5 : 1.5;
    const bOp = active ? 0.7 : 0.3;
    const dash = active ? '8 4' : '4 8';
    const gc = g.guardCount !== undefined ? `<br/><span style="color:${active?'#27ae60':pMuted}">👤 ${g.guardCount} petugas</span>` : '';
    const stBadge = active
      ? '<span style="background:#27ae6022;color:#27ae60;padding:2px 6px;border-radius:8px;font-size:10px;font-weight:700">AKTIF</span>'
      : '<span style="background:#94a3b822;color:#94a3b8;padding:2px 6px;border-radius:8px;font-size:10px;font-weight:700">NONAKTIF</span>';
    const lbl = g.label || 'Geofence';

    let js = `L.circle([${g.latitude},${g.longitude}],{radius:${g.radius},color:'${c}',fillColor:'${c}',fillOpacity:${fillOp},weight:${w},opacity:${bOp},dashArray:'${dash}',className:'${animate&&active?'gp':''}'}).addTo(map).bindPopup('<div style="min-width:200px;color:${pText}"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:16px">🛡️</span><b style="font-size:14px">${esc(lbl)}</b></div>${stBadge}<br/><span style="color:${pMuted};font-size:12px">📏 Radius: <b>${g.radius}m</b></span>${gc}<br/><small style="color:${pMuted};font-family:monospace">${g.latitude.toFixed(5)}, ${g.longitude.toFixed(5)}</small></div>',{maxWidth:280});`;

    // Inner glow ring
    if (active) {
      const ir = Math.max(g.radius * 0.25, 8);
      js += `L.circle([${g.latitude},${g.longitude}],{radius:${ir},color:'${c}',fillColor:'${c}',fillOpacity:${fillOp*2},weight:0}).addTo(map);`;
    }

    // Center label
    if (showLabels) {
      const lblBg = isDark ? 'rgba(30,30,30,0.88)' : 'rgba(255,255,255,0.92)';
      js += `L.marker([${g.latitude},${g.longitude}],{icon:L.divIcon({className:'gl',html:'<div style="background:${lblBg};color:${c};padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;border:1.5px solid ${c}40;box-shadow:0 1px 4px rgba(0,0,0,0.15);text-align:center;pointer-events:none">${esc(lbl)}<br/><span style="font-size:9px;color:${pMuted}">${g.radius}m</span></div>',iconSize:[0,0],iconAnchor:[0,0]}),interactive:false}).addTo(map);`;
    }
    return js;
  }).join('\n');

  const rtJs = routes.map(r => {
    const c = r.color || '#f39c12';
    const coords = r.coordinates.map(p => `[${p.latitude},${p.longitude}]`).join(',');
    return `L.polyline([${coords}],{color:'${c}',weight:3,opacity:0.8,dashArray:'8 4'}).addTo(map);`;
  }).join('\n');

  // Bounds with geofence radius padding
  const aL = [...markers.map(m=>m.latitude),...circles.map(c=>c.latitude),...routes.flatMap(r=>r.coordinates.map(c=>c.latitude))];
  const aG = [...markers.map(m=>m.longitude),...circles.map(c=>c.longitude),...routes.flatMap(r=>r.coordinates.map(c=>c.longitude))];
  let bJs = '';
  if (aL.length > 1) {
    const rPad = circles.length > 0 ? Math.max(...circles.map(c=>c.radius))/111000*1.5 : 0;
    bJs = `map.fitBounds([[${Math.min(...aL)-rPad},${Math.min(...aG)-rPad}],[${Math.max(...aL)+rPad},${Math.max(...aG)+rPad}]],{padding:[40,40],maxZoom:16});`;
  } else if (aL.length === 1) {
    bJs = `map.setView([${aL[0]},${aG[0]}],${circles.length>0?15:16});`;
  }

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{overflow:hidden}#map{width:100vw;height:100vh}
.cm,.gl{background:none!important;border:none!important}
.leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15)}
.leaflet-popup-content{margin:10px 14px}
.leaflet-control-zoom{border-radius:10px!important;overflow:hidden}
.leaflet-control-zoom a{width:34px!important;height:34px!important;line-height:34px!important;font-size:18px!important}
${isDark?'.leaflet-popup-content-wrapper{background:#1e1e1e;color:#e0e0e0}.leaflet-popup-tip{background:#1e1e1e}':''}
${animate?'@keyframes gPulse{0%{stroke-opacity:.7;stroke-width:2.5}50%{stroke-opacity:.3;stroke-width:4}100%{stroke-opacity:.7;stroke-width:2.5}}.gp{animation:gPulse 3s ease-in-out infinite}':''}
</style></head><body><div id="map"></div><script>
var map=L.map('map',{center:[${cLat},${cLng}],zoom:${cZoom},zoomControl:true,attributionControl:false});
L.tileLayer('${tile}',{maxZoom:19}).addTo(map);
${geoJs}
${mkJs}
${rtJs}
${bJs}
setTimeout(function(){map.invalidateSize()},300);
setTimeout(function(){map.invalidateSize()},1000);
</script></body></html>`;
}

export default function MapTracker({
  markers=[], circles=[], routes=[], initialRegion, style,
  onMarkerPress, isDark=false, height=400,
  showGeofenceLabels=true, animateGeofence=true,
}: MapTrackerProps) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [webViewError, setWebViewError] = useState(false);

  const center = useMemo(() => {
    if (initialRegion) return { lat: initialRegion.latitude, lng: initialRegion.longitude, zoom: 14 };
    const pts = [...markers.map(m=>({lat:m.latitude,lng:m.longitude})),...circles.map(c=>({lat:c.latitude,lng:c.longitude}))];
    if (pts.length > 0) {
      const aLat = pts.reduce((s,p)=>s+p.lat,0)/pts.length;
      const aLng = pts.reduce((s,p)=>s+p.lng,0)/pts.length;
      return { lat: aLat, lng: aLng, zoom: 14 };
    }
    return { lat: -6.2088, lng: 106.8456, zoom: 12 };
  }, [markers, circles, initialRegion]);

  const html = useMemo(() =>
    buildHTML(markers, circles, routes, isDark, center.lat, center.lng, center.zoom, showGeofenceLabels, animateGeofence),
    [markers, circles, routes, isDark, center, showGeofenceLabels, animateGeofence]
  );

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'marker' && onMarkerPress) {
        const m = markers.find(x => x.id === data.id);
        if (m) onMarkerPress(m);
      }
    } catch {}
  }, [markers, onMarkerPress]);

  const typeCounts = useMemo(() => {
    const c: Record<string,number> = {};
    markers.forEach(m => { c[m.type] = (c[m.type]||0)+1; });
    return c;
  }, [markers]);

  const activeGeo = useMemo(() => circles.filter(c => c.status !== 'inactive').length, [circles]);

  const typeLabels: Record<string,string> = { person:'Personel', checkpoint:'Checkpoint', panic:'Panic', patrol:'Patroli', pos:'Pos Jaga' };

  if (markers.length === 0 && circles.length === 0 && routes.length === 0) {
    return (
      <View style={[st.box, st.empty, { height }, style]}>
        <Ionicons name="location-outline" size={40} color="#94a3b8" />
        <Text style={[st.emptyTxt, isDark && { color: '#64748b' }]}>Belum ada data lokasi</Text>
      </View>
    );
  }

  if (webViewError) {
    return (
      <View style={[st.box, { height }, style]}>
        <View style={st.hdr}><View style={st.hdrL}><Ionicons name="location" size={18} color={Colors.primary} /><Text style={[st.hdrT, isDark && { color: '#e6edf3' }]}>Lokasi ({markers.length})</Text></View></View>
        {markers.map(m => (
          <TouchableOpacity key={m.id} style={[st.fbItem, isDark && { backgroundColor: '#161b22', borderColor: '#30363d' }]}
            onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}#map=17/${m.latitude}/${m.longitude}`)}>
            <Text style={{ fontSize: 16 }}>{MARKER_ICONS[m.type]||'📍'}</Text>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[st.fbTitle, isDark && { color: '#e6edf3' }]}>{m.title}</Text>
              <Text style={st.fbCoord}>{m.latitude.toFixed(5)}, {m.longitude.toFixed(5)}</Text>
            </View>
            <Ionicons name="open-outline" size={14} color={Colors.primary} />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <View style={[st.box, { height }, style]}>
      <View style={[st.legend, isDark && { backgroundColor: '#161b22', borderColor: '#30363d' }]}>
        {Object.entries(typeCounts).map(([t, c]) => (
          <View key={t} style={st.lgItem}>
            <View style={[st.lgDot, { backgroundColor: MARKER_COLORS[t]||Colors.primary }]} />
            <Text style={[st.lgTxt, isDark && { color: '#8b949e' }]}>{typeLabels[t]||t} ({c})</Text>
          </View>
        ))}
        {circles.length > 0 && (
          <View style={st.lgItem}>
            <View style={[st.lgDot, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#8b5cf6' }]} />
            <Text style={[st.lgTxt, isDark && { color: '#8b949e' }]}>Geofence ({activeGeo}/{circles.length})</Text>
          </View>
        )}
      </View>
      <View style={st.mapWrap}>
        {loading && (
          <View style={[st.loadOvl, isDark && { backgroundColor: 'rgba(13,17,23,0.9)' }]}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[st.loadTxt, isDark && { color: '#8b949e' }]}>Memuat peta...</Text>
          </View>
        )}
        <WebView ref={webViewRef} source={{ html }} style={st.wv} originWhitelist={['*']}
          javaScriptEnabled domStorageEnabled
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setWebViewError(true); }}
          onHttpError={() => { setLoading(false); setWebViewError(true); }}
          onMessage={handleMessage} scrollEnabled={false} bounces={false}
          showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
          cacheEnabled cacheMode="LOAD_CACHE_ELSE_NETWORK"
          allowsInlineMediaPlayback mixedContentMode="compatibility" startInLoadingState={false} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTxt: { fontSize: 13, color: '#94a3b8' },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  hdrL: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hdrT: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', zIndex: 10 },
  lgItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lgDot: { width: 8, height: 8, borderRadius: 4 },
  lgTxt: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  mapWrap: { flex: 1, position: 'relative' },
  wv: { flex: 1, backgroundColor: 'transparent' },
  loadOvl: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', zIndex: 20, gap: 8 },
  loadTxt: { fontSize: 12, color: '#64748b' },
  fbItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  fbTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  fbCoord: { fontSize: 10, color: '#94a3b8', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
