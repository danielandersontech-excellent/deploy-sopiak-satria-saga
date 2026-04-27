/**
 * SEED FULL - Comprehensive demo data for PT Sopiak Satria Saga
 * Run: cd backend && npm run seed:full
 * 
 * Creates:
 * - 5 Lokasi (client sites) 
 * - 12 Pos Jaga
 * - 35+ Users (all roles)
 * - 10 Checkpoints + 5 Routes
 * - 5 Jadwal Shift
 * - 100+ Absensi records (last 7 days)
 * - 30+ Patroli records
 * - 20+ Laporan Harian
 * - 15+ Laporan Kejadian
 * - 10+ Serah Terima
 * - Broadcasts, Notifications, Panic Alerts
 * 
 * All demo accounts PIN: 123456
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, queryOne, queryAll } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedFull() {
  console.log('\n🌱 === PT SOPIAK SATRIA SAGA - FULL SEED ===\n');
  
  const pinHash = await bcrypt.hash('123456', 10);
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Helper: random date within last N days
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  const randomTime = (baseDate, hourMin, hourMax) => {
    const d = new Date(baseDate);
    d.setHours(hourMin + Math.floor(Math.random() * (hourMax - hourMin)));
    d.setMinutes(Math.floor(Math.random() * 60));
    d.setSeconds(Math.floor(Math.random() * 60));
    return d.toISOString();
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  try {
    // ===== CLEANUP =====
    console.log('🗑️  Membersihkan data lama...');
    const tables = [
      'audit_log', 'report_exports', 'shift_assignments', 'jadwal_shift',
      'panic_alerts', 'broadcasts', 'notifikasi', 'serah_terima',
      'laporan_kejadian', 'laporan_harian', 'patrol_scans', 'patroli',
      'routes', 'checkpoints', 'absensi', 'users', 'pos_jaga', 'lokasi'
    ];
    // Try dropping extra tables if they exist
    try { await pool.query('DROP TABLE IF EXISTS location_history, geofence_violations, geofence_izin CASCADE'); } catch(e) {}
    
    for (const t of tables) {
      try { await pool.query(`TRUNCATE ${t} CASCADE`); } catch(e) {}
    }
    console.log('   ✅ Data lama dibersihkan\n');

    // ===== LOKASI (Client Sites) =====
    console.log('📍 Membuat Lokasi...');
    const lokasi = [
      { id: uuidv4(), nama: 'PT Chevron Pacific Indonesia', alamat: 'Jl. Riau No. 1, Duri, Bengkalis, Riau', lat: 1.3713, lng: 101.3953, radius: 500 },
      { id: uuidv4(), nama: 'PT Pertamina EP Dumai', alamat: 'Jl. Datuk Laksamana, Dumai, Riau', lat: 1.6878, lng: 101.4500, radius: 400 },
      { id: uuidv4(), nama: 'PT RAPP (APRIL Group)', alamat: 'Jl. Lintas Timur, Pangkalan Kerinci, Pelalawan', lat: 0.3523, lng: 101.8448, radius: 600 },
      { id: uuidv4(), nama: 'PT PLN UP3 Pekanbaru', alamat: 'Jl. Sudirman No. 320, Pekanbaru, Riau', lat: 0.5071, lng: 101.4478, radius: 300 },
      { id: uuidv4(), nama: 'Mall SKA Pekanbaru', alamat: 'Jl. Soekarno-Hatta, Pekanbaru, Riau', lat: 0.4628, lng: 101.4195, radius: 350 },
    ];
    for (const l of lokasi) {
      await pool.query(
        `INSERT INTO lokasi (id, nama, alamat, latitude, longitude, status) VALUES ($1,$2,$3,$4,$5,'active')`,
        [l.id, l.nama, l.alamat, l.lat, l.lng]
      );
      // Add radius column if exists
      try { await pool.query(`UPDATE lokasi SET radius = $1 WHERE id = $2`, [l.radius, l.id]); } catch(e) {}
    }
    console.log(`   ✅ ${lokasi.length} lokasi dibuat`);

    // ===== POS JAGA =====
    console.log('🏢 Membuat Pos Jaga...');
    const posJaga = [
      // Chevron (3 pos)
      { id: uuidv4(), lokasi_id: lokasi[0].id, nama: 'Pos Gate Utama', lat: 1.3716, lng: 101.3956, radius: 50 },
      { id: uuidv4(), lokasi_id: lokasi[0].id, nama: 'Pos Warehouse', lat: 1.3709, lng: 101.3961, radius: 50 },
      { id: uuidv4(), lokasi_id: lokasi[0].id, nama: 'Pos Parkir VIP', lat: 1.3721, lng: 101.3949, radius: 50 },
      // Pertamina (3 pos)
      { id: uuidv4(), lokasi_id: lokasi[1].id, nama: 'Pos Gate Selatan', lat: 1.6880, lng: 101.4502, radius: 50 },
      { id: uuidv4(), lokasi_id: lokasi[1].id, nama: 'Pos Tangki Storage', lat: 1.6875, lng: 101.4508, radius: 50 },
      { id: uuidv4(), lokasi_id: lokasi[1].id, nama: 'Pos Loading Dock', lat: 1.6883, lng: 101.4495, radius: 50 },
      // RAPP (2 pos)
      { id: uuidv4(), lokasi_id: lokasi[2].id, nama: 'Pos Main Gate', lat: 0.3526, lng: 101.8451, radius: 50 },
      { id: uuidv4(), lokasi_id: lokasi[2].id, nama: 'Pos Workshop Area', lat: 0.3519, lng: 101.8456, radius: 50 },
      // PLN (2 pos)
      { id: uuidv4(), lokasi_id: lokasi[3].id, nama: 'Pos Lobby Utama', lat: 0.5074, lng: 101.4481, radius: 30 },
      { id: uuidv4(), lokasi_id: lokasi[3].id, nama: 'Pos Gardu Induk', lat: 0.5070, lng: 101.4477, radius: 30 },
      // Mall SKA (2 pos)
      { id: uuidv4(), lokasi_id: lokasi[4].id, nama: 'Pos Entrance Mall', lat: 0.4630, lng: 101.4197, radius: 30 },
      { id: uuidv4(), lokasi_id: lokasi[4].id, nama: 'Pos Basement Parkir', lat: 0.4626, lng: 101.4193, radius: 30 },
    ];
    for (const p of posJaga) {
      await pool.query(
        `INSERT INTO pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status) VALUES ($1,$2,$3,$4,$5,$6,'active')`,
        [p.id, p.lokasi_id, p.nama, p.radius, p.lat, p.lng]
      );
    }
    console.log(`   ✅ ${posJaga.length} pos jaga dibuat`);

    // ===== USERS =====
    console.log('👤 Membuat Users...');

    // Admin
    const admins = [
      { nrp: 'ADM001', nama: 'Sopiak Pranata', no_hp: '0812-7700-0001', lokasi_id: null },
      { nrp: 'ADM002', nama: 'Rina Maharani', no_hp: '0812-7700-0002', lokasi_id: null },
    ];
    const adminIds = [];
    for (const u of admins) {
      const id = uuidv4();
      adminIds.push(id);
      await pool.query(
        `INSERT INTO users (id,nrp,nama,pin_hash,no_hp,role,lokasi_id,shift,status,skor) VALUES ($1,$2,$3,$4,$5,'admin',$6,'08:00-17:00','on_duty',95)`,
        [id, u.nrp, u.nama, pinHash, u.no_hp, u.lokasi_id]
      );
      console.log(`   ✅ ${u.nrp} - ${u.nama} (admin)`);
    }

    // Supervisors
    const supervisors = [
      { nrp: 'SPV001', nama: 'Hendri Saputra', no_hp: '0813-6500-0001', lokasi_id: lokasi[0].id },
      { nrp: 'SPV002', nama: 'Dewi Anggraini', no_hp: '0813-6500-0002', lokasi_id: lokasi[1].id },
      { nrp: 'SPV003', nama: 'Ramlan Effendi', no_hp: '0813-6500-0003', lokasi_id: lokasi[2].id },
    ];
    const spvIds = [];
    for (const u of supervisors) {
      const id = uuidv4();
      spvIds.push(id);
      await pool.query(
        `INSERT INTO users (id,nrp,nama,pin_hash,no_hp,role,lokasi_id,shift,status,skor) VALUES ($1,$2,$3,$4,$5,'supervisor',$6,'08:00-17:00','on_duty',90)`,
        [id, u.nrp, u.nama, pinHash, u.no_hp, u.lokasi_id]
      );
      console.log(`   ✅ ${u.nrp} - ${u.nama} (supervisor)`);
    }

    // Komandans
    const komandans = [
      { nrp: 'KMD001', nama: 'Rizky Firmansyah', no_hp: '0821-7100-0001', lokasi_id: lokasi[0].id },
      { nrp: 'KMD002', nama: 'Wahyu Pratama', no_hp: '0821-7100-0002', lokasi_id: lokasi[1].id },
      { nrp: 'KMD003', nama: 'Dedi Irawan', no_hp: '0821-7100-0003', lokasi_id: lokasi[2].id },
      { nrp: 'KMD004', nama: 'Surya Hidayat', no_hp: '0821-7100-0004', lokasi_id: lokasi[3].id },
      { nrp: 'KMD005', nama: 'Eko Saputro', no_hp: '0821-7100-0005', lokasi_id: lokasi[4].id },
    ];
    const cmdIds = [];
    for (const u of komandans) {
      const id = uuidv4();
      cmdIds.push(id);
      await pool.query(
        `INSERT INTO users (id,nrp,nama,pin_hash,no_hp,role,lokasi_id,shift,status,skor) VALUES ($1,$2,$3,$4,$5,'komandan',$6,'06:00-14:00','on_duty',88)`,
        [id, u.nrp, u.nama, pinHash, u.no_hp, u.lokasi_id]
      );
      console.log(`   ✅ ${u.nrp} - ${u.nama} (komandan)`);
    }

    // Klien - these are now in clients table, not users
    const klienData = [
      { nrp: 'K-001', nama: 'Manager PT Chevron', no_hp: '0811-7000-0001', lokasi_id: lokasi[0].id },
      { nrp: 'K-002', nama: 'Manager PT Pertamina', no_hp: '0811-7000-0002', lokasi_id: lokasi[1].id },
      { nrp: 'K-003', nama: 'Manager RAPP', no_hp: '0811-7000-0003', lokasi_id: lokasi[2].id },
      { nrp: 'K-004', nama: 'Manager PLN UP3', no_hp: '0811-7000-0004', lokasi_id: lokasi[3].id },
      { nrp: 'K-005', nama: 'Manager Mall SKA', no_hp: '0811-7000-0005', lokasi_id: lokasi[4].id },
    ];
    // Klien now handled in clients table, skip user creation for klien role

    // Anggota (25 security officers spread across all locations)
    const anggotaNames = [
      'Ahmad Fadillah', 'Budi Santoso', 'Candra Wijaya', 'Dimas Prasetyo', 'Eko Kurniawan',
      'Fajar Ramadhan', 'Gunawan Hidayat', 'Hasan Abdullah', 'Irfan Maulana', 'Joko Susilo',
      'Krisna Putra', 'Lukman Hakim', 'Muhammad Arif', 'Naufal Akbar', 'Oscar Pratama',
      'Pandu Wicaksono', 'Rafi Ananda', 'Surya Darma', 'Taufik Hidayat', 'Umar Faruk',
      'Vino Pratama', 'Wawan Setiawan', 'Yusuf Rahman', 'Zaki Mubarak', 'Andi Saputra',
      'Bayu Nugroho', 'Cahyo Wibowo', 'Doni Kurniawan', 'Fikri Hamdani', 'Galih Permana',
    ];
    const shifts = ['06:00-14:00', '14:00-22:00', '22:00-06:00'];
    const statuses = ['on_duty', 'on_duty', 'on_duty', 'patroli', 'off_duty'];
    const anggotaIds = [];
    const anggotaData = [];

    for (let i = 0; i < anggotaNames.length; i++) {
      const id = uuidv4();
      const nrp = `AGT${String(i + 1).padStart(3, '0')}`;
      const lokIdx = i % lokasi.length;
      const posIdx = Math.floor(i / lokasi.length) % 3;
      const posPool = posJaga.filter(p => p.lokasi_id === lokasi[lokIdx].id);
      const posId = posPool[posIdx % posPool.length]?.id || posPool[0]?.id;
      const shift = shifts[i % 3];
      const status = statuses[i % 5];
      const skor = 70 + Math.floor(Math.random() * 25);
      const pos = posJaga.find(p => p.id === posId);

      anggotaIds.push(id);
      anggotaData.push({ id, nrp, nama: anggotaNames[i], lokasi_id: lokasi[lokIdx].id, pos_jaga_id: posId, shift, status, lat: pos?.lat || lokasi[lokIdx].lat, lng: pos?.lng || lokasi[lokIdx].lng });

      await pool.query(
        `INSERT INTO users (id,nrp,nama,pin_hash,no_hp,role,lokasi_id,pos_jaga_id,shift,status,skor,last_latitude,last_longitude) 
         VALUES ($1,$2,$3,$4,$5,'anggota',$6,$7,$8,$9,$10,$11,$12)`,
        [id, nrp, anggotaNames[i], pinHash, `0852-6300-${String(i+1).padStart(4,'0')}`, lokasi[lokIdx].id, posId, shift, status, skor, pos?.lat || lokasi[lokIdx].lat + Math.random()*0.001, pos?.lng || lokasi[lokIdx].lng + Math.random()*0.001]
      );
    }
    console.log(`   ✅ ${anggotaNames.length} anggota dibuat`);

    // All user IDs for reference
    const allUserIds = [...adminIds, ...spvIds, ...cmdIds, ...anggotaIds];
    const allAnggotaCmdIds = [...cmdIds, ...anggotaIds];

    // ===== CHECKPOINTS =====
    console.log('📌 Membuat Checkpoints...');
    const checkpointData = [];
    const cpNames = ['Lobby', 'Parkir', 'Gudang', 'Kantin', 'Taman', 'Server Room', 'Ruang Meeting', 'Toilet Lantai 1', 'Emergency Exit', 'Rooftop'];
    for (let i = 0; i < 10; i++) {
      const lokIdx = i % lokasi.length;
      const cp = {
        id: uuidv4(),
        lokasi_id: lokasi[lokIdx].id,
        nama: `CP ${cpNames[i]} - ${lokasi[lokIdx].nama.split(' ').slice(-1)[0]}`,
        area: cpNames[i],
        lat: lokasi[lokIdx].lat + (Math.random() - 0.5) * 0.002,
        lng: lokasi[lokIdx].lng + (Math.random() - 0.5) * 0.002,
        qr_code: `CP-${String(i+1).padStart(3,'0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      };
      checkpointData.push(cp);
      await pool.query(
        `INSERT INTO checkpoints (id,lokasi_id,nama,area,latitude,longitude,radius,qr_code,status) VALUES ($1,$2,$3,$4,$5,$6,15,$7,'active')`,
        [cp.id, cp.lokasi_id, cp.nama, cp.area, cp.lat, cp.lng, cp.qr_code]
      );
    }
    console.log(`   ✅ ${checkpointData.length} checkpoints dibuat`);

    // ===== ROUTES =====
    console.log('🗺️  Membuat Rute Patroli...');
    const routeData = [];
    for (let i = 0; i < 5; i++) {
      const lokCps = checkpointData.filter(c => c.lokasi_id === lokasi[i].id);
      const cpIds = lokCps.map(c => c.id);
      const r = {
        id: uuidv4(),
        lokasi_id: lokasi[i].id,
        nama: `Rute Patroli ${lokasi[i].nama.split(' ').slice(-1)[0]}`,
        checkpoint_ids: cpIds,
        waktu_estimasi: 20 + i * 5,
      };
      routeData.push(r);
      await pool.query(
        `INSERT INTO routes (id,lokasi_id,nama,checkpoint_ids,waktu_estimasi,status) VALUES ($1,$2,$3,$4,$5,'active')`,
        [r.id, r.lokasi_id, r.nama, `{${cpIds.join(',')}}`, r.waktu_estimasi]
      );
    }
    console.log(`   ✅ ${routeData.length} rute patroli dibuat`);

    // ===== JADWAL SHIFT =====
    console.log('📅 Membuat Jadwal Shift...');
    const shiftNames = [
      { nama: 'Shift Pagi', mulai: '06:00', selesai: '14:00', warna: '#27ae60' },
      { nama: 'Shift Siang', mulai: '14:00', selesai: '22:00', warna: '#f39c12' },
      { nama: 'Shift Malam', mulai: '22:00', selesai: '06:00', warna: '#8e44ad' },
      { nama: 'Shift Office', mulai: '08:00', selesai: '17:00', warna: '#2980b9' },
      { nama: 'Shift Weekend', mulai: '07:00', selesai: '19:00', warna: '#e74c3c' },
    ];
    const shiftIds = [];
    for (const s of shiftNames) {
      const id = uuidv4();
      shiftIds.push(id);
      await pool.query(
        `INSERT INTO jadwal_shift (id,lokasi_id,nama,waktu_mulai,waktu_selesai,warna) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, lokasi[0].id, s.nama, s.mulai, s.selesai, s.warna]
      );
    }
    console.log(`   ✅ ${shiftNames.length} jadwal shift dibuat`);

    // ===== ABSENSI (Last 7 days) =====
    console.log('📋 Membuat data Absensi (7 hari terakhir)...');
    let absensiCount = 0;
    for (let day = 0; day < 7; day++) {
      const date = daysAgo(day);
      // Each day: ~20 anggota check in/out
      const dayAnggota = anggotaData.slice(0, 20 + Math.floor(Math.random() * 5));
      for (const a of dayAnggota) {
        const isTerlambat = Math.random() < 0.15;
        const shiftHour = parseInt(a.shift.split(':')[0]);
        
        // Absen masuk
        const masukTime = new Date(date);
        masukTime.setHours(shiftHour + (isTerlambat ? 1 : 0), Math.floor(Math.random() * 30), 0);
        
        const pos = posJaga.find(p => p.id === a.pos_jaga_id);
        await pool.query(
          `INSERT INTO absensi (id,user_id,tipe,waktu,latitude,longitude,alamat,pos_jaga,status,dalam_radius) VALUES ($1,$2,'masuk',$3,$4,$5,$6,$7,$8,$9)`,
          [uuidv4(), a.id, masukTime.toISOString(), a.lat + (Math.random()-0.5)*0.0005, a.lng + (Math.random()-0.5)*0.0005,
           lokasi.find(l => l.id === a.lokasi_id)?.alamat || 'Riau',
           pos?.nama || 'Pos Jaga',
           isTerlambat ? 'terlambat' : 'hadir', Math.random() > 0.1]
        );
        absensiCount++;

        // Absen keluar (80% chance if not today)
        if (day > 0 || Math.random() > 0.3) {
          const keluarTime = new Date(masukTime);
          keluarTime.setHours(keluarTime.getHours() + 8, Math.floor(Math.random() * 30), 0);
          await pool.query(
            `INSERT INTO absensi (id,user_id,tipe,waktu,latitude,longitude,alamat,pos_jaga,status,dalam_radius) VALUES ($1,$2,'keluar',$3,$4,$5,$6,$7,'hadir',$8)`,
            [uuidv4(), a.id, keluarTime.toISOString(), a.lat + (Math.random()-0.5)*0.0005, a.lng + (Math.random()-0.5)*0.0005,
             lokasi.find(l => l.id === a.lokasi_id)?.alamat || 'Riau',
             pos?.nama || 'Pos Jaga', Math.random() > 0.05]
          );
          absensiCount++;
        }
      }
    }
    console.log(`   ✅ ${absensiCount} record absensi dibuat`);

    // ===== PATROLI =====
    console.log('🚶 Membuat data Patroli...');
    let patroliCount = 0;
    for (let day = 0; day < 7; day++) {
      const date = daysAgo(day);
      for (let r = 0; r < routeData.length; r++) {
        if (Math.random() > 0.7) continue; // skip some
        const route = routeData[r];
        const lokasiAnggota = anggotaData.filter(a => a.lokasi_id === route.lokasi_id);
        if (!lokasiAnggota.length) continue;
        const patroller = pick(lokasiAnggota);
        
        const startTime = new Date(date);
        startTime.setHours(6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + route.waktu_estimasi + Math.floor(Math.random() * 15));
        
        const cpTotal = route.checkpoint_ids.length || 2;
        const cpScanned = Math.max(1, cpTotal - Math.floor(Math.random() * 2));
        const status = cpScanned >= cpTotal ? 'completed' : (day === 0 && Math.random() > 0.5 ? 'active' : 'incomplete');

        const patroliId = uuidv4();
        await pool.query(
          `INSERT INTO patroli (id,user_id,route_id,route_name,start_time,end_time,status,checkpoint_scanned,checkpoint_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [patroliId, patroller.id, route.id, route.nama, startTime.toISOString(),
           status === 'active' ? null : endTime.toISOString(), status, cpScanned, cpTotal]
        );
        patroliCount++;
      }
    }
    console.log(`   ✅ ${patroliCount} patroli dibuat`);

    // ===== LAPORAN HARIAN =====
    console.log('📝 Membuat Laporan Harian...');
    const kondisiOptions = ['aman', 'ada_masalah', 'perhatian_khusus'];
    const aktivitasTemplates = [
      'Patroli rutin keliling area, kondisi aman. Tidak ada temuan mencurigakan.',
      'Melakukan pengecekan seluruh pintu dan jendela. Semua terkunci dengan baik.',
      'Koordinasi dengan tim shift sebelumnya. Menerima laporan situasi area.',
      'Pengecekan CCTV area parkir dan lobby. Semua kamera berfungsi normal.',
      'Melakukan sweeping area gudang. Ditemukan satu pintu tidak terkunci.',
      'Mengawasi keluar masuk kendaraan dan tamu. Total 47 kendaraan masuk hari ini.',
      'Patroli malam area taman dan parkir. Mematikan lampu area yang tidak diperlukan.',
      'Pengecekan instalasi listrik dan hydrant. Semua dalam kondisi siap pakai.',
    ];
    const temuanTemplates = [
      'Tidak ada temuan khusus.',
      'Lampu area parkir timur mati, sudah dilaporkan ke teknisi.',
      'Ditemukan pintu darurat lantai 2 tidak terkunci. Sudah diamankan.',
      'CCTV kamera 3 area loading dock bermasalah. Perlu perbaikan.',
      'Ada kebocoran pipa di toilet lantai 1. Sudah koordinasi dengan maintenance.',
      'Kendaraan tanpa identitas parkir di area terlarang. Sudah ditindaklanjuti.',
      null, null, // some reports have no findings
    ];
    
    let lhCount = 0;
    for (let day = 0; day < 7; day++) {
      const date = daysAgo(day);
      const dateStr = date.toISOString().split('T')[0];
      const dayAnggota = anggotaData.slice(0, 15).sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 5));
      
      for (const a of dayAnggota) {
        const statusLh = day === 0 ? pick(['draft', 'pending']) : pick(['approved', 'approved', 'pending', 'revision']);
        const pos = posJaga.find(p => p.id === a.pos_jaga_id);
        await pool.query(
          `INSERT INTO laporan_harian (id,user_id,tanggal,shift,pos_jaga,kondisi,aktivitas,temuan,status,validated_by,catatan_komandan) 
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [uuidv4(), a.id, dateStr, a.shift, pos?.nama || 'Pos Jaga',
           pick(kondisiOptions), pick(aktivitasTemplates), pick(temuanTemplates),
           statusLh,
           statusLh === 'approved' ? pick(cmdIds) : null,
           statusLh === 'approved' ? 'Laporan sudah sesuai. Good job!' : (statusLh === 'revision' ? 'Tolong tambahkan detail temuan.' : null)]
        );
        lhCount++;
      }
    }
    console.log(`   ✅ ${lhCount} laporan harian dibuat`);

    // ===== LAPORAN KEJADIAN =====
    console.log('⚠️  Membuat Laporan Kejadian...');
    const jenisKejadian = ['pencurian', 'vandalisme', 'kebakaran', 'kecelakaan', 'tamu_mencurigakan', 'kehilangan_barang', 'gangguan_keamanan', 'kerusakan_fasilitas'];
    const prioritasOptions = ['rendah', 'sedang', 'tinggi', 'kritis'];
    const kronologiTemplates = [
      'Pada pukul {time}, petugas menemukan {jenis} di area {area}. Segera melakukan pengamanan dan melapor ke komandan.',
      'Kejadian terdeteksi melalui CCTV pada pukul {time}. Petugas langsung menuju lokasi di area {area} untuk verifikasi.',
      'Laporan dari karyawan mengenai {jenis} di {area}. Petugas segera menuju lokasi dan melakukan penanganan awal.',
      'Saat patroli rutin pukul {time}, ditemukan indikasi {jenis} di sekitar {area}. Dilakukan dokumentasi dan pengamanan.',
    ];
    const areas = ['Parkir Lt.1', 'Lobby Utama', 'Gudang Belakang', 'Area Loading Dock', 'Taman Depan', 'Ruang Server', 'Kantin', 'Toilet Lt.2'];
    
    let lkCount = 0;
    for (let day = 0; day < 14; day++) {
      if (Math.random() > 0.6) continue; // Not every day has incidents
      const date = daysAgo(day);
      const numIncidents = 1 + Math.floor(Math.random() * 2);
      
      for (let j = 0; j < numIncidents; j++) {
        const reporter = pick(anggotaData.slice(0, 20));
        const jenis = pick(jenisKejadian);
        const prioritas = pick(prioritasOptions);
        const area = pick(areas);
        const time = `${String(6 + Math.floor(Math.random() * 16)).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;
        const kronologi = pick(kronologiTemplates).replace('{time}', time).replace('{jenis}', jenis).replace('{area}', area);
        const statusLk = day === 0 ? pick(['draft', 'pending']) : pick(['approved', 'approved', 'pending']);

        await pool.query(
          `INSERT INTO laporan_kejadian (id,user_id,jenis,prioritas,waktu_kejadian,lokasi_text,latitude,longitude,kronologi,status,validated_by,catatan_komandan) 
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [uuidv4(), reporter.id, jenis, prioritas, date.toISOString(),
           area, reporter.lat + (Math.random()-0.5)*0.001, reporter.lng + (Math.random()-0.5)*0.001,
           kronologi, statusLk,
           statusLk === 'approved' ? pick(cmdIds) : null,
           statusLk === 'approved' ? 'Sudah ditindaklanjuti.' : null]
        );
        lkCount++;
      }
    }
    console.log(`   ✅ ${lkCount} laporan kejadian dibuat`);

    // ===== SERAH TERIMA =====
    console.log('🤝 Membuat Serah Terima...');
    let stCount = 0;
    for (let day = 1; day < 7; day++) {
      const dayAnggota = anggotaData.slice(0, 10).sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(3, dayAnggota.length - 1); i++) {
        const from = dayAnggota[i];
        const to = dayAnggota[i + 1];
        await pool.query(
          `INSERT INTO serah_terima (id,user_id,penerima_id,kondisi_area,inventaris,catatan,dikonfirmasi,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [uuidv4(), from.id, to.id,
           pick(['aman', 'masalah', 'perhatian']),
           JSON.stringify([
             { nama: 'HT Radio', jumlah: 2, kondisi: 'baik' },
             { nama: 'Senter', jumlah: 1, kondisi: 'baik' },
             { nama: 'Kunci Gembok', jumlah: 5, kondisi: 'baik' },
             { nama: 'Buku Log', jumlah: 1, kondisi: 'baik' },
           ]),
           pick(['Semua aman, tidak ada kendala.', 'AC ruang server bunyi aneh, sudah dilaporkan.', 'Kunci cadangan gudang belum dikembalikan.', 'Lampu koridor selatan berkedip.']),
           true,
           daysAgo(day).toISOString()]
        );
        stCount++;
      }
    }
    console.log(`   ✅ ${stCount} serah terima dibuat`);

    // ===== BROADCASTS =====
    console.log('📢 Membuat Broadcasts...');
    const broadcasts = [
      { judul: 'Briefing Pagi', pesan: 'Seluruh personil harap berkumpul di pos utama pukul 06:00 untuk briefing harian.', prioritas: 'normal' },
      { judul: 'Libur Nasional', pesan: 'Hari Jumat tanggal 21 Februari adalah hari libur nasional. Jadwal shift tetap berjalan normal.', prioritas: 'normal' },
      { judul: 'Update Seragam', pesan: 'Seragam baru sudah tersedia di kantor pusat. Silakan ambil sesuai jadwal yang ditentukan.', prioritas: 'normal' },
      { judul: 'Waspada Cuaca', pesan: 'BMKG memprediksi hujan lebat dan angin kencang malam ini. Harap extra waspada saat patroli.', prioritas: 'urgent' },
    ];
    for (let i = 0; i < broadcasts.length; i++) {
      await pool.query(
        `INSERT INTO broadcasts (id,pengirim_id,judul,pesan,prioritas,target,created_at) VALUES ($1,$2,$3,$4,$5,'all',$6)`,
        [uuidv4(), pick(cmdIds), broadcasts[i].judul, broadcasts[i].pesan, broadcasts[i].prioritas, daysAgo(i).toISOString()]
      );
    }
    console.log(`   ✅ ${broadcasts.length} broadcasts dibuat`);

    // ===== NOTIFIKASI =====
    console.log('🔔 Membuat Notifikasi...');
    const notifTemplates = [
      { tipe: 'info', judul: 'Jadwal shift diperbarui', pesan: 'Jadwal shift minggu depan sudah diupdate. Silakan cek.' },
      { tipe: 'warning', judul: 'Laporan belum divalidasi', pesan: 'Ada 3 laporan harian yang belum divalidasi. Segera review.' },
      { tipe: 'success', judul: 'Patroli selesai', pesan: 'Patroli rute Chevron selesai dengan semua checkpoint terpindai.' },
      { tipe: 'danger', judul: 'Geofence violation', pesan: 'Anggota terdeteksi di luar wilayah kerja tanpa izin.' },
      { tipe: 'info', judul: 'Absensi tercatat', pesan: 'Absensi masuk berhasil dicatat pada pukul 06:05.' },
    ];
    for (let i = 0; i < 20; i++) {
      const tmpl = pick(notifTemplates);
      const targetUser = pick(allAnggotaCmdIds);
      await pool.query(
        `INSERT INTO notifikasi (id,tipe,judul,pesan,target_user_id,dibaca,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), tmpl.tipe, tmpl.judul, tmpl.pesan, targetUser, Math.random() > 0.4, daysAgo(Math.floor(Math.random() * 5)).toISOString()]
      );
    }
    console.log(`   ✅ 20 notifikasi dibuat`);

    // ===== PANIC ALERTS =====
    console.log('🚨 Membuat Panic Alerts...');
    const panicStatuses = ['resolved', 'resolved', 'false_alarm'];
    for (let i = 0; i < 3; i++) {
      const alerter = pick(anggotaData.slice(0, 15));
      await pool.query(
        `INSERT INTO panic_alerts (id,user_id,latitude,longitude,alamat,status,resolved_by,resolved_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuidv4(), alerter.id, alerter.lat, alerter.lng,
         lokasi.find(l => l.id === alerter.lokasi_id)?.alamat || 'Riau',
         panicStatuses[i], pick(cmdIds), daysAgo(i).toISOString(), daysAgo(i + 1).toISOString()]
      );
    }
    console.log(`   ✅ 3 panic alerts dibuat`);

    // ===== AUDIT LOG =====
    console.log('📜 Membuat Audit Log...');
    const auditActions = ['LOGIN', 'CREATE', 'UPDATE', 'EXPORT'];
    const auditResources = ['auth', 'absensi', 'patroli', 'laporan', 'users'];
    for (let i = 0; i < 50; i++) {
      await pool.query(
        `INSERT INTO audit_log (id,user_id,user_nama,action,resource,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), pick(allUserIds), pick(anggotaNames.concat(['Sopiak Pranata', 'Hendri Saputra', 'Rizky Firmansyah'])),
         pick(auditActions), pick(auditResources),
         JSON.stringify({ ip: '192.168.1.' + (10 + Math.floor(Math.random() * 240)) }),
         daysAgo(Math.floor(Math.random() * 7)).toISOString()]
      );
    }
    console.log(`   ✅ 50 audit log dibuat`);

    // ===== SUMMARY =====
    console.log('\n' + '='.repeat(55));
    console.log('✅ SEED LENGKAP BERHASIL!');
    console.log('='.repeat(55));
    console.log('');
    console.log('📊 Data yang dibuat:');
    console.log(`   Lokasi:            ${lokasi.length}`);
    console.log(`   Pos Jaga:          ${posJaga.length}`);
    console.log(`   Admin:             ${admins.length}`);
    console.log(`   Supervisor:        ${supervisors.length}`);
    console.log(`   Komandan:          ${komandans.length}`);
    console.log(`   Anggota:           ${anggotaNames.length}`);
    console.log(`   Checkpoints:       ${checkpointData.length}`);
    console.log(`   Rute Patroli:      ${routeData.length}`);
    console.log(`   Jadwal Shift:      ${shiftNames.length}`);
    console.log(`   Absensi:           ${absensiCount}`);
    console.log(`   Patroli:           ${patroliCount}`);
    console.log(`   Laporan Harian:    ${lhCount}`);
    console.log(`   Laporan Kejadian:  ${lkCount}`);
    console.log(`   Serah Terima:      ${stCount}`);
    console.log(`   Broadcasts:        ${broadcasts.length}`);
    console.log(`   Notifikasi:        20`);
    console.log(`   Panic Alerts:      3`);
    console.log(`   Audit Log:         50`);
    console.log('');
    console.log('🔐 DEMO LOGIN ACCOUNTS (PIN: 123456):');
    console.log('   ┌─────────┬──────────────────────┬─────────────┐');
    console.log('   │ NRP     │ Nama                 │ Role        │');
    console.log('   ├─────────┼──────────────────────┼─────────────┤');
    console.log('   │ ADM001  │ Sopiak Pranata       │ Admin       │');
    console.log('   │ SPV001  │ Hendri Saputra       │ Supervisor  │');
    console.log('   │ KMD001  │ Rizky Firmansyah     │ Komandan    │');
    console.log('   │ AGT001  │ Ahmad Fadillah       │ Anggota     │');
    console.log('   │ K-001   │ Manager PT Chevron   │ Klien       │');
    console.log('   └─────────┴──────────────────────┴─────────────┘');
    console.log('');
    console.log('📱 Quick Login di app: tap tombol role di halaman login');
    console.log('');

  } catch (err) {
    console.error('\n❌ Seed error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

seedFull();
