'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Briefcase, CheckCircle2, XCircle, UploadCloud, FileText, Trash2, Send, Copy,
  Search, ShieldCheck, ArrowRight, AlertTriangle, Loader2, ClipboardCheck,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { useInView } from '@/hooks/useInView'
import { COMPANY, KARIR_POSISI, KARIR_SYARAT, KARIR_BENEFIT, KARIR_LANGKAH } from '@/lib/data'
import { API_URL } from '@/lib/config'

/* ══════════════════════════════════════════════════════════════
   [Rekrutmen] Formulir lamaran publik.
   - Validasi langsung (live): NIK 16 digit, nomor HP, email, wajib isi.
   - 7 slot berkas (JPG/PNG/PDF, ≤ 5 MB per file): foto, ktp, ijazah, skck wajib;
     kk, cv, sertifikat opsional.
   - Tombol kirim nonaktif saat mengirim / formulir belum valid.
   - Honeypot: input "website" tersembunyi — manusia tidak mengisinya.
   - Idempotency key acak per pemuatan formulir → klik ganda / retry jaringan
     tidak membuat lamaran ganda di server.
   - Pesan ramah untuk 409 (NIK sudah terdaftar) dan 429 (terlalu sering).
   ══════════════════════════════════════════════════════════════ */

const MAX_FILE = 5 * 1024 * 1024
const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf']

type Slot = 'foto' | 'ktp' | 'kk' | 'ijazah' | 'skck' | 'cv' | 'sertifikat'
const SLOTS: { key: Slot; label: string; wajib: boolean; hint: string }[] = [
  { key: 'foto', label: 'Pas Foto', wajib: true, hint: 'Foto formal terbaru, JPG/PNG' },
  { key: 'ktp', label: 'KTP', wajib: true, hint: 'Scan/foto KTP yang masih berlaku' },
  { key: 'ijazah', label: 'Ijazah Terakhir', wajib: true, hint: 'JPG/PNG/PDF' },
  { key: 'skck', label: 'SKCK', wajib: true, hint: 'SKCK aktif dari kepolisian' },
  { key: 'kk', label: 'Kartu Keluarga', wajib: false, hint: 'Opsional' },
  { key: 'cv', label: 'CV / Riwayat Hidup', wajib: false, hint: 'Opsional, PDF disarankan' },
  { key: 'sertifikat', label: 'Sertifikat Satpam / Pelatihan', wajib: false, hint: 'Opsional (Gada Pratama, dll.)' },
]

const PENDIDIKAN = ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2']

type FormState = {
  nama: string; nik: string; jenis_kelamin: 'L' | 'P'; tempat_lahir: string; tanggal_lahir: string
  no_hp: string; email: string; alamat: string; pendidikan: string; tinggi_badan: string; berat_badan: string
  posisi_dilamar: 'anggota' | 'komandan'; lokasi_preferensi: string; pengalaman: string; catatan: string
  setuju: boolean; website: string
}

const EMPTY: FormState = {
  nama: '', nik: '', jenis_kelamin: 'L', tempat_lahir: '', tanggal_lahir: '',
  no_hp: '', email: '', alamat: '', pendidikan: 'SMA/SMK', tinggi_badan: '', berat_badan: '',
  posisi_dilamar: 'anggota', lokasi_preferensi: '', pengalaman: '', catatan: '',
  setuju: false, website: '',
}

type Sukses = { nomor_referensi: string; nama?: string; status?: string; created_at?: string }

function hitungUmur(tgl: string): number | null {
  if (!tgl || isNaN(Date.parse(tgl))) return null
  return (Date.now() - Date.parse(tgl)) / (365.25 * 24 * 3600 * 1000)
}

function normalisasiHp(raw: string): string {
  let s = raw.replace(/[\s\-().]/g, '')
  if (s.startsWith('+62')) s = '0' + s.slice(3)
  else if (s.startsWith('62')) s = '0' + s.slice(2)
  return s
}

