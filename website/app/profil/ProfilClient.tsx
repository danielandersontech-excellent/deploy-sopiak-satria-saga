'use client'
import Link from 'next/link'
import {
  Quote, ArrowRight, CheckCircle2, MessageCircle, Eye, Rocket,
  Building2, Network,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { useInView } from '@/hooks/useInView'
import {
  COMPANY, PROFILE, COMPANY_VALUES, SERVICE_SCOPE, MONITORING_PILLARS,
  LEGALITAS, DIVISIONS, WORKFLOW, SECTORS,
} from '@/lib/data'

/* Setiap section punya observer sendiri agar animasi reveal berjalan
   saat discroll — mengikuti pola komponen beranda (useInView). */

function SectionAbout() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">TENTANG KAMI</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Perusahaan Jasa Pengamanan{' '}
          <span className="text-gradient">Terintegrasi</span>
        </h2>
        <div className="pf-about-grid">
          <div className={`reveal ${inView ? 'visible' : ''} d2`}>
            <p className="pf-paragraph">{PROFILE.about1}</p>
            <p className="pf-paragraph">{PROFILE.about2}</p>
          </div>
          <blockquote className={`pf-quote-card reveal ${inView ? 'visible' : ''} d3`}>
            <Quote size={28} color="#D4A853" strokeWidth={1.6} />
            <p>&ldquo;{PROFILE.aboutQuote}&rdquo;</p>
            <cite>PT Sopiak Satria Saga</cite>
          </blockquote>
        </div>
      </div>
    </section>
  )
}

