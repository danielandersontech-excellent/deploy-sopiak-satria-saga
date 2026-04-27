'use client'
import { useInView } from '@/hooks/useInView'
import { COMMITMENTS } from '@/lib/data'

export default function Commitment() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="commit-section">
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
          <div className={`reveal ${inView ? 'visible' : ''}`}>
            <div className="section-label" style={{ justifyContent: 'center', color: '#D4A853' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 32, height: 1.5, background: 'linear-gradient(90deg, transparent, #D4A853)' }} />
                KOMITMEN KAMI
              </span>
            </div>
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
                <item.Icon size={24} color="#D4A853" strokeWidth={1.8} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
