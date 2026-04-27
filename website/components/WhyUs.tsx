'use client'
import { useInView } from '@/hooks/useInView'
import { WHY_REASONS } from '@/lib/data'

export default function WhyUs() {
  const { ref, inView } = useInView()
  return (
    <section id="keunggulan" ref={ref} className="why-section">
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">MENGAPA KAMI</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Keunggulan{' '}
          <span className="text-gradient">PT Sopiak Satria Saga</span>
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`}>
          Kami hadir dengan standar layanan keamanan tertinggi yang didukung oleh teknologi modern dan personil profesional.
        </p>
        <div className="why-grid">
          {WHY_REASONS.map((r, i) => (
            <div key={i} className={`why-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.1 + i * .07}s` }}>
              <div className="why-card-top">
                <div className="why-num">{r.num}</div>
                <div className="why-icon">
                  <r.Icon size={20} color="#00B4D8" strokeWidth={1.8} />
                </div>
              </div>
              <h3>{r.title}</h3>
              <p>{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
