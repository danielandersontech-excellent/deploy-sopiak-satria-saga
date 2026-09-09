'use client'
import { Shield, MapPin, CheckCircle2, FileText, ShieldCheck, Siren, Fingerprint, MapPinned, ArrowRight, Play } from 'lucide-react'
import AnimatedCounter from './AnimatedCounter'

export default function Hero() {
  return (
    <section id="hero" className="hero">
      {/* Background layers */}
      <div className="hero-bg">
        <div className="hero-grid-pattern" />
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
        <div className="hero-grain" />
      </div>

      <div className="hero-content">
        {/* Left content */}
        <div>
          <div className="hero-badge">
            <div className="hero-badge-dot">
              <Shield size={12} color="#fff" strokeWidth={2.5} />
            </div>
            <span className="hero-badge-text">Solusi Keamanan Profesional Berbasis Teknologi</span>
          </div>

          <h1 className="hero-title">
            Keamanan{' '}
            <span className="text-gradient">Terpercaya</span>
            <br />
            Dengan Teknologi{' '}
            <span className="text-gradient">Terdepan</span>
          </h1>

          <p className="hero-desc">
            PT Sopiak Satria Saga menghadirkan solusi keamanan profesional terintegrasi
            dengan sistem manajemen berbasis teknologi AI, GPS real-time tracking, dan monitoring 24/7.
          </p>

          <div className="hero-actions">
            <a href="/#kontak" className="btn-primary">
              <span>Konsultasi Gratis</span>
              <ArrowRight size={16} />
            </a>
            <a href="/#teknologi" className="btn-ghost">
              <Play size={14} />
              <span>Lihat Teknologi Kami</span>
            </a>
          </div>

          <div className="hero-stats">
            {[
              { val: <AnimatedCounter end={6} suffix="+" />, lbl: 'Layanan Unggulan' },
              { val: <AnimatedCounter end={50} suffix="+" />, lbl: 'Personil Terlatih' },
              { val: <AnimatedCounter end={100} suffix="%" />, lbl: 'Komitmen Penuh' },
              { val: '24/7', lbl: 'Siap Melayani' },
            ].map((s, i) => (
              <div key={i} className="hero-stat">
                <div className="hero-stat-num">{s.val}</div>
                <div className="hero-stat-label">{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right visual - Phone Mockup */}
        <div className="hero-visual">
          <div className="phone-mockup">
            <div className="phone-frame">
              <div className="phone-screen">
                <div className="phone-notch" />

                {/* App Header */}
                <div className="ps-header">
                  <div className="ps-logo">
                    <Shield size={16} color="#fff" strokeWidth={2.5} />
                  </div>
                  <div className="ps-header-text">
                    <h4>Dashboard Security</h4>
                    <span>PT Sopiak Satria Saga</span>
                  </div>
                  <div className="ps-alert-btn">
                    <Siren size={14} color="var(--cyan)" />
                  </div>
                </div>

                {/* Status Bar */}
                <div className="ps-status-bar">
                  <ShieldCheck size={16} color="var(--green)" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>Semua Area Aman</div>
                    <div style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>Terakhir update: 12:45 WIB</div>
                  </div>
                  <div className="ps-live-dot" style={{ marginLeft: 'auto' }} />
                </div>

                {/* GPS Tracking Card */}
                <div className="ps-gps-card">
                  <MapPin size={16} color="var(--cyan)" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>GPS Active</div>
                    <div style={{ fontSize: 8.5, color: 'var(--text-dim)' }}>Real-time Tracking</div>
                  </div>
                  <div className="ps-gps-badge">LIVE</div>
                </div>

                {/* Metrics Grid */}
                <div className="ps-grid-2">
                  <div className="ps-metric">
                    <CheckCircle2 size={16} color="var(--green)" style={{ margin: '0 auto' }} />
                    <div className="ps-metric-num">24</div>
                    <div className="ps-metric-label">On Duty</div>
                  </div>
                  <div className="ps-metric">
                    <FileText size={16} color="var(--amber)" style={{ margin: '0 auto' }} />
                    <div className="ps-metric-num">8</div>
                    <div className="ps-metric-label">Laporan</div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="ps-quick-grid">
                  {[
                    { Icon: Fingerprint, label: 'Absensi', color: 'var(--cyan)' },
                    { Icon: MapPinned, label: 'Patroli', color: 'var(--green)' },
                    { Icon: FileText, label: 'Laporan', color: 'var(--amber)' },
                    { Icon: Siren, label: 'SOS', color: 'var(--red)' },
                  ].map((item, i) => (
                    <div key={i} className="ps-quick-btn">
                      <item.Icon size={15} color={item.color} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="scroll-indicator">
        <div className="scroll-mouse">
          <div className="scroll-dot" />
        </div>
        <span className="scroll-text">Scroll</span>
      </div>
    </section>
  )
}