function validasi(f: FormState, files: Partial<Record<Slot, File>>): Record<string, string> {
  const e: Record<string, string> = {}
  if (f.nama.trim().length < 3) e.nama = 'Nama lengkap minimal 3 karakter'
  if (!/^[0-9]{16}$/.test(f.nik)) e.nik = 'NIK harus tepat 16 digit angka'
  const hp = normalisasiHp(f.no_hp)
  if (!/^08[0-9]{7,12}$/.test(hp)) e.no_hp = 'Nomor HP tidak valid (contoh: 0812xxxxxxxx)'
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) e.email = 'Format email tidak valid'
  const umur = hitungUmur(f.tanggal_lahir)
  if (umur === null) e.tanggal_lahir = 'Tanggal lahir wajib diisi'
  else if (umur < 18 || umur > 55) e.tanggal_lahir = 'Usia pelamar harus 18–55 tahun'
  if (f.alamat.trim().length < 10) e.alamat = 'Alamat minimal 10 karakter'
  if (!PENDIDIKAN.includes(f.pendidikan)) e.pendidikan = 'Pilih pendidikan terakhir'
  if (f.tinggi_badan) { const n = Number(f.tinggi_badan); if (!Number.isInteger(n) || n < 100 || n > 250) e.tinggi_badan = '100–250 cm' }
  if (f.berat_badan) { const n = Number(f.berat_badan); if (!Number.isInteger(n) || n < 30 || n > 200) e.berat_badan = '30–200 kg' }
  for (const s of SLOTS) if (s.wajib && !files[s.key]) e[`berkas_${s.key}`] = `${s.label} wajib diunggah`
  if (!f.setuju) e.setuju = 'Centang pernyataan kebenaran data'
  return e
}

