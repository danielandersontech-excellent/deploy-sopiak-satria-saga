import {
  Building2, Factory, Home, CalendarDays, Truck, Laptop,
  Smartphone, Globe, MapPinned, Bot, Lock, Siren,
  Fingerprint, ScanLine, FileText, Radio, ClipboardCheck, BarChart3,
  Target, Settings2, Zap, Eye, Award, Diamond,
  Crosshair, Users, Star,
  type LucideIcon,
} from 'lucide-react'

export const COMPANY = {
  name: 'PT Sopiak Satria Saga',
  tagline: 'Security Management',
  address: 'Komplek Paninsula, Jl. Tuanku Tambusai Blok C4-4, Tangkerang Barat, Kec. Marpoyan Damai, Kota Pekanbaru, Riau 28121',
  email: 'ptsopiaksatriasaga@gmail.com',
  phones: ['0831-9750-9241', '0823-8129-6699'],
  whatsapp: '6283197509241',
  operationalHours: 'Senin–Jumat: 08.00–17.00 WIB | Emergency: 24/7',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Komplek+Paninsula+Jl+Tuanku+Tambusai+Blok+C4-4+Tangkerang+Barat+Marpoyan+Damai+Pekanbaru+Riau',
  mapsEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3989.6!2d101.442!3d0.497!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMMKwMjknNDkuMiJOIDEwMcKwMjYnMzEuMiJF!5e0!3m2!1sid!2sid!4v1',
}

export interface ServiceData {
  slug: string
  Icon: LucideIcon
  title: string
  shortDesc: string
  color: string
  fullDesc: string
  features: string[]
  process: { step: string; desc: string }[]
  includes: string[]
}

