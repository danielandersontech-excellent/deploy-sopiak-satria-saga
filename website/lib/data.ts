import {
  Building2, Factory, Home, CalendarDays, Truck, Laptop,
  Smartphone, Globe, MapPinned, Bot, Lock, Siren,
  Fingerprint, ScanLine, FileText, Radio, ClipboardCheck, BarChart3,
  Target, Settings2, Zap, Eye, Award, Diamond,
  Crosshair, Users, Star,
  // [Konten Profil] ikon tambahan untuk halaman /profil (company profile resmi)
  Scale, Medal, Timer, ShieldCheck, Lightbulb,
  UserCheck, Footprints, Crown, Trees,
  Radar, LayoutDashboard, FileCheck2, Handshake, Landmark, HeartPulse,
  Wallet, ClipboardList, Server, Banknote, ShoppingBag,
  // [Rekrutmen] ikon halaman /karir
  UserRoundCheck, UsersRound, GraduationCap, BadgeDollarSign, Stethoscope, TrendingUp,
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
  // [Konten Profil] Wording diselaraskan dengan Visi/Misi/Nilai RESMI pada
  // Company Profile perusahaan (detail lengkap di halaman /profil).
  { Icon: Crosshair, title: 'Visi Kami', desc: 'Menjadi mitra utama dalam menciptakan lingkungan yang aman dan kondusif melalui layanan pengamanan profesional berbasis teknologi.' },
  { Icon: Users, title: 'Misi Kami', desc: 'Layanan pengamanan profesional sesuai standar operasional kepolisian, personel kompeten dan berintegritas, serta sistem digital yang transparan.' },
  { Icon: Star, title: 'Nilai Kami', desc: 'Integrity, Professionalism, Discipline, Responsibility, dan Innovation — lima nilai yang melandasi setiap langkah pengamanan kami.' },
]

export const NAV_LINKS = [
  { label: 'Beranda', href: '/#hero' },
  { label: 'Profil', href: '/profil' },
  { label: 'Layanan', href: '/#layanan' },
  { label: 'Teknologi', href: '/#teknologi' },
  { label: 'Keunggulan', href: '/#keunggulan' },
  { label: 'Karir', href: '/karir' },
  { label: 'Kontak', href: '/#kontak' },
]

/* ══════════════════════════════════════════════════════════════
   [Rekrutmen] Konten halaman /karir — posisi, persyaratan umum,
   manfaat, dan alur seleksi. Nilai konkret (gaji, dsb.) sengaja tidak
   dicantumkan agar tidak menjadi janji yang tidak resmi.
   ══════════════════════════════════════════════════════════════ */

export const KARIR_POSISI = [
  { kode: 'anggota', Icon: UserRoundCheck, title: 'Anggota Satpam', desc: 'Penjagaan pos, patroli checkpoint QR, absensi selfie GPS, dan pelaporan digital harian di lokasi klien.' },
  { kode: 'komandan', Icon: UsersRound, title: 'Komandan Regu (Danru)', desc: 'Memimpin regu di satu lokasi, memvalidasi laporan anggota, koordinasi dengan klien dan supervisor.' },
]

export const KARIR_SYARAT = [
  'WNI, usia 18–55 tahun, sehat jasmani dan rohani',
  'Pendidikan minimal SMA/SMK atau sederajat',
  'Memiliki KTP, ijazah, dan SKCK yang masih berlaku',
  'Disiplin, jujur, berintegritas, dan siap bekerja dalam sistem shift',
  'Diutamakan memiliki sertifikat Gada Pratama / pengalaman keamanan',
  'Mampu mengoperasikan aplikasi Android (absensi, patroli, laporan)',
]

export const KARIR_BENEFIT = [
  { Icon: BadgeDollarSign, title: 'Gaji & Tunjangan Tepat Waktu' },
  { Icon: HeartPulse, title: 'BPJS Ketenagakerjaan' },
  { Icon: GraduationCap, title: 'Pelatihan Berjenjang' },
  { Icon: Stethoscope, title: 'Perlengkapan & Seragam' },
  { Icon: TrendingUp, title: 'Jenjang Karir Jelas' },
  { Icon: ShieldCheck, title: 'Sertifikasi Satpam' },
]

