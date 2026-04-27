'use client'
import { useInView } from '@/hooks/useInView'
import { TECH_FEATURES } from '@/lib/data'

export default function Technology() {
  const { ref, inView } = useInView()
  return (
    <section id="teknologi" ref={ref} className="tech-section">
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">TEKNOLOGI</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Sistem Security{' '}
          <span className="text-gradient">Generasi Terbaru</span>
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`}>
          Integrasi penuh antara aplikasi mobile, web admin, dan backend AI - dikembangkan khusus untuk PT Sopiak Satria Saga.
        </p>
        <div className="tech-grid">
          {TECH_FEATURES.map((t, i) => (
            <div key={i} className={`tech-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .07}s` }}>
              <div className="tech-card-top">
                <div className="tech-icon">
                  <t.Icon size={22} color="#00B4D8" strokeWidth={1.8} />
                </div>
                <span className="tech-tag">{t.tag}</span>
              </div>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