export const SERVICES: ServiceData[] = [
  {
    slug: 'pengamanan-gedung', Icon: Building2, title: 'Pengamanan Gedung & Perkantoran',
    shortDesc: 'Sistem pengamanan terpadu untuk gedung bertingkat dan kompleks bisnis dengan personil terlatih dan teknologi modern.',
    color: '#00B4D8',
    fullDesc: 'Layanan pengamanan gedung dan perkantoran kami dirancang untuk memberikan perlindungan menyeluruh bagi properti komersial Anda, menggabungkan personil terlatih dengan teknologi monitoring terkini.',
    features: ['Penempatan personil security bersertifikat di setiap titik strategis', 'Sistem kontrol akses tamu dan karyawan berbasis digital', 'Monitoring CCTV 24/7 dengan pusat komando terpadu', 'Patroli berkala dengan checkpoint QR code di setiap lantai', 'Manajemen parkir dan pengaturan lalu lintas kendaraan', 'Penanganan darurat kebakaran dan evakuasi terkoordinasi', 'Laporan harian digital lengkap dengan dokumentasi foto', 'Koordinasi dengan building management'],
    process: [{ step: 'Survey & Analisis', desc: 'Tim kami melakukan survey menyeluruh terhadap gedung, mengidentifikasi titik-titik rawan dan kebutuhan keamanan spesifik.' }, { step: 'Perencanaan Sistem', desc: 'Merancang layout penempatan personil, rute patroli, dan sistem monitoring sesuai arsitektur gedung.' }, { step: 'Penempatan Personil', desc: 'Deployment personil terlatih yang telah melewati seleksi ketat dan pelatihan khusus.' }, { step: 'Monitoring & Evaluasi', desc: 'Evaluasi berkala performa keamanan dengan laporan komprehensif dan penyesuaian strategi.' }],
    includes: ['Personil security bersertifikat Gada Pratama/Madya', 'Seragam lengkap dan peralatan standar', 'Akses aplikasi monitoring real-time', 'Laporan harian & bulanan digital', 'Koordinator lapangan dedicated', 'Pelatihan berkala dan rotasi personil'],
  },
  {
    slug: 'pengamanan-industri', Icon: Factory, title: 'Pengamanan Industri & Pabrik',
    shortDesc: 'Pengamanan kawasan industri dengan patroli rutin, kontrol akses ketat, dan monitoring 24/7 untuk melindungi aset produksi.',
    color: '#8B5CF6',
    fullDesc: 'Kawasan industri dan pabrik memerlukan pendekatan keamanan khusus karena luasnya area dan nilai aset yang tinggi. Kami menyediakan layanan pengamanan industri yang komprehensif.',
    features: ['Pengamanan perimeter kawasan industri dengan patroli terjadwal', 'Kontrol akses ketat untuk karyawan, vendor, dan kendaraan logistik', 'Pemeriksaan keluar-masuk barang dan material produksi', 'Pengawasan zona kritis dan area penyimpanan bahan berbahaya', 'Koordinasi dengan tim K3 untuk penanganan darurat', 'Monitoring aktivitas 24 jam dengan shift system terstruktur', 'Pencegahan pencurian aset dan sabotase produksi', 'Pengawalan proses loading-unloading barang bernilai tinggi'],
    process: [{ step: 'Risk Assessment', desc: 'Pemetaan risiko keamanan menyeluruh mencakup ancaman internal, eksternal, dan risiko industri spesifik.' }, { step: 'Security Planning', desc: 'Penyusunan SOP keamanan yang terintegrasi dengan operasional pabrik dan standar K3.' }, { step: 'Deployment & Training', desc: 'Penempatan personil dengan pelatihan khusus keamanan industri dan prosedur darurat.' }, { step: 'Continuous Improvement', desc: 'Review berkala, drill keamanan, dan pembaruan prosedur sesuai dinamika operasional.' }],
    includes: ['Tim security khusus industri bersertifikat', 'Peralatan keamanan standar industri', 'Sistem pelaporan insiden real-time', 'Koordinasi dengan tim K3', 'Drill keamanan dan evakuasi berkala', 'Laporan komprehensif harian & bulanan'],
  },
  {
    slug: 'pengamanan-perumahan', Icon: Home, title: 'Pengamanan Perumahan & Residensial',
    shortDesc: 'Layanan keamanan residensial untuk perumahan, apartemen, dan cluster dengan sistem akses tamu terintegrasi.',
    color: '#00C896',
    fullDesc: 'Keamanan tempat tinggal adalah prioritas utama bagi setiap keluarga. Kami menawarkan layanan pengamanan perumahan yang ramah namun tetap tegas, dengan pendekatan community-based security.',
    features: ['Penjagaan pos keamanan utama 24 jam', 'Sistem pencatatan tamu digital dengan verifikasi identitas', 'Patroli keliling lingkungan secara berkala', 'Pengaturan lalu lintas dan manajemen parkir', 'Respons cepat terhadap laporan warga', 'Pengawasan CCTV di titik strategis', 'Koordinasi dengan RT/RW dan kepolisian setempat', 'Layanan pengawalan khusus untuk penghuni'],
    process: [{ step: 'Konsultasi', desc: 'Diskusi kebutuhan keamanan dengan developer atau pengelola perumahan.' }, { step: 'Desain Sistem', desc: 'Merancang pos keamanan, rute patroli, dan sistem akses sesuai layout.' }, { step: 'Rekrutmen & Penempatan', desc: 'Seleksi personil ramah dan komunikatif namun tetap profesional.' }, { step: 'Sosialisasi', desc: 'Perkenalan tim security kepada warga dan implementasi bertahap.' }],
    includes: ['Personil security ramah dan profesional', 'Pos keamanan yang representatif', 'Sistem pencatatan tamu digital', 'Patroli berkala siang dan malam', 'Hotline darurat khusus penghuni', 'Laporan keamanan berkala'],
  },
  {
    slug: 'pengamanan-event', Icon: CalendarDays, title: 'Pengamanan Event & VIP',
    shortDesc: 'Tim khusus pengamanan event besar, konser, pameran, dan pengawalan VIP yang profesional dan berpengalaman.',
    color: '#FF4757',
    fullDesc: 'Event besar membutuhkan perencanaan keamanan yang matang. Kami menyediakan layanan pengamanan event dari konser, seminar, pameran, hingga pengawalan VIP dan personal bodyguard.',
    features: ['Pengamanan event skala kecil hingga besar', 'Crowd management dan pengaturan arus pengunjung', 'Pemeriksaan keamanan pintu masuk', 'Tim pengawalan VIP dan personal bodyguard', 'Koordinasi dengan kepolisian dan instansi terkait', 'Pengamanan backstage dan area terbatas', 'Tim tanggap darurat dan P3K', 'Komunikasi radio terpadu antar tim'],
    process: [{ step: 'Pre-Event Briefing', desc: 'Koordinasi dengan event organizer untuk memahami konsep acara dan kebutuhan khusus.' }, { step: 'Security Mapping', desc: 'Pemetaan venue, identifikasi titik rawan, penentuan pos keamanan, dan rencana evakuasi.' }, { step: 'Team Deployment', desc: 'Penempatan tim keamanan terlatih dengan briefing lengkap.' }, { step: 'Execution & Reporting', desc: 'Pelaksanaan pengamanan dengan monitoring real-time dan laporan pasca-event.' }],
    includes: ['Tim security event berpengalaman', 'Peralatan komunikasi radio HT', 'Metal detector dan peralatan screening', 'Koordinator keamanan dedicated', 'Tim P3K dan tanggap darurat', 'Laporan pasca-event lengkap'],
  },
  {
    slug: 'pengamanan-logistik', Icon: Truck, title: 'Pengamanan Logistik & Distribusi',
    shortDesc: 'Pengawalan distribusi barang berharga dan cash-in-transit dengan GPS tracking real-time dan personil terlatih.',
    color: '#FFAA33',
    fullDesc: 'Distribusi barang berharga memerlukan pengamanan ekstra ketat. Kami menyediakan layanan pengawalan logistik dengan sistem tracking real-time.',
    features: ['Pengawalan armada distribusi barang bernilai tinggi', 'Layanan cash-in-transit dengan SOP keamanan ketat', 'GPS tracking real-time untuk seluruh proses pengiriman', 'Personil pengawal terlatih dengan kendaraan operasional', 'Sistem komunikasi langsung dengan pusat komando', 'Pengamanan gudang dan titik distribusi', 'Koordinasi rute aman dan analisis risiko', 'Asuransi dan penjaminan keamanan pengiriman'],
    process: [{ step: 'Route Analysis', desc: 'Analisis rute pengiriman, identifikasi titik rawan, dan penentuan jalur alternatif.' }, { step: 'Security Protocol', desc: 'Penyusunan SOP pengawalan: prosedur keberangkatan, transit, dan serah terima.' }, { step: 'Armed Escort', desc: 'Pelaksanaan pengawalan dengan personil terlatih dan monitoring GPS.' }, { step: 'Delivery Confirmation', desc: 'Konfirmasi penyerahan barang dengan dokumentasi lengkap.' }],
    includes: ['Tim pengawal logistik berpengalaman', 'Kendaraan escort operasional', 'GPS tracking real-time', 'Komunikasi langsung pusat komando', 'Dokumentasi lengkap per pengiriman', 'Laporan pengawalan per-trip'],
  },
  {
    slug: 'konsultasi-keamanan', Icon: Laptop, title: 'Konsultasi & Audit Keamanan',
    shortDesc: 'Audit keamanan menyeluruh, analisis risiko, dan perencanaan sistem keamanan profesional untuk bisnis Anda.',
    color: '#06B6D4',
    fullDesc: 'Tidak yakin sistem keamanan Anda memadai? Kami menyediakan layanan konsultasi dan audit keamanan profesional - evaluasi menyeluruh dan rekomendasi strategis.',
    features: ['Audit keamanan fisik menyeluruh', 'Analisis risiko dan kerentanan', 'Evaluasi sistem eksisting dan rekomendasi upgrade', 'Penyusunan SOP keamanan', 'Desain sistem keamanan untuk proyek baru', 'Pelatihan awareness keamanan untuk karyawan', 'Pendampingan implementasi rekomendasi', 'Review berkala dan pembaruan strategi'],
    process: [{ step: 'Initial Assessment', desc: 'Pertemuan awal untuk memahami kebutuhan dan kondisi saat ini.' }, { step: 'Field Audit', desc: 'Inspeksi lapangan menyeluruh oleh tim ahli.' }, { step: 'Analysis & Report', desc: 'Penyusunan laporan audit dengan temuan dan rekomendasi strategis.' }, { step: 'Consultation', desc: 'Presentasi temuan dan pendampingan implementasi.' }],
    includes: ['Tim konsultan keamanan bersertifikat', 'Laporan audit komprehensif', 'Rekomendasi strategis tertulis', 'Penyusunan SOP keamanan', 'Sesi konsultasi lanjutan', 'Pendampingan implementasi'],
  },
]

