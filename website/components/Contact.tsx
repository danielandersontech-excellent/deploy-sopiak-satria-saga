'use client'
import { MapPin, Phone, Mail, Clock, Send, ExternalLink, MessageCircle, Loader2 } from 'lucide-react'
import { useInView } from '@/hooks/useInView'
import { COMPANY, SERVICES } from '@/lib/data'
import { useState } from 'react'

export default function Contact() {
  const { ref, inView } = useInView()

  // State untuk form konsultasi
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    service: '',
    message: ''
  })
  // Anti dobel-klik/dobel-submit (Enter ganda dsb) — form ini tidak memanggil
  // API backend (langsung membuka WhatsApp), tapi tetap dikunci sesaat agar
  // tombol tidak membuka beberapa tab WhatsApp saat diklik berkali-kali.
  const [sending, setSending] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // Fungsi untuk form konsultasi (data lengkap)
  const handleConsultationSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    setSending(true)

    const message = `
*Konsultasi Keamanan - PT Sopiak Satria Saga*

*Nama:* ${formData.name || '(tidak diisi)'}
*Perusahaan:* ${formData.company || '(tidak diisi)'}
*Email:* ${formData.email || '(tidak diisi)'}
*Telepon:* ${formData.phone || '(tidak diisi)'}
*Layanan Diminati:* ${formData.service || '(tidak dipilih)'}

*Pesan:*
${formData.message || 'Tidak ada pesan tambahan'}

---
Pesan ini dikirim melalui form konsultasi website.
    `.trim()

    const encodedMsg = encodeURIComponent(message)
    window.open(`https://wa.me/${COMPANY.whatsapp}?text=${encodedMsg}`, '_blank')
    setTimeout(() => setSending(false), 1200)
  }

  // Fungsi untuk WhatsApp card (langsung chat dengan pesan singkat)
  const handleWhatsAppCard = () => {
    const message = `Halo, saya tertarik dengan layanan keamanan PT Sopiak Satria Saga. Bisa minta informasinya?`
    const encodedMsg = encodeURIComponent(message)
    window.open(`https://wa.me/${COMPANY.whatsapp}?text=${encodedMsg}`, '_blank')
  }

  return (
    <section id="kontak" ref={ref} className="contact-section">
      <div className="container">
        {/* Header */}
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
          <div className={`reveal ${inView ? 'visible' : ''}`}>
            <div className="section-label centered">HUBUNGI KAMI</div>
          </div>
          <h2 className={`section-title reveal ${inView ? 'visible' : ''} d1`} style={{ textAlign: 'center' }}>
            Mari Diskusikan Kebutuhan{' '}
            <span className="text-gradient">Keamanan Anda</span>
          </h2>
          <p className={`section-desc reveal ${inView ? 'visible' : ''} d2`} style={{ margin: '0 auto', textAlign: 'center' }}>
            Hubungi kami melalui cara yang paling nyaman bagi Anda.
          </p>
        </div>

        {/* 4 Contact Cards */}
        <div className={`contact-cards-grid reveal ${inView ? 'visible' : ''} d2`}>
          {/* Address Card */}
          <a href={COMPANY.mapsUrl} target="_blank" rel="noopener noreferrer" className="glass-card" style={{
            padding: '24px 20px', textDecoration: 'none', color: 'inherit', display: 'block',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <MapPin size={20} color="var(--red)" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Kantor Pusat</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
              {COMPANY.address}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
              Buka di Google Maps <ExternalLink size={11} />
            </div>
          </a>

          {/* Phone Card */}
          <a href={`tel:${COMPANY.phones[0].replace(/-/g, '')}`} className="glass-card" style={{
            padding: '24px 20px', textDecoration: 'none', color: 'inherit', display: 'block',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(0,180,216,.08)', border: '1px solid rgba(0,180,216,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Phone size={20} color="var(--cyan)" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Telepon</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>{COMPANY.phones[0]}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>{COMPANY.phones[1]}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--cyan)' }}>
              Telepon Sekarang <ExternalLink size={11} />
            </div>
          </a>

          {/* WhatsApp Card */}
          <div
            onClick={handleWhatsAppCard}
            className="glass-card"
            style={{
              padding: '24px 20px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
              cursor: 'pointer'
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <MessageCircle size={20} color="var(--whatsapp)" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>WhatsApp</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
              Chat langsung dengan tim kami. Respon cepat!
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--whatsapp)' }}>
              Chat via WhatsApp <ExternalLink size={11} />
            </div>
          </div>

          {/* Email Card */}
          <a href={`mailto:${COMPANY.email}`} className="glass-card" style={{
            padding: '24px 20px', textDecoration: 'none', color: 'inherit', display: 'block',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Mail size={20} color="var(--purple)" strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Email</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12, wordBreak: 'break-all' }}>
              {COMPANY.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--purple)' }}>
              Kirim Email <ExternalLink size={11} />
            </div>
          </a>
        </div>

        {/* Map + Form */}
        <div className="contact-grid">
          {/* Google Maps Embed */}
          <div className={`reveal ${inView ? 'visible' : ''} d3`}>
            <div style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 18,
              overflow: 'hidden',
              height: '100%',
              minHeight: 440,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MapPin size={15} color="var(--cyan)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Lokasi Kantor</span>
                </div>
                <a
                  href={COMPANY.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11.5, fontWeight: 600, color: 'var(--cyan)',
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 7,
                    background: 'rgba(0,180,216,.06)', border: '1px solid rgba(0,180,216,.1)',
                  }}
                >
                  Buka Maps <ExternalLink size={10} />
                </a>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <iframe
                  src={`https://www.google.com/maps?q=Komplek+Paninsula+Jl+Tuanku+Tambusai+Pekanbaru+Riau&output=embed`}
                  width="100%"
                  height="100%"
                  style={{
                    border: 0,
                    position: 'absolute',
                    inset: 0,
                    filter: 'invert(90%) hue-rotate(180deg) brightness(1.05) contrast(.85) saturate(.25)',
                  }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Lokasi PT Sopiak Satria Saga"
                />
                {/* Location overlay card */}
                <a
                  href={COMPANY.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    bottom: 14, left: 14, right: 14,
                    background: 'rgba(10,15,28,.92)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <MapPin size={15} color="var(--red)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 1 }}>PT Sopiak Satria Saga</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Komplek Paninsula, Jl. Tuanku Tambusai Blok C4-4
                    </div>
                  </div>
                  <ExternalLink size={13} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                </a>
              </div>
            </div>
          </div>

          {/* Form Konsultasi - INI YANG DIPERBAIKI (hapus defaultValue) */}
          <form onSubmit={handleConsultationSubmit} className={`contact-form reveal ${inView ? 'visible' : ''} d4`}>
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                Konsultasi Gratis
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                Isi form berikut, kami akan menghubungi Anda segera.
              </p>
            </div>
            <div className="form-row-2">
              <div className="form-field">
                <label className="form-label" htmlFor="contact-name">Nama Lengkap *</label>
                <input
                  id="contact-name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="contact-company">Perusahaan (opsional)</label>
                <input
                  id="contact-company"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-field">
                <label className="form-label" htmlFor="contact-email">Email *</label>
                <input
                  id="contact-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="contact-phone">No. Telepon *</label>
                <input
                  id="contact-phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="0812xxxxxxxx"
                  required
                  className="form-input"
                />
              </div>
            </div>
            {/* INI YANG DIPERBAIKI - TIDAK ADA defaultValue */}
            <div className="form-field">
              <label className="form-label" htmlFor="contact-service">Layanan yang Diminati</label>
              <select
                id="contact-service"
                name="service"
                value={formData.service}
                onChange={handleChange}
                className="form-input"
              >
                <option value="" disabled>Pilih Layanan yang Diminati</option>
                {SERVICES.map(s => <option key={s.slug} value={s.title}>{s.title}</option>)}
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="contact-message">Pesan (opsional)</label>
              <textarea
                id="contact-message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Ceritakan kebutuhan keamanan Anda..."
                rows={4}
                className="form-input"
                style={{ resize: 'vertical' }}
              />
            </div>
            <button type="submit" className="form-submit" disabled={sending}>
              {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              <span>{sending ? 'Mengirim...' : 'Kirim Pesan'}</span>
            </button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11.5, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Clock size={11} /> {COMPANY.operationalHours}
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}