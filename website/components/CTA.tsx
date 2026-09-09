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
      <div className={`cta-inner reveal ${inView ? 'visible' : ''}`}>
        <div className="section-label centered" style={{ marginBottom: 24 }}>MULAI SEKARANG</div>
        <h2 className="section-title" style={{ textAlign: 'center', fontSize: 'clamp(30px, 4.5vw, 44px)' }}>
          Siap Meningkatkan{' '}
          <span className="text-gradient">Keamanan Anda?</span>
        </h2>
        <p className="section-desc" style={{ margin: '0 auto 40px', textAlign: 'center' }}>
          Konsultasi GRATIS dengan tim ahli kami. Dapatkan solusi keamanan yang disesuaikan dengan kebutuhan Anda.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleWhatsAppCTA} className="btn-whatsapp">
            <MessageCircle size={18} />
            <span>WhatsApp Kami</span>
          </button>
          <button onClick={handlePhoneCall} className="btn-outline-light">
            <Phone size={16} />
            <span>Telepon Sekarang</span>
          </button>
        </div>
      </div>
    </section>
  )
}