'use client'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react'
import { SERVICES, COMPANY } from '@/lib/data'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export default function ServiceDetailClient({ slug }: { slug: string }) {
  const svc = SERVICES.find((s) => s.slug === slug)
  if (!svc) return null
  const others = SERVICES.filter((s) => s.slug !== slug)
  const SvcIcon = svc.Icon

  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="svc-detail-hero">
        <div className="svc-detail-orb" style={{ background: `${svc.color}08` }} />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <Link href="/#layanan" className="svc-detail-back">
            <ArrowLeft size={16} /> Kembali ke Semua Layanan
          </Link>
          <div
            className="svc-detail-icon"
            style={{ background: `${svc.color}12`, border: `1px solid ${svc.color}20` }}
          >
            <SvcIcon size={32} color={svc.color} strokeWidth={1.8} />
          </div>
          <h1 className="svc-detail-title">{svc.title}</h1>
          <p className="svc-detail-desc">{svc.fullDesc}</p>
        </div>
      </section>

      {/* Content */}
      <section className="svc-detail-content">
        <div className="container">
          <div className="svc-detail-grid">
            <div>
              {/* Features */}
              <div className="svc-detail-section">
                <h2>Apa yang Kami Tawarkan</h2>
                <div>
                  {svc.features.map((f, i) => (
                    <div key={i} className="sdc-feature">
                      <div className="sdc-feature-dot" style={{ background: svc.color }} />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Process */}
              <div className="svc-detail-section">
                <h2>Proses Kerja Kami</h2>
                <div>
                  {svc.process.map((p, i) => (
                    <div key={i} className="sdc-process-card">
                      <div className="sdc-process-num" style={{ color: svc.color }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <h3>{p.step}</h3>
                        <p>{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div>
              <div className="sdc-sidebar-card">
                <h3>Yang Termasuk dalam Layanan</h3>
                {svc.includes.map((item, i) => (
                  <div key={i} className="sdc-include-item">
                    <CheckCircle2 size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="sdc-cta-card">
                <h3>Tertarik dengan Layanan Ini?</h3>
                <p>Konsultasikan kebutuhan Anda. Gratis dan tanpa komitmen.</p>
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(`Halo, saya tertarik dengan layanan ${svc.title}. Bisakah mendapat informasi lebih lanjut?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-whatsapp"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <MessageCircle size={16} /> WhatsApp Kami
                </a>
                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
                  atau hubungi {COMPANY.phones[0]}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Other Services */}
      <section className="svc-other-section">
        <div className="container">
          <h2 className="svc-other-title">Layanan Lainnya</h2>
          <div className="svc-grid">
            {others.map((o) => {
              const OIcon = o.Icon
              return (
                <Link href={`/layanan/${o.slug}`} key={o.slug} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="svc-card" style={{ height: '100%' }}>
                    <div className="svc-card-top">
                      <div
                        className="svc-icon"
                        style={{ background: `${o.color}12`, border: `1px solid ${o.color}20` }}
                      >
                        <OIcon size={22} color={o.color} strokeWidth={1.8} />
                      </div>
                      <div className="svc-arrow">
                        <ArrowRight size={13} color={o.color} />
                      </div>
                    </div>
                    <h3>{o.title}</h3>
                    <p>{o.shortDesc}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
