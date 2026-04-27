'use client'
import Link from 'next/link'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useInView } from '@/hooks/useInView'
import { SERVICES } from '@/lib/data'

export default function Services() {
  const { ref, inView } = useInView()
  return (
    <section id="layanan" ref={ref} className="services-section">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">LAYANAN KAMI</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Solusi Keamanan{' '}
          <span className="text-gradient">Komprehensif</span>
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`}>
          Berbagai layanan keamanan profesional yang disesuaikan dengan kebutuhan spesifik setiap klien.
        </p>
        <div className="svc-grid">
          {SERVICES.map((svc, i) => (
            <Link href={`/layanan/${svc.slug}`} key={svc.slug} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                className={`svc-card reveal ${inView ? 'visible' : ''}`}
                style={{ transitionDelay: `${.12 + i * .07}s` }}
              >
                <div className="svc-card-top">
                  <div
                    className="svc-icon"
                    style={{
                      background: `${svc.color}12`,
                      border: `1px solid ${svc.color}20`,
                    }}
                  >
                    <svc.Icon size={24} color={svc.color} strokeWidth={1.8} />
                  </div>
                  <div className="svc-arrow">
                    <ArrowRight size={14} color={svc.color} />
                  </div>
                </div>
                <h3>{svc.title}</h3>
                <p>{svc.shortDesc}</p>
                <div className="svc-card-link" style={{ color: svc.color }}>
                  Pelajari Selengkapnya <ChevronRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
