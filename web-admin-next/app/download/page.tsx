export default function DownloadPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0F172A', color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 40 }}>
        <img src="/logo-ptsss.png" alt="PTSSS" style={{ width: 100, marginBottom: 20, borderRadius: 16 }} />
        <h1 style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>PT Sopiak Satria Saga</h1>
        <p style={{ color: '#94A3B8', marginBottom: 32, fontSize: 15 }}>Download Aplikasi Mobile</p>
        <a href="/download/ptsss-latest.apk" download
          style={{
            display: 'inline-block', padding: '14px 36px', background: '#1A56DB',
            color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 600,
            fontSize: 16, transition: 'background 0.2s',
          }}>
          ⬇️ Download APK Android
        </a>
        <p style={{ color: '#64748B', marginTop: 24, fontSize: 12, lineHeight: 1.6 }}>
          Setelah download, buka file APK di HP Android untuk install.<br/>
          Izinkan &quot;Sumber tidak dikenal&quot; jika diminta.
        </p>
        <div style={{ marginTop: 32, borderTop: '1px solid #1E293B', paddingTop: 20 }}>
          <p style={{ color: '#475569', fontSize: 11 }}>
            © {new Date().getFullYear()} PT Sopiak Satria Saga. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