function SectionVisiMisi() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section pf-alt">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label" style={{ color: '#D4A853' }}>VISI &amp; MISI</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Arah &amp; Komitmen{' '}
          <span className="text-gradient-gold">Perusahaan</span>
        </h2>
        <div className="pf-vm-grid">
          <div className={`pf-visi-card reveal ${inView ? 'visible' : ''} d2`}>
            <div className="pf-vm-badge"><Eye size={18} color="#D4A853" strokeWidth={2} /> VISI</div>
            <p>&ldquo;{PROFILE.visi}&rdquo;</p>
          </div>
          <div className={`pf-misi-card reveal ${inView ? 'visible' : ''} d3`}>
            <div className="pf-vm-badge"><Rocket size={18} color="#00B4D8" strokeWidth={2} /> MISI</div>
            <ol className="pf-misi-list">
              {PROFILE.misi.map((m, i) => (
                <li key={i}>
                  <span className="pf-misi-num">{String(i + 1).padStart(2, '0')}</span>
                  <span>{m}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionValues() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">NILAI-NILAI PERUSAHAAN</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Lima Nilai yang{' '}
          <span className="text-gradient">Kami Pegang Teguh</span>
        </h2>
        <div className="pf-values-grid">
          {COMPANY_VALUES.map((v, i) => (
            <div key={v.title} className={`pf-value-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .08}s` }}>
              <div className="pf-value-icon">
                <v.Icon size={22} color="#D4A853" strokeWidth={1.8} />
              </div>
              <h3>{v.title}</h3>
              <p>{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionScope() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section pf-alt">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">RUANG LINGKUP LAYANAN</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Bidang Pengamanan{' '}
          <span className="text-gradient">yang Kami Tangani</span>
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`}>
          Dari penjagaan personel hingga respons darurat — cakupan layanan kami dirancang untuk kebutuhan keamanan di berbagai lini.
        </p>
        <div className="pf-scope-grid">
          {SERVICE_SCOPE.map((s, i) => (
            <div key={s.title} className={`pf-scope-chip reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .06}s` }}>
              <s.Icon size={20} color="#00B4D8" strokeWidth={1.8} />
              <span>{s.title}</span>
            </div>
          ))}
        </div>
        <div className={`pf-center reveal ${inView ? 'visible' : ''} d4`}>
          <Link href="/#layanan" className="pf-link-btn">
            Lihat Detail Setiap Layanan <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}

function SectionMonitoring() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">DIGITAL SECURITY MONITORING</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Standar Manajemen Keamanan{' '}
          <span className="text-gradient">Berbasis Teknologi</span>
        </h2>
        <div className="pf-pillar-grid">
          {MONITORING_PILLARS.map((p, i) => (
            <div key={p.title} className={`pf-pillar-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .1}s` }}>
              <div className="pf-pillar-icon">
                <p.Icon size={24} color="#00D4FF" strokeWidth={1.8} />
              </div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
        <div className={`pf-center reveal ${inView ? 'visible' : ''} d3`}>
          <Link href="/#teknologi" className="pf-link-btn">
            Jelajahi Ekosistem Teknologi Kami <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}

function SectionLegal() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section pf-alt">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label" style={{ color: '#D4A853' }}>LISENSI &amp; LEGALITAS</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Beroperasi{' '}
          <span className="text-gradient-gold">Resmi &amp; Berizin Penuh</span>
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`}>
          Legalitas lengkap adalah dasar kepercayaan. Seluruh izin, keanggotaan, dan sertifikasi kami terpenuhi sesuai regulasi.
        </p>
        <div className="pf-legal-grid">
          {LEGALITAS.map((l, i) => (
            <div key={l.title} className={`pf-legal-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .07}s` }}>
              <div className="pf-legal-icon">
                <l.Icon size={20} color="#00C896" strokeWidth={1.9} />
              </div>
              <div>
                <div className="pf-legal-title">
                  {l.title} <CheckCircle2 size={14} color="#00C896" strokeWidth={2.2} />
                </div>
                <div className="pf-legal-full">{l.full}</div>
                <p>{l.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionManajemen() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section">
      <div className="container">
        <div className="pf-mgmt-grid">
          <div>
            <div className={`reveal ${inView ? 'visible' : ''}`}>
              <div className="section-label">PROFIL MANAJEMEN</div>
            </div>
            <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`} style={{ marginBottom: 20 }}>
              Dikelola Tim{' '}
              <span className="text-gradient">Profesional</span>
            </h2>
            <p className={`pf-paragraph reveal ${inView ? 'visible' : ''} d2`}>{PROFILE.managemen}</p>
          </div>
          <div className={`pf-org-card reveal ${inView ? 'visible' : ''} d3`}>
            <div className="pf-org-head">
              <Network size={18} color="#00B4D8" strokeWidth={2} />
              <span>Struktur Organisasi</span>
            </div>
            <div className="pf-org-sub">Divisi Operasional &amp; Pendukung</div>
            <div className="pf-div-grid">
              {DIVISIONS.map((d) => (
                <div key={d.title} className="pf-div-chip">
                  <d.Icon size={16} color="#7C8DB5" strokeWidth={1.9} />
                  <span>{d.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SectionWorkflow() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section pf-alt">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">ALUR KERJA OPERASIONAL</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Tujuh Tahap{' '}
          <span className="text-gradient">Proses Kerja Kami</span>
        </h2>
        <div className="pf-flow">
          {WORKFLOW.map((w, i) => (
            <div key={i} className={`pf-flow-item reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.12 + i * .07}s` }}>
              <div className="pf-flow-rail">
                <div className="pf-flow-num">{String(i + 1).padStart(2, '0')}</div>
                {i < WORKFLOW.length - 1 && <div className="pf-flow-line" />}
              </div>
              <div className="pf-flow-body">
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={`pf-flow-tagline reveal ${inView ? 'visible' : ''} d4`}>
          <span className="text-gradient-gold">{PROFILE.workflowTagline}</span>
        </div>
      </div>
    </section>
  )
}

function SectionSectors() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section">
      <div className="container">
        <div className={`reveal ${inView ? 'visible' : ''}`}>
          <div className="section-label">REFERENSI &amp; KEMITRAAN</div>
        </div>
        <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`}>
          Sektor yang{' '}
          <span className="text-gradient">Kami Layani</span>
        </h2>
        <p className={`pf-partner-quote reveal ${inView ? 'visible' : ''} d2`}>
          &ldquo;{PROFILE.partnershipQuote}&rdquo;
        </p>
        <div className="pf-sector-grid">
          {SECTORS.map((s, i) => (
            <div key={s.title} className={`pf-sector-card reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .07}s` }}>
              <s.Icon size={22} color="#00B4D8" strokeWidth={1.8} />
              <span>{s.title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionClosing() {
  const { ref, inView } = useInView()
  const wa = `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent('Halo, saya ingin berkonsultasi tentang layanan pengamanan PT Sopiak Satria Saga.')}`
  return (
    <section ref={ref} className="pf-closing">
      <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <h2 className={`pf-closing-title reveal ${inView ? 'visible' : ''}`}>
          &ldquo;<span className="text-gradient-gold">{PROFILE.closingTagline}</span>&rdquo;
        </h2>
        <p className={`section-desc reveal ${inView ? 'visible' : ''} d1`} style={{ margin: '0 auto 36px', textAlign: 'center' }}>
          Diskusikan kebutuhan keamanan Anda bersama tim kami — konsultasi awal tanpa biaya.
        </p>
        <div className={`pf-closing-actions reveal ${inView ? 'visible' : ''} d2`}>
          <Link href="/#kontak" className="btn-primary">
            Konsultasi Sekarang <ArrowRight size={17} />
          </Link>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="pf-link-btn">
            <MessageCircle size={17} /> Chat WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}

export default function ProfilClient() {
  return (
    <>
      <Navbar />

      {/* Hero Profil */}
      <section className="pf-hero">
        <div className="pf-hero-orb pf-hero-orb-1" />
        <div className="pf-hero-orb pf-hero-orb-2" />
        <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
          <div className="pf-hero-label">
            <Building2 size={14} strokeWidth={2} /> COMPANY PROFILE
          </div>
          <h1 className="pf-hero-title">
            Profil <span className="text-gradient-gold">PT Sopiak Satria Saga</span>
          </h1>
          <p className="pf-hero-tagline">&ldquo;{PROFILE.heroTagline}&rdquo;</p>
          <div className="pf-hero-chips">
            <span className="pf-hero-chip"><CheckCircle2 size={14} color="#00C896" /> Berizin BUJP</span>
            <span className="pf-hero-chip"><CheckCircle2 size={14} color="#00C896" /> Anggota ABIJAPI</span>
            <span className="pf-hero-chip"><CheckCircle2 size={14} color="#00C896" /> Monitoring Digital 24/7</span>
          </div>
        </div>
      </section>

      <SectionAbout />
      <SectionVisiMisi />
      <SectionValues />
      <SectionScope />
      <SectionMonitoring />
      <SectionLegal />
      <SectionManajemen />
      <SectionWorkflow />
      <SectionSectors />
      <SectionClosing />

      <Footer />
    </>
  )
}