export const KARIR_LANGKAH = [
  { title: 'Daftar Online', desc: 'Isi formulir dan unggah berkas. Anda langsung menerima nomor referensi.' },
  { title: 'Seleksi Administrasi', desc: 'Tim HR meninjau kelengkapan dan keabsahan berkas (1–7 hari kerja).' },
  { title: 'Wawancara & Tes Fisik', desc: 'Kandidat terpilih dihubungi via WhatsApp untuk jadwal wawancara di kantor Pekanbaru.' },
  { title: 'Pelatihan & Penempatan', desc: 'Pembekalan SOP dan aplikasi, lalu penempatan di lokasi klien sesuai kebutuhan.' },
]

/* ══════════════════════════════════════════════════════════════
   [Konten Profil] KONTEN RESMI COMPANY PROFILE — sumber: dokumen
   "Company Profile PT. Sopiak Satria Saga" (2026). Dipakai oleh
   halaman /profil dan strip legalitas pada beranda.
   ══════════════════════════════════════════════════════════════ */

export const PROFILE = {
  heroTagline: 'Solusi Keamanan Profesional, Terpercaya dan Berbasis Teknologi.',
  closingTagline: 'Keamanan Anda, Komitmen Kami.',
  about1:
    'PT Sopiak Satria Saga adalah perusahaan jasa pengamanan yang berdedikasi untuk memberikan solusi keamanan terintegrasi bagi berbagai sektor industri. Kami percaya bahwa keamanan adalah fondasi utama bagi kelangsungan bisnis dan kenyamanan lingkungan.',
  aboutQuote:
    'Berkomitmen menciptakan lingkungan yang aman, tertib, dan kondusif melalui manajemen pengamanan yang profesional dan akuntabel.',
  about2:
    'Didukung oleh personel yang terlatih secara fisik dan mental, serta sistem monitoring berbasis teknologi terkini, kami siap menjadi mitra strategis Anda dalam menghadapi tantangan keamanan modern.',
  visi:
    'Menjadi mitra utama dalam menciptakan lingkungan yang aman dan kondusif melalui layanan pengamanan profesional berbasis teknologi.',
  misi: [
    'Memberikan layanan pengamanan profesional sesuai standar operasional kepolisian.',
    'Menyediakan personel keamanan yang kompeten, disiplin, dan berintegritas tinggi.',
    'Mengembangkan sistem pengamanan berbasis teknologi digital yang transparan.',
    'Memberikan pelayanan yang cepat, responsif, dan berorientasi pada kepuasan pelanggan.',
    'Menjalin hubungan kerja sama jangka panjang yang saling menguntungkan.',
  ],
  managemen:
    'PT Sopiak Satria Saga dikelola oleh tim manajemen profesional yang memiliki latar belakang kuat dalam bidang keamanan, operasional, dan sumber daya manusia. Kami menerapkan standar manajemen mutu yang ketat untuk memastikan setiap aspek layanan berjalan sesuai dengan regulasi pemerintah dan ekspektasi mitra kerja.',
  workflowTagline: 'Membangun Kepercayaan Melalui Proses Terukur',
  partnershipQuote:
    'Kepercayaan pelanggan adalah aset terbesar kami. Kami membangun kemitraan melalui transparansi, integritas, dan kualitas layanan yang konsisten.',
}

export const COMPANY_VALUES = [
  { Icon: Scale, title: 'Integrity', desc: 'Menjunjung tinggi kejujuran, etika, dan transparansi dalam setiap aspek operasional dan hubungan bisnis.' },
  { Icon: Medal, title: 'Professionalism', desc: 'Memberikan standar pelayanan tertinggi melalui kompetensi, keahlian, dan dedikasi yang tak tergoyahkan.' },
  { Icon: Timer, title: 'Discipline', desc: 'Melaksanakan setiap tugas dengan ketepatan waktu, ketaatan pada prosedur, dan tanggung jawab penuh.' },
  { Icon: ShieldCheck, title: 'Responsibility', desc: 'Berkomitmen penuh terhadap keamanan aset pelanggan dan akuntabilitas dalam setiap tindakan pengamanan.' },
  { Icon: Lightbulb, title: 'Innovation', desc: 'Terus beradaptasi dan mengintegrasikan teknologi keamanan terbaru untuk solusi perlindungan yang lebih cerdas.' },
]