export const TECH_FEATURES = [
  { Icon: Smartphone, title: 'Aplikasi Mobile', desc: 'Android & iOS untuk semua personil - absensi selfie, patroli QR, laporan digital, SOS button.', tag: 'Mobile App' },
  { Icon: Globe, title: 'Web Admin Dashboard', desc: 'Panel administrasi real-time. Multi-role access: Admin, Supervisor, Komandan.', tag: 'Web Platform' },
  { Icon: MapPinned, title: 'Real-time GPS Tracking', desc: 'Lacak posisi seluruh personil di peta interaktif. Geofencing otomatis.', tag: 'Live Tracking' },
  { Icon: Bot, title: 'Pelaporan Cerdas AI', desc: 'Laporan otomatis dengan foto, watermark GPS, validasi komandan, export PDF.', tag: 'AI-Powered' },
  { Icon: Lock, title: 'Portal Klien', desc: 'Akses khusus klien untuk monitoring, download laporan, dan riwayat insiden.', tag: 'Client Access' },
  { Icon: Siren, title: 'Panic Button & Alert', desc: 'SOS instan ke seluruh rantai komando disertai lokasi GPS presisi.', tag: 'Emergency' },
]

export const APP_FEATURES = [
  { Icon: Fingerprint, title: 'Absensi GPS & Selfie', desc: 'Foto selfie + validasi GPS geofence. Anti-titip absen.', color: '#00B4D8' },
  { Icon: ScanLine, title: 'Patroli QR Checkpoint', desc: 'Scan QR di checkpoint dengan foto bukti dan timestamp.', color: '#00C896' },
  { Icon: FileText, title: 'Laporan Digital', desc: 'Harian & kejadian dengan foto, lokasi, dan prioritas.', color: '#FFAA33' },
  { Icon: Radio, title: 'Monitor Real-time', desc: 'Peta interaktif posisi personil dan status bertugas.', color: '#FF4757' },
  { Icon: ClipboardCheck, title: 'Serah Terima Digital', desc: 'Checklist inventaris, kondisi area, tanda tangan digital.', color: '#8B5CF6' },
  { Icon: BarChart3, title: 'Analytics & Report', desc: 'Dashboard analitik dengan grafik dan export otomatis.', color: '#06B6D4' },
]

