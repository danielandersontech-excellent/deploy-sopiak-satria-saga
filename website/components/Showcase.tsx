'use client'
import { useInView } from '@/hooks/useInView'
import { APP_FEATURES } from '@/lib/data'

export default function Showcase() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="showcase-section">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">FITUR APLIKASI</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Semua yang Dibutuhkan{' '}
          <span className="text-gradient">Dalam Satu Aplikasi</span>
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`}>
          Platform digital terintegrasi yang mempermudah pengelolaan seluruh operasional keamanan.
        </p>
        <div className="show-grid">
          {APP_FEATURES.map((f, i) => (
            <div key={i} className={`show-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.1 + i * .06}s` }}>
              <div className="show-card-inner">
                <div
                  className="show-icon"
                  style={{ background: `${f.color}10`, border: `1px solid ${f.color}18` }}
                >
                  <f.Icon size={22} color={f.color} strokeWidth={1.8} />
                </div>
                <div>
                  <div className="show-num" style={{ color: f.color }}>{String(i + 1).padStart(2, '0')}</div>
                  <h3>{f.title}</h3>
                </div>
              </div>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