function fmtSize(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(n / 1024)} KB`
}

function fmtTanggal(s?: string) {
  if (!s) return '-'
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return s }
}

const STATUS_LABEL: Record<string, string> = {
  baru: 'Diterima sistem — menunggu peninjauan',
  diproses: 'Sedang diproses oleh tim HR',
  wawancara: 'Dipanggil wawancara — tim kami akan menghubungi Anda',
  diterima: 'Diterima — selamat bergabung!',
  ditolak: 'Belum dapat kami terima saat ini',
  dibatalkan: 'Dibatalkan',
}

function SectionInfo() {
  const { ref, inView } = useInView()
  return (
    <section ref={ref} className="pf-section">
      <div className="container">
        <div className="kr-info-grid">
          <div className={`reveal ${inView ? 'visible' : ''}`}>
            <div className="section-label">POSISI DIBUKA</div>
            <h2 className="section-title" style={{ fontSize: 'clamp(26px, 3.4vw, 38px)' }}>
              Bergabung Bersama <span className="text-gradient">Tim Profesional</span>
            </h2>
            <p className="pf-paragraph">
              Kami membuka kesempatan bagi Anda yang disiplin, berintegritas, dan siap bekerja dengan dukungan
              sistem monitoring digital. Seluruh proses seleksi transparan dan tanpa biaya apa pun.
            </p>
            <div className="kr-posisi-list">
              {KARIR_POSISI.map((p) => (
                <div key={p.kode} className="kr-posisi-card">
                  <div className="kr-posisi-icon"><p.Icon size={22} color="var(--cyan)" strokeWidth={1.8} /></div>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`kr-syarat-card reveal ${inView ? 'visible' : ''} d2`}>
            <div className="pf-org-head"><ShieldCheck size={18} color="var(--green)" strokeWidth={2} /><span>Persyaratan Umum</span></div>
            <ul className="kr-syarat-list">
              {KARIR_SYARAT.map((s) => (
                <li key={s}><CheckCircle2 size={15} color="var(--green)" strokeWidth={2.2} /><span>{s}</span></li>
              ))}
            </ul>
            <div className="pf-org-sub" style={{ marginTop: 20, marginBottom: 12 }}>Yang Anda Dapatkan</div>
            <div className="kr-benefit-grid">
              {KARIR_BENEFIT.map((b) => (
                <div key={b.title} className="pf-div-chip"><b.Icon size={15} color="var(--gold)" strokeWidth={1.9} /><span>{b.title}</span></div>
              ))}
            </div>
          </div>
        </div>
        <div className="kr-langkah">
          {KARIR_LANGKAH.map((l, i) => (
            <div key={l.title} className={`kr-langkah-item reveal ${inView ? 'visible' : ''}`} style={{ transitionDelay: `${.15 + i * .08}s` }}>
              <div className="kr-langkah-num">{String(i + 1).padStart(2, '0')}</div>
              <div><h4>{l.title}</h4><p>{l.desc}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CekStatus() {
  const [nomor, setNomor] = useState('')
  const [nik, setNik] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil] = useState<{ nomor_referensi: string; nama: string; status: string; posisi_dilamar: string; created_at: string; updated_at: string } | null>(null)
  const [err, setErr] = useState('')
  const valid = /^REK-\d{8}-[A-Za-z0-9]{5}$/.test(nomor.trim()) && /^[0-9]{16}$/.test(nik)

  const cek = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || loading) return
    setLoading(true); setErr(''); setHasil(null)
    try {
      const res = await fetch(`${API_URL}/api/rekrutmen/publik/status?nomor=${encodeURIComponent(nomor.trim().toUpperCase())}&nik=${encodeURIComponent(nik)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || (res.status === 429 ? 'Terlalu banyak percobaan. Coba lagi beberapa menit.' : 'Gagal memeriksa status'))
      setHasil(data)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Gagal memeriksa status')
    } finally { setLoading(false) }
  }

  return (
    <section id="cek-status" className="pf-section pf-alt">
      <div className="container">
        <div className="kr-cek-card">
          <div>
            <div className="section-label">CEK STATUS LAMARAN</div>
            <h2 className="section-title" style={{ fontSize: 'clamp(22px, 3vw, 30px)' }}>Sudah mendaftar?</h2>
            <p className="pf-paragraph" style={{ marginBottom: 0 }}>
              Masukkan nomor referensi yang Anda terima saat mendaftar beserta NIK untuk melihat perkembangan lamaran.
            </p>
          </div>
          <form onSubmit={cek} className="kr-cek-form" noValidate>
            <input className="form-input" placeholder="Nomor referensi (REK-YYYYMMDD-XXXXX)" value={nomor} onChange={(e) => setNomor(e.target.value)} autoComplete="off" />
            <input className="form-input" placeholder="NIK 16 digit" inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, '').slice(0, 16))} autoComplete="off" />
            <button type="submit" className="form-submit" disabled={!valid || loading} style={{ marginTop: 2 }}>
              {loading ? <Loader2 size={16} className="kr-spin" /> : <Search size={16} />}<span>{loading ? 'Memeriksa...' : 'Cek Status'}</span>
            </button>
            {err && <div className="kr-alert kr-alert-danger"><AlertTriangle size={15} /> {err}</div>}
            {hasil && (
              <div className="kr-alert kr-alert-ok">
                <ClipboardCheck size={16} />
                <div>
                  <strong>{hasil.nama}</strong> · {hasil.nomor_referensi}<br />
                  Status: <strong>{STATUS_LABEL[hasil.status] || hasil.status}</strong><br />
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Didaftarkan {fmtTanggal(hasil.created_at)} · Diperbarui {fmtTanggal(hasil.updated_at)}</span>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}

export default function KarirClient() {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({})
  const [fileErr, setFileErr] = useState<Partial<Record<Slot, string>>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverErr, setServerErr] = useState<{ msg: string; details?: string[]; kind: 'error' | 'warn' } | null>(null)
  const [sukses, setSukses] = useState<Sukses | null>(null)
  const [copied, setCopied] = useState(false)
  const idemRef = useRef<string>('')
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Satu key per pemuatan formulir. Diganti setelah lamaran sukses agar
    // pendaftaran pelamar berikutnya dari perangkat yang sama tidak dianggap duplikat.
    if (!idemRef.current) {
      idemRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    }
  }, [])

  const errors = useMemo(() => validasi(form, files), [form, files])
  const adaFileErr = Object.values(fileErr).some(Boolean)
  const valid = Object.keys(errors).length === 0 && !adaFileErr

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))
  const showErr = (k: string) => (touched[k] || touched.__all) && errors[k]

  const pilihFile = (slot: Slot, file: File | null) => {
    if (!file) { setFiles((f) => { const n = { ...f }; delete n[slot]; return n }); setFileErr((e) => ({ ...e, [slot]: undefined })); return }
    let msg = ''
    if (!ALLOWED_MIME.includes(file.type)) msg = 'Hanya JPG, PNG, atau PDF'
    else if (file.size > MAX_FILE) msg = `Ukuran ${fmtSize(file.size)} melebihi batas 5 MB`
    if (msg) { setFileErr((e) => ({ ...e, [slot]: msg })); setFiles((f) => { const n = { ...f }; delete n[slot]; return n }); return }
    setFileErr((e) => ({ ...e, [slot]: undefined }))
    setFiles((f) => ({ ...f, [slot]: file }))
  }

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ __all: true })
    setServerErr(null)
    if (!valid || submitting) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      const fields: (keyof FormState)[] = ['nama', 'nik', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'no_hp', 'email', 'alamat', 'pendidikan', 'tinggi_badan', 'berat_badan', 'posisi_dilamar', 'lokasi_preferensi', 'pengalaman', 'catatan', 'website']
      for (const k of fields) fd.append(k, k === 'no_hp' ? normalisasiHp(form.no_hp) : String(form[k] ?? ''))
      fd.append('idempotency_key', idemRef.current)
      for (const s of SLOTS) { const f = files[s.key]; if (f) fd.append(s.key, f, f.name) }

      const res = await fetch(`${API_URL}/api/rekrutmen/publik`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.status === 201) {
        setSukses(data)
        idemRef.current = ''
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      if (res.status === 409) { setServerErr({ kind: 'warn', msg: data.error || 'NIK sudah terdaftar. Gunakan Cek Status untuk melihat lamaran Anda.' }); return }
      if (res.status === 429) { setServerErr({ kind: 'warn', msg: data.error || 'Terlalu banyak percobaan dari jaringan Anda. Silakan coba lagi dalam 15 menit.' }); return }
      if (res.status === 400) { setServerErr({ kind: 'error', msg: data.error || 'Data belum lengkap', details: Array.isArray(data.details) ? data.details : undefined }); return }
      if (res.status === 413) { setServerErr({ kind: 'error', msg: 'Ukuran total berkas terlalu besar. Kecilkan ukuran foto/PDF Anda.' }); return }
      setServerErr({ kind: 'error', msg: data.error || `Gagal mengirim lamaran (HTTP ${res.status}). Coba lagi beberapa saat.` })
    } catch {
      setServerErr({ kind: 'error', msg: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.' })
    } finally {
      setSubmitting(false)
    }
  }

  const salinNomor = async () => {
    if (!sukses) return
    try { await navigator.clipboard.writeText(sukses.nomor_referensi); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard tidak tersedia */ }
  }

  const ulang = () => {
    setSukses(null); setForm(EMPTY); setFiles({}); setFileErr({}); setTouched({}); setServerErr(null)
    idemRef.current = ''
    // effect di atas tidak berjalan ulang; buat key baru langsung
    idemRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  return (
    <>
      <Navbar />

      <section className="pf-hero">
        <div className="pf-hero-orb pf-hero-orb-1" />
        <div className="pf-hero-orb pf-hero-orb-2" />
        <div className="container pf-hero-inner">
          <div className="pf-hero-label"><Briefcase size={14} strokeWidth={2} /> KARIR &amp; REKRUTMEN</div>
          <h1 className="pf-hero-title">
            Wujudkan Karir Anda di <span className="text-gradient-gold">Bidang Keamanan</span>
          </h1>
          <p className="pf-hero-tagline">
            Pendaftaran online, proses seleksi transparan, tanpa pungutan biaya. Isi formulir di bawah dan simpan nomor referensi Anda.
          </p>
          <div className="pf-hero-chips">
            <span className="pf-hero-chip"><CheckCircle2 size={14} color="var(--green)" /> Tanpa Biaya Pendaftaran</span>
            <span className="pf-hero-chip"><CheckCircle2 size={14} color="var(--green)" /> Pelatihan &amp; Sertifikasi</span>
            <span className="pf-hero-chip"><CheckCircle2 size={14} color="var(--green)" /> BPJS Ketenagakerjaan</span>
          </div>
          <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#formulir" className="btn-primary">Isi Formulir Lamaran <ArrowRight size={16} /></a>
            <a href="#cek-status" className="pf-link-btn"><Search size={16} /> Cek Status Lamaran</a>
          </div>
        </div>
      </section>

      {sukses ? (
        <section className="pf-section" id="formulir">
          <div className="container">
            <div className="kr-success">
              <div className="kr-success-icon"><CheckCircle2 size={40} color="var(--green)" strokeWidth={2} /></div>
              <h2>Lamaran Berhasil Dikirim</h2>
              <p>Terima kasih{sukses.nama ? `, ${sukses.nama}` : ''}. Simpan nomor referensi berikut untuk memantau status lamaran Anda.</p>
              <div className="kr-ref">
                <code>{sukses.nomor_referensi}</code>
                <button type="button" onClick={salinNomor} className="pf-link-btn" style={{ padding: '10px 16px' }}>
                  <Copy size={15} /> {copied ? 'Tersalin' : 'Salin'}
                </button>
              </div>
              <div className="kr-success-note">
                <ShieldCheck size={16} color="var(--gold)" />
                <span>Tim HR kami akan meninjau berkas Anda. Kandidat yang lolos seleksi administrasi akan dihubungi melalui WhatsApp/telepon ke nomor yang Anda daftarkan. Kami tidak pernah meminta biaya dalam bentuk apa pun.</span>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
                <a href="#cek-status" className="btn-primary"><Search size={16} /> Cek Status Lamaran</a>
                <button type="button" onClick={ulang} className="pf-link-btn">Daftarkan Pelamar Lain</button>
                <Link href="/" className="pf-link-btn">Kembali ke Beranda</Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <SectionInfo />
          <section className="pf-section pf-alt" id="formulir">
            <div className="container" ref={formRef}>
              <div className="section-label">FORMULIR LAMARAN</div>
              <h2 className="section-title" style={{ fontSize: 'clamp(26px, 3.4vw, 38px)' }}>
                Lengkapi Data <span className="text-gradient">&amp; Berkas Anda</span>
              </h2>
              <p className="section-desc" style={{ marginBottom: 32 }}>
                Kolom bertanda * wajib diisi. Berkas dalam format JPG, PNG, atau PDF dengan ukuran maksimal 5 MB per file.
              </p>

              <form onSubmit={kirim} className="kr-form" noValidate>
                {/* Honeypot — tersembunyi dari pengguna, jangan diisi. */}
                <div className="kr-hp" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
                </div>

                <div className="kr-card">
                  <h3 className="kr-card-title">1. Data Diri</h3>
                  <div className="kr-grid-2">
                    <div className="kr-field">
                      <label>Nama Lengkap (sesuai KTP) *</label>
                      <input className="form-input" value={form.nama} onChange={(e) => set('nama', e.target.value)} onBlur={() => touch('nama')} maxLength={100} autoComplete="name" />
                      {showErr('nama') && <small className="kr-err">{errors.nama}</small>}
                    </div>
                    <div className="kr-field">
                      <label>NIK (16 digit) *</label>
                      <div className="kr-input-wrap">
                        <input className="form-input" inputMode="numeric" maxLength={16} value={form.nik}
                          onChange={(e) => set('nik', e.target.value.replace(/\D/g, '').slice(0, 16))} onBlur={() => touch('nik')} autoComplete="off" />
                        {form.nik.length > 0 && (
                          <span className={`kr-live ${/^[0-9]{16}$/.test(form.nik) ? 'ok' : 'bad'}`}>
                            {/^[0-9]{16}$/.test(form.nik) ? <CheckCircle2 size={16} /> : <span>{form.nik.length}/16</span>}
                          </span>
                        )}
                      </div>
                      {showErr('nik') && <small className="kr-err">{errors.nik}</small>}
                    </div>
                    <div className="kr-field">
                      <label>Jenis Kelamin *</label>
                      <div className="kr-chips">
                        {([['L', 'Laki-laki'], ['P', 'Perempuan']] as const).map(([v, l]) => (
                          <button type="button" key={v} className={`kr-chip ${form.jenis_kelamin === v ? 'active' : ''}`} onClick={() => set('jenis_kelamin', v)}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div className="kr-field">
                      <label>Posisi yang Dilamar *</label>
                      <select className="form-input" value={form.posisi_dilamar} onChange={(e) => set('posisi_dilamar', e.target.value as FormState['posisi_dilamar'])}>
                        <option value="anggota">Anggota Satpam</option>
                        <option value="komandan">Komandan Regu (Danru)</option>
                      </select>
                    </div>
                    <div className="kr-field">
                      <label>Tempat Lahir</label>
                      <input className="form-input" value={form.tempat_lahir} onChange={(e) => set('tempat_lahir', e.target.value)} maxLength={100} />
                    </div>
                    <div className="kr-field">
                      <label>Tanggal Lahir *</label>
                      <input className="form-input" type="date" value={form.tanggal_lahir} onChange={(e) => set('tanggal_lahir', e.target.value)} onBlur={() => touch('tanggal_lahir')} max={new Date().toISOString().slice(0, 10)} />
                      {showErr('tanggal_lahir') && <small className="kr-err">{errors.tanggal_lahir}</small>}
                    </div>
                  </div>
                </div>

                <div className="kr-card">
                  <h3 className="kr-card-title">2. Kontak &amp; Alamat</h3>
                  <div className="kr-grid-2">
                    <div className="kr-field">
                      <label>Nomor HP / WhatsApp *</label>
                      <div className="kr-input-wrap">
                        <input className="form-input" type="tel" inputMode="tel" value={form.no_hp} onChange={(e) => set('no_hp', e.target.value)} onBlur={() => touch('no_hp')} placeholder="0812xxxxxxxx" autoComplete="tel" maxLength={20} />
                        {form.no_hp.length > 0 && (
                          <span className={`kr-live ${/^08[0-9]{7,12}$/.test(normalisasiHp(form.no_hp)) ? 'ok' : 'bad'}`}>
                            {/^08[0-9]{7,12}$/.test(normalisasiHp(form.no_hp)) ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                          </span>
                        )}
                      </div>
                      {showErr('no_hp') && <small className="kr-err">{errors.no_hp}</small>}
                    </div>
                    <div className="kr-field">
                      <label>Email</label>
                      <input className="form-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={() => touch('email')} autoComplete="email" maxLength={100} />
                      {showErr('email') && <small className="kr-err">{errors.email}</small>}
                    </div>
                    <div className="kr-field kr-span-2">
                      <label>Alamat Domisili Lengkap *</label>
                      <textarea className="form-input" rows={3} value={form.alamat} onChange={(e) => set('alamat', e.target.value)} onBlur={() => touch('alamat')} maxLength={500} style={{ resize: 'vertical' }} />
                      {showErr('alamat') && <small className="kr-err">{errors.alamat}</small>}
                    </div>
                    <div className="kr-field kr-span-2">
                      <label>Preferensi Lokasi Penempatan</label>
                      <input className="form-input" value={form.lokasi_preferensi} onChange={(e) => set('lokasi_preferensi', e.target.value)} placeholder="Contoh: Pekanbaru kota, Duri, Perawang" maxLength={100} />
                    </div>
                  </div>
                </div>

                <div className="kr-card">
                  <h3 className="kr-card-title">3. Pendidikan, Fisik &amp; Pengalaman</h3>
                  <div className="kr-grid-3">
                    <div className="kr-field">
                      <label>Pendidikan Terakhir *</label>
                      <select className="form-input" value={form.pendidikan} onChange={(e) => set('pendidikan', e.target.value)}>
                        {PENDIDIKAN.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="kr-field">
                      <label>Tinggi Badan (cm)</label>
                      <input className="form-input" inputMode="numeric" value={form.tinggi_badan} onChange={(e) => set('tinggi_badan', e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => touch('tinggi_badan')} placeholder="mis. 170" />
                      {showErr('tinggi_badan') && <small className="kr-err">{errors.tinggi_badan}</small>}
                    </div>
                    <div className="kr-field">
                      <label>Berat Badan (kg)</label>
                      <input className="form-input" inputMode="numeric" value={form.berat_badan} onChange={(e) => set('berat_badan', e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => touch('berat_badan')} placeholder="mis. 65" />
                      {showErr('berat_badan') && <small className="kr-err">{errors.berat_badan}</small>}
                    </div>
                    <div className="kr-field kr-span-3">
                      <label>Pengalaman Kerja (opsional)</label>
                      <textarea className="form-input" rows={3} value={form.pengalaman} onChange={(e) => set('pengalaman', e.target.value)} placeholder="Ceritakan pengalaman kerja/keamanan Anda, sertifikat, atau pelatihan yang pernah diikuti" maxLength={2000} style={{ resize: 'vertical' }} />
                      <small className="kr-hint">{form.pengalaman.length}/2000</small>
                    </div>
                    <div className="kr-field kr-span-3">
                      <label>Catatan Tambahan (opsional)</label>
                      <textarea className="form-input" rows={2} value={form.catatan} onChange={(e) => set('catatan', e.target.value)} maxLength={1000} style={{ resize: 'vertical' }} />
                    </div>
                  </div>
                </div>

                <div className="kr-card">
                  <h3 className="kr-card-title">4. Berkas Lamaran <span className="kr-hint">JPG / PNG / PDF, maksimal 5 MB per file</span></h3>
                  <div className="kr-files">
                    {SLOTS.map((s) => {
                      const f = files[s.key]
                      const err = fileErr[s.key] || (showErr(`berkas_${s.key}`) ? errors[`berkas_${s.key}`] : '')
                      return (
                        <div key={s.key} className={`kr-file ${f ? 'has-file' : ''} ${err ? 'has-err' : ''}`}>
                          <div className="kr-file-head">
                            <span className="kr-file-label">{s.label}{s.wajib && ' *'}</span>
                            <span className="kr-hint">{s.hint}</span>
                          </div>
                          {f ? (
                            <div className="kr-file-picked">
                              <FileText size={16} color="var(--green)" />
                              <span className="kr-file-name" title={f.name}>{f.name}</span>
                              <span className="kr-hint">{fmtSize(f.size)}</span>
                              <button type="button" className="kr-file-remove" onClick={() => pilihFile(s.key, null)} aria-label={`Hapus ${s.label}`}><Trash2 size={14} /></button>
                            </div>
                          ) : (
                            <label className="kr-file-drop">
                              <UploadCloud size={18} />
                              <span>Pilih file</span>
                              <input type="file" accept={ACCEPT} onChange={(e) => { pilihFile(s.key, e.target.files?.[0] || null); touch(`berkas_${s.key}`) }} />
                            </label>
                          )}
                          {err && <small className="kr-err">{err}</small>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="kr-card">
                  <label className="kr-check">
                    <input type="checkbox" checked={form.setuju} onChange={(e) => { set('setuju', e.target.checked); touch('setuju') }} />
                    <span>Saya menyatakan seluruh data dan berkas yang saya kirim adalah benar. Saya memahami bahwa data ini digunakan hanya untuk proses rekrutmen PT Sopiak Satria Saga. *</span>
                  </label>
                  {showErr('setuju') && <small className="kr-err">{errors.setuju}</small>}

                  {serverErr && (
                    <div className={`kr-alert ${serverErr.kind === 'warn' ? 'kr-alert-warn' : 'kr-alert-danger'}`} role="alert">
                      <AlertTriangle size={16} />
                      <div>
                        <div>{serverErr.msg}</div>
                        {serverErr.details && serverErr.details.length > 0 && (
                          <ul style={{ margin: '6px 0 0 16px', fontSize: 12.5 }}>{serverErr.details.map((d) => <li key={d}>{d}</li>)}</ul>
                        )}
                      </div>
                    </div>
                  )}
                  {touched.__all && !valid && !serverErr && (
                    <div className="kr-alert kr-alert-warn"><AlertTriangle size={16} /> Masih ada kolom yang perlu dilengkapi. Periksa tanda merah di formulir.</div>
                  )}

                  <button type="submit" className="form-submit" disabled={submitting || (touched.__all && !valid)} style={{ marginTop: 18 }}>
                    {submitting ? <Loader2 size={16} className="kr-spin" /> : <Send size={16} />}
                    <span>{submitting ? 'Mengirim lamaran...' : 'Kirim Lamaran'}</span>
                  </button>
                  <p className="kr-hint" style={{ textAlign: 'center', marginTop: 12 }}>
                    Ada kendala? Hubungi kami di {COMPANY.phones[0]} (WhatsApp) pada jam kerja.
                  </p>
                </div>
              </form>
            </div>
          </section>
        </>
      )}

      <CekStatus />
      <Footer />
    </>
  )
}