export const WHY_REASONS = [
  { Icon: Target, num: '01', title: 'Personil Terseleksi & Terlatih', desc: 'Proses rekrutmen ketat, pelatihan berjenjang, dan sertifikasi profesional.' },
  { Icon: Settings2, num: '02', title: 'Teknologi Terintegrasi', desc: 'Sistem digital end-to-end: mobile app, web dashboard, GPS tracking, AI analytics.' },
  { Icon: Zap, num: '03', title: 'Respons Cepat 24/7', desc: 'Tim tanggap darurat siap 24 jam dengan SOS button dan notifikasi real-time.' },
  { Icon: Eye, num: '04', title: 'Transparansi Penuh', desc: 'Portal klien dengan monitoring langsung, laporan otomatis, dan bukti foto.' },
  { Icon: Award, num: '05', title: 'Komitmen Profesional', desc: 'Dedikasi penuh untuk layanan keamanan terbaik dengan standar industri tertinggi.' },
  { Icon: Diamond, num: '06', title: 'Harga Kompetitif', desc: 'Paket fleksibel sesuai kebutuhan dan anggaran. Konsultasi gratis.' },
]

export const COMMITMENTS = [
  { Icon: Crosshair, title: 'Visi Kami', desc: 'Menjadi perusahaan jasa keamanan terdepan di Indonesia yang mengintegrasikan teknologi modern dengan profesionalisme personil.' },
  { Icon: Users, title: 'Misi Kami', desc: 'Menyediakan layanan keamanan berkualitas tinggi dengan personil terlatih dan bersertifikat, didukung sistem manajemen berbasis teknologi.' },
  { Icon: Star, title: 'Nilai Kami', desc: 'Integritas, profesionalisme, dan inovasi menjadi landasan setiap langkah. Keamanan terbaik lahir dari SDM unggul dan teknologi tepat guna.' },
]

export const NAV_LINKS = [
  { label: 'Beranda', href: '/#hero' },
  { label: 'Layanan', href: '/#layanan' },
  { label: 'Teknologi', href: '/#teknologi' },
  { label: 'Keunggulan', href: '/#keunggulan' },
  { label: 'Kontak', href: '/#kontak' },
]