export const SERVICE_SCOPE = [
  { Icon: UserCheck, title: 'Pengamanan Personel' },
  { Icon: Building2, title: 'Pengamanan Perkantoran' },
  { Icon: CalendarDays, title: 'Pengamanan Event' },
  { Icon: Footprints, title: 'Patrol Security' },
  { Icon: Factory, title: 'Kawasan Industri' },
  { Icon: Crown, title: 'Pengamanan VIP' },
  { Icon: Siren, title: 'Emergency Response' },
  { Icon: Trees, title: 'Pengamanan Perkebunan' },
]

export const MONITORING_PILLARS = [
  { Icon: Radar, title: 'Monitoring Real-Time', desc: 'Pemantauan kehadiran dan aktivitas personel secara langsung melalui aplikasi PT SSS yang terintegrasi.' },
  { Icon: FileText, title: 'Pelaporan Digital', desc: 'Sistem pelaporan patroli otomatis yang transparan, akurat, dan dapat diakses kapan saja.' },
  { Icon: LayoutDashboard, title: 'Dashboard Pelanggan', desc: 'Akses khusus bagi klien untuk memantau status keamanan aset mereka secara komprehensif.' },
]

export const LEGALITAS = [
  { Icon: FileCheck2, title: 'NIB', full: 'Nomor Induk Berusaha', desc: 'Terdaftar resmi sebagai badan usaha melalui sistem perizinan pemerintah.' },
  { Icon: ShieldCheck, title: 'Izin BUJP', full: 'Badan Usaha Jasa Pengamanan', desc: 'Izin operasional jasa pengamanan sesuai regulasi Kepolisian RI.' },
  { Icon: Handshake, title: 'ABIJAPI', full: 'Keanggotaan Asosiasi', desc: 'Tergabung dalam asosiasi resmi badan usaha jasa pengamanan Indonesia.' },
  { Icon: Award, title: 'KTA Satpam', full: 'Sertifikasi Personel', desc: 'Seluruh personel mengantongi Kartu Tanda Anggota Satpam tersertifikasi.' },
  { Icon: Landmark, title: 'NPWP', full: 'NPWP Perusahaan', desc: 'Kepatuhan perpajakan penuh sebagai badan usaha yang taat aturan.' },
  { Icon: HeartPulse, title: 'BPJS', full: 'BPJS Ketenagakerjaan', desc: 'Perlindungan jaminan sosial ketenagakerjaan bagi seluruh personel.' },
]

export const DIVISIONS = [
  { Icon: Users, title: 'Human Resources' },
  { Icon: Wallet, title: 'Keuangan' },
  { Icon: ClipboardList, title: 'Administrasi' },
  { Icon: Server, title: 'Teknologi Informasi' },
  { Icon: Radar, title: 'Monitoring Center' },
  { Icon: MapPinned, title: 'Operasional Lapangan' },
]

export const WORKFLOW = [
  { title: 'Survey dan Analisis Risiko Keamanan', desc: 'Pemetaan kondisi lapangan dan identifikasi titik rawan di lokasi Anda.' },
  { title: 'Perencanaan Strategi Pengamanan', desc: 'Penyusunan strategi, penempatan pos, dan SOP sesuai hasil analisis.' },
  { title: 'Penempatan Personel Terlatih', desc: 'Deployment personel tersertifikasi sesuai kebutuhan dan karakter lokasi.' },
  { title: 'Pelaksanaan Operasional Sesuai SOP', desc: 'Operasional harian berjalan disiplin mengikuti prosedur standar.' },
  { title: 'Monitoring Digital dan Pengawasan', desc: 'Pemantauan real-time melalui sistem digital dan supervisi berjenjang.' },
  { title: 'Pelaporan Berkala dan Transparan', desc: 'Laporan rutin yang akurat dan dapat diakses klien kapan saja.' },
  { title: 'Evaluasi dan Peningkatan Layanan', desc: 'Review berkala untuk perbaikan berkelanjutan kualitas pengamanan.' },
]

export const SECTORS = [
  { Icon: Banknote, title: 'Perbankan & Keuangan' },
  { Icon: Factory, title: 'Kawasan Industri' },
  { Icon: ShoppingBag, title: 'Retail & Mall' },
  { Icon: Home, title: 'Perumahan & Apartemen' },
  { Icon: Building2, title: 'Perkantoran & Aset' },
  { Icon: Trees, title: 'Pabrik dan Perkebunan' },
]