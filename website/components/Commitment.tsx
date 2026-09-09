'use client'
import Link from 'next/link'
import { ArrowRight, BadgeCheck } from 'lucide-react'
import { useInView } from '@/hooks/useInView'
import { COMMITMENTS, LEGALITAS } from '@/lib/data'

export default function Commitment() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="commit-section">
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
          <div className={`reveal ${inView ? 'visible' : ''}`}>
            <div className="section-label gold centered">KOMITMEN KAMI</div>
          </div>
          <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`} style={{ textAlign: 'center' }}>
            Membangun Kepercayaan{' '}
            <span className="text-gradient-gold">Dari Hari Pertama</span>
          </h2>
          <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`} style={{ margin: '0 auto 56px', textAlign: 'center' }}>
            Kami berkomitmen penuh membuktikan kualitas melalui layanan terbaik dan dedikasi tanpa batas kepada setiap klien.
          </p>
        </div>
        <div className="commit-grid">
          {COMMITMENTS.map((item, i) => (
            <div key={i} className={`commit-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.2 + i * .12}s` }}>
              <div className="commit-icon">
                <item.Icon size={24} color="var(--gold)" strokeWidth={1.8} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* [Konten Profil] Strip legalitas resmi + tautan ke profil lengkap */}
        <div className={`pf-trust-strip reveal ${inView ? 'visible' : ''} d3`}>
          {LEGALITAS.map((l) => (
            <span key={l.title} className="pf-trust-chip">
              <BadgeCheck size={13} color="var(--green)" strokeWidth={2.2} /> {l.full}
            </span>
          ))}
        </div>
        <div className={`pf-home-profile-cta reveal ${inView ? 'visible' : ''} d4`}>
          <Link href="/profil" className="pf-link-btn">
            Lihat Profil Perusahaan Lengkap <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}
