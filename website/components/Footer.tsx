import Link from 'next/link'
import { Shield, MapPin, Phone, Mail, ExternalLink, MessageCircle } from 'lucide-react'
import { COMPANY, SERVICES } from '@/lib/data'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand */}
          <div className="footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg, #00B4D8, #0096C7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Shield size={18} color="#fff" strokeWidth={2.5} />
              </div>
              <div>
                <strong style={{ color: '#fff', fontSize: 14, fontFamily: 'var(--font-head)' }}>{COMPANY.name}</strong>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
                  Security Management
                </div>
              </div>
            </div>
            <p>
              Penyedia jasa keamanan profesional terpercaya dengan teknologi manajemen terdepan di Pekanbaru, Riau.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <a
                href={COMPANY.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-info-item"
                style={{ textDecoration: 'none', color: 'var(--text-dim)', transition: 'color .2s' }}
              >
                <MapPin size={12} /> Pekanbaru, Riau
              </a>
              <a
                href={`tel:${COMPANY.phones[0].replace(/-/g, '')}`}
                className="footer-info-item"
                style={{ textDecoration: 'none', color: 'var(--text-dim)', transition: 'color .2s' }}
              >
                <Phone size={12} /> {COMPANY.phones[0]}
              </a>
              <a
                href={`mailto:${COMPANY.email}`}
                className="footer-info-item"
                style={{ textDecoration: 'none', color: 'var(--text-dim)', transition: 'color .2s' }}
              >
                <Mail size={12} /> {COMPANY.email}
              </a>
            </div>
          </div>

          {/* Layanan - All link to real service detail pages */}
          <div className="footer-col">
            <h4>Layanan</h4>
            {SERVICES.map(s => (
              <Link key={s.slug} href={`/layanan/${s.slug}`}>
                {s.title.split(' & ')[0]}
              </Link>
            ))}
          </div>

          {/* Navigasi - Smooth scroll to page sections */}
          <div className="footer-col">
            <h4>Navigasi</h4>
            <Link href="/#hero">Beranda</Link>
            <Link href="/#layanan">Layanan Kami</Link>
            <Link href="/#teknologi">Teknologi</Link>
            <Link href="/#keunggulan">Keunggulan</Link>
            <Link href="/karir">Karir &amp; Rekrutmen</Link>
            <Link href="/#kontak">Hubungi Kami</Link>
          </div>

          {/* Hubungi Kami - All functional external links */}
          <div className="footer-col">
            <h4>Hubungi Kami</h4>
            <a
              href={`https://wa.me/${COMPANY.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <MessageCircle size={12} /> WhatsApp
            </a>
            <a
              href={`tel:${COMPANY.phones[0].replace(/-/g, '')}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Phone size={12} /> {COMPANY.phones[0]}
            </a>
            <a
              href={`mailto:${COMPANY.email}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={12} /> Email Kami
            </a>
            <a
              href={COMPANY.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <MapPin size={12} /> Lokasi Kantor
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>© {new Date().getFullYear()} {COMPANY.name}. All rights reserved.</span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span>Pekanbaru, Riau, Indonesia</span>
          </div>
        </div>
      </div>
    </footer>
  )
}