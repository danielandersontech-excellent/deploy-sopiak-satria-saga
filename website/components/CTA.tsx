'use client'
import { MessageCircle, Phone } from 'lucide-react'
import { useInView } from '@/hooks/useInView'
import { COMPANY } from '@/lib/data'

export default function CTA() {
  const { ref, inView } = useInView()

  const handleWhatsAppCTA = () => {
    const message = `Halo tim PT Sopiak Satria Saga,

Saya tertarik dengan layanan keamanan Anda dan ingin berkonsultasi lebih lanjut.

Mohon informasinya. Terima kasih.`
    
    const encodedMsg = encodeURIComponent(message)
    window.open(`https://wa.me/${COMPANY.whatsapp}?text=${encodedMsg}`, '_blank')
  }

  const handlePhoneCall = () => {
    window.location.href = `tel:${COMPANY.phones[0].replace(/-/g, '')}`
  }

  return (
    <section ref={ref} className="cta-section">
      <div className="cta-glow-ring" />
      <div
        className={`reveal ${inView ? 'visible' : ''}`}
        style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 620, margin: '0 auto', padding: '0 24px' }}
      >
        <div className="section-label" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 1.5, background: 'linear-gradient(90deg, transparent, var(--cyan))' }} />
            MULAI SEKARANG
          </span>
        </div>
        <h2 style={{
          fontFamily: 'var(--font-head)',
          fontSize: 'clamp(30px, 4.5vw, 44px)',
          fontWeight: 800,
          color: '#fff',
          marginBottom: 18,
          letterSpacing: '-1px',
          lineHeight: 1.12,
        }}>
          Siap Meningkatkan{' '}
          <span className="text-gradient">Keamanan Anda?</span>
        </h2>
        <p style={{ fontSize: 16.5, color: 'var(--text-muted)', marginBottom: 40, lineHeight: 1.8 }}>
          Konsultasi GRATIS dengan tim ahli kami. Dapatkan solusi keamanan yang disesuaikan dengan kebutuhan Anda.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleWhatsAppCTA}
            className="btn-whatsapp"
            style={{
              background: 'linear-gradient(135deg, #25D366, #128C7E)',
              border: 'none',
              padding: '12px 28px',
              borderRadius: 40,
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              boxShadow: '0 10px 20px -8px rgba(37,211,102,0.3)',
              transition: 'transform .2s, box-shadow .2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 15px 25px -8px rgba(37,211,102,0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 10px 20px -8px rgba(37,211,102,0.3)'
            }}
          >
            <MessageCircle size={18} />
            <span>WhatsApp Kami</span>
          </button>
          <button
            onClick={handlePhoneCall}
            className="btn-outline-light"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '12px 28px',
              borderRadius: 40,
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              transition: 'background .2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <Phone size={16} />
            <span>Telepon Sekarang</span>
          </button>
        </div>
      </div>
    </section>
  )
}