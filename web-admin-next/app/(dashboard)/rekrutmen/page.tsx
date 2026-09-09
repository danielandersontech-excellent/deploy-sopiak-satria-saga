"use client";
import React, { useState, useEffect, useCallback } from "react";
import { rekrutmenApi, lokasiApi, getUser } from "@/lib/api";
import { fmtDate, fmtDateTime, statusColor, statusLabel } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

/**
 * REKRUTMEN — pelamar dari formulir publik website (/karir).
 *
 * - Daftar ber-pagination server (20/halaman) + filter status/posisi/pencarian.
 * - Detail: data lengkap + berkas privat (diunduh lewat endpoint ber-auth,
 *   dibuka sebagai object URL — bukan tautan /uploads statis).
 * - Ubah status + catatan admin; "Jadikan Anggota" membuat akun users dengan
 *   NRP AGT/KMD berikutnya, PIN awal 123456, must_change_pin = TRUE.
 * - Hapus lamaran (admin saja) — berkas fisik ikut dihapus di server.
 */

// [Misi V3 / B2] Warna & label status kini dari lib/formatters (satu peta untuk semua halaman).
const STATUS_VALUES = ["baru", "diproses", "wawancara", "diterima", "ditolak", "dibatalkan"];
const STATUS: { v: string; l: string }[] = STATUS_VALUES.map((v) => ({ v, l: statusLabel(v) }));
const statusBadge = (s: string) => statusColor(s);

const BERKAS: { k: string; l: string }[] = [
  { k: "foto", l: "Pas Foto" }, { k: "ktp", l: "KTP" }, { k: "kk", l: "Kartu Keluarga" },
  { k: "ijazah", l: "Ijazah" }, { k: "skck", l: "SKCK" }, { k: "cv", l: "CV" }, { k: "sertifikat", l: "Sertifikat" },
];
const SHIFTS = ["06:00-14:00", "14:00-22:00", "22:00-06:00"];

const maskNik = (nik?: string) => (nik && nik.length === 16 ? `${nik.slice(0, 6)}••••••${nik.slice(-4)}` : nik || "-");
const umur = (tgl?: string) => {
  if (!tgl) return null;
  const t = new Date(tgl).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
};
const jumlahBerkas = (b: any) => (b && typeof b === "object" ? Object.keys(b).length : 0);

export default function RekrutmenPage() {
  const { toast } = useToast();
  const isAdmin = getUser()?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPosisi, setFilterPosisi] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [lokasi, setLokasi] = useState<any[]>([]);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: "baru", catatan_admin: "" });
  const [saving, setSaving] = useState(false);
  const [berkasLoading, setBerkasLoading] = useState("");
  const [rekrutModal, setRekrutModal] = useState<any>(null);
  const [rekrutForm, setRekrutForm] = useState({ lokasi_id: "", shift: "06:00-14:00", role: "anggota" });
  const [rekrutResult, setRekrutResult] = useState<any>(null);
  const [del, setDel] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filterStatus) qs.set("status", filterStatus);
      if (filterPosisi) qs.set("posisi", filterPosisi);
      if (debounced.trim()) qs.set("search", debounced.trim());
      const d: any = await rekrutmenApi.list(qs.toString());
      setData(Array.isArray(d?.data) ? d.data : []);
      setTotal(Number(d?.pagination?.total) || 0);
      if (d?.summary) setSummary(d.summary);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat data pelamar", "error");
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterPosisi, debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filterStatus, filterPosisi, debounced]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    lokasiApi.list("status=active").then((d) => setLokasi(Array.isArray(d) ? d : [])).catch(() => {});
    const unsub = onRealtimeEvent((ev) => { if (ev === "rekrutmen:new") load(); });
    return unsub;
  }, [load]);

  const openDetail = async (row: any) => {
    setDetail(row);
    setStatusForm({ status: row.status, catatan_admin: row.catatan_admin || "" });
    setDetailLoading(true);
    try {
      const full = await rekrutmenApi.get(row.id);
      setDetail(full);
      setStatusForm({ status: full.status, catatan_admin: full.catatan_admin || "" });
    } catch (e: any) {
      toast(e?.message || "Gagal memuat detail", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const lihatBerkas = async (jenis: string) => {
    if (!detail) return;
    setBerkasLoading(jenis);
    try {
      const url = await rekrutmenApi.berkasBlobUrl(detail.id, jenis);
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast("Popup diblokir browser. Izinkan popup untuk melihat berkas.", "warning");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      toast(e?.message || "Gagal membuka berkas", "error");
    } finally {
      setBerkasLoading("");
    }
  };

  const simpanStatus = async () => {
    if (!detail || saving) return;
    if (statusForm.status === detail.status && (statusForm.catatan_admin || "") === (detail.catatan_admin || "")) {
      return toast("Tidak ada perubahan", "info");
    }
    setSaving(true);
    try {
      const row = await rekrutmenApi.ubahStatus(detail.id, statusForm.status, statusForm.catatan_admin);
      toast(`Status ${row.nomor_referensi} → ${statusLabel(row.status)}`);
      setDetail({ ...detail, ...row });
      load();
    } catch (e: any) {
      toast(e?.message || "Gagal mengubah status", "error");
    } finally {
      setSaving(false);
    }
  };

  const openRekrut = (row: any) => {
    setRekrutModal(row);
    setRekrutForm({ lokasi_id: "", shift: "06:00-14:00", role: row.posisi_dilamar === "komandan" ? "komandan" : "anggota" });
  };

  const doRekrut = async () => {
    if (!rekrutModal || saving) return;
    setSaving(true);
    try {
      const res = await rekrutmenApi.jadikanAnggota(rekrutModal.id, {
        lokasi_id: rekrutForm.lokasi_id || null,
        shift: rekrutForm.shift,
        role: rekrutForm.role,
      });
      setRekrutModal(null);
      setDetail(null);
      setRekrutResult(res);
      load();
    } catch (e: any) {
      toast(e?.message || "Gagal menjadikan anggota", "error");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!del || saving) return;
    setSaving(true);
    try {
      await rekrutmenApi.del(del.id);
      toast(`Lamaran ${del.nomor_referensi} dihapus`);
      setDel(null);
      if (detail?.id === del.id) setDetail(null);
      load();
    } catch (e: any) {
      toast(e?.message || "Gagal menghapus", "error");
    } finally {
      setSaving(false);
    }
  };

  const sudahAnggota = detail && (detail.status === "diterima" || detail.user_id);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><i className="fas fa-user-plus" /> Rekrutmen</h1>
        <div className="page-actions">
          <a href="https://sopiaksatriasaga.com/karir" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            <i className="fas fa-external-link-alt" /> Formulir Publik
          </a>
          <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        {[
          { l: "Total Pelamar", v: summary.total || 0, i: "fa-users", c: "blue" },
          { l: "Baru", v: summary.baru || 0, i: "fa-inbox", c: "orange" },
          { l: "Diproses / Wawancara", v: (summary.diproses || 0) + (summary.wawancara || 0), i: "fa-comments", c: "purple" },
          { l: "Diterima", v: summary.diterima || 0, i: "fa-user-check", c: "green" },
        ].map((k) => (
          <div key={k.l} className={`kpi-card ${k.c}`}>
            <div className="kpi-icon"><i className={`fas ${k.i}`} /></div>
            <div><div className="kpi-val">{k.v}</div><div className="kpi-label">{k.l}</div></div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari nama / NIK / nomor / HP..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: "auto" }} value={filterPosisi} onChange={(e) => setFilterPosisi(e.target.value)}>
            <option value="">Semua Posisi</option>
            <option value="anggota">Anggota</option>
            <option value="komandan">Komandan</option>
          </select>
          <div className="form-chip-row">
            <button className={`form-chip ${filterStatus === "" ? "active" : ""}`} onClick={() => setFilterStatus("")}>Semua ({summary.total || 0})</button>
            {STATUS.map((s) => (
              <button key={s.v} className={`form-chip ${filterStatus === s.v ? "active" : ""}`} onClick={() => setFilterStatus(s.v)}>
                {s.l} ({summary[s.v] || 0})
              </button>
            ))}
          </div>
          <span className="muted" style={{ marginLeft: "auto" }}>{total} pelamar{debounced ? " (hasil pencarian)" : ""}</span>
        </div>

        {loading && data.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse" style={{ background: "var(--hover-row, #e5e7eb)", height: 48, borderRadius: 8 }} />
            ))}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>No. Referensi</th>
                <th>Pelamar</th>
                <th>NIK</th>
                <th>No. HP</th>
                <th>Posisi</th>
                <th>Pendidikan</th>
                <th>Berkas</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.nomor_referensi}</code></td>
                  <td>
                    <div className="user-cell">
                      <div>
                        <div className="user-name" title={r.nama}>{r.nama}</div>
                        <div className="user-sub">{r.jenis_kelamin === "P" ? "Perempuan" : "Laki-laki"}{umur(r.tanggal_lahir) !== null ? ` · ${umur(r.tanggal_lahir)} th` : ""}{r.lokasi_preferensi ? ` · ${r.lokasi_preferensi}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td><code style={{ fontSize: 11 }}>{maskNik(r.nik)}</code></td>
                  <td>{r.no_hp || "-"}</td>
                  <td><span className={`badge badge-${r.posisi_dilamar === "komandan" ? "info" : "default"}`}>{r.posisi_dilamar}</span></td>
                  <td>{r.pendidikan || "-"}</td>
                  <td>{jumlahBerkas(r.berkas)}/7</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                  <td><span className={`badge badge-${statusBadge(r.status)}`}>{statusLabel(r.status)}</span></td>
                  <td>
                    <div className="btn-group">
                      <button className="btn-icon" title="Detail" onClick={() => openDetail(r)}><i className="fas fa-eye" /></button>
                      {!(r.status === "diterima" || r.user_id) && !["ditolak", "dibatalkan"].includes(r.status) && (
                        <button className="btn-icon" title="Jadikan Anggota" style={{ color: "var(--success)" }} onClick={() => openRekrut(r)}><i className="fas fa-user-check" /></button>
                      )}
                      {isAdmin && (
                        <button className="btn-icon" title="Hapus" style={{ color: "var(--danger)" }} onClick={() => setDel(r)}><i className="fas fa-trash" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && !loading && (
                <tr><td colSpan={10} className="empty-row">
                  {filterStatus || debounced || filterPosisi ? "Tidak ada pelamar yang cocok dengan filter" : "Belum ada lamaran masuk. Bagikan tautan formulir publik sopiaksatriasaga.com/karir"}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
        <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {/* DETAIL */}
      {detail && (
        <Modal title={`Pelamar ${detail.nomor_referensi}`} onClose={() => setDetail(null)} wide
          footer={
            <>
              {isAdmin && <button className="btn btn-outline" style={{ color: "var(--danger)", marginRight: "auto" }} onClick={() => setDel(detail)} disabled={saving}><i className="fas fa-trash" /> Hapus</button>}
              <button className="btn btn-outline" onClick={() => setDetail(null)}>Tutup</button>
              {!sudahAnggota && !["ditolak", "dibatalkan"].includes(detail.status) && (
                <button className="btn btn-success" onClick={() => openRekrut(detail)} disabled={saving}><i className="fas fa-user-check" /> Jadikan Anggota</button>
              )}
            </>
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span className={`badge badge-${statusBadge(detail.status)}`} style={{ fontSize: 12 }}>{statusLabel(detail.status)}</span>
            <span className={`badge badge-${detail.posisi_dilamar === "komandan" ? "info" : "default"}`}>Posisi: {detail.posisi_dilamar}</span>
            {detail.user_nrp && <span className="badge badge-success">Akun: {detail.user_nrp}</span>}
            {detailLoading && <span className="muted"><i className="fas fa-spinner fa-spin" /> memuat...</span>}
          </div>
          <div className="detail-grid">
            <div className="detail-item"><div className="detail-label">Nama Lengkap</div><div className="detail-value">{detail.nama}</div></div>
            <div className="detail-item"><div className="detail-label">NIK</div><div className="detail-value"><code>{detail.nik}</code></div></div>
            <div className="detail-item"><div className="detail-label">Jenis Kelamin</div><div className="detail-value">{detail.jenis_kelamin === "P" ? "Perempuan" : "Laki-laki"}</div></div>
            <div className="detail-item"><div className="detail-label">Tempat, Tanggal Lahir</div><div className="detail-value">{detail.tempat_lahir || "-"}, {fmtDate(detail.tanggal_lahir)}{umur(detail.tanggal_lahir) !== null ? ` (${umur(detail.tanggal_lahir)} th)` : ""}</div></div>
            <div className="detail-item"><div className="detail-label">No. HP / WhatsApp</div><div className="detail-value">
              {detail.no_hp ? <a href={`https://wa.me/62${String(detail.no_hp).replace(/^0/, "")}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{detail.no_hp} <i className="fab fa-whatsapp" /></a> : "-"}
            </div></div>
            <div className="detail-item"><div className="detail-label">Email</div><div className="detail-value">{detail.email || "-"}</div></div>
            <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Alamat</div><div className="detail-value">{detail.alamat || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Pendidikan</div><div className="detail-value">{detail.pendidikan || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Tinggi / Berat</div><div className="detail-value">{detail.tinggi_badan ? `${detail.tinggi_badan} cm` : "-"} / {detail.berat_badan ? `${detail.berat_badan} kg` : "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Preferensi Lokasi</div><div className="detail-value">{detail.lokasi_preferensi || "-"}</div></div>
            <div className="detail-item"><div className="detail-label">Didaftarkan</div><div className="detail-value">{fmtDateTime(detail.created_at)}</div></div>
            {detail.pengalaman && <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Pengalaman</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.pengalaman}</div></div>}
            {detail.catatan && <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Catatan Pelamar</div><div className="detail-value" style={{ whiteSpace: "pre-wrap" }}>{detail.catatan}</div></div>}
            {detail.diproses_oleh_nama && <div className="detail-item" style={{ gridColumn: "1/-1" }}><div className="detail-label">Terakhir diproses</div><div className="detail-value">{detail.diproses_oleh_nama} · {fmtDateTime(detail.diproses_at)}</div></div>}
          </div>

          <h4 style={{ margin: "18px 0 10px", color: "var(--primary)" }}>📁 Berkas Pelamar</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
            {BERKAS.map((b) => {
              const info = detail.berkas?.[b.k];
              return (
                <div key={b.k} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{b.l}</div>
                    <div className="muted" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {info ? `${info.mime === "application/pdf" ? "PDF" : "Gambar"} · ${Math.ceil((info.ukuran || 0) / 1024)} KB` : "Tidak ada"}
                    </div>
                  </div>
                  {info ? (
                    <button className="btn btn-sm btn-outline" onClick={() => lihatBerkas(b.k)} disabled={berkasLoading === b.k}>
                      <i className={`fas ${berkasLoading === b.k ? "fa-spinner fa-spin" : "fa-eye"}`} />
                    </button>
                  ) : <span className="badge badge-default">-</span>}
                </div>
              );
            })}
          </div>

          <h4 style={{ margin: "18px 0 10px", color: "var(--primary)" }}>📝 Proses Lamaran</h4>
          {sudahAnggota ? (
            <div style={{ background: "var(--success-light)", padding: 12, borderRadius: 8, fontSize: 13 }}>
              <i className="fas fa-check-circle" style={{ color: "var(--success)" }} /> Pelamar sudah menjadi anggota{detail.user_nrp ? ` dengan NRP ${detail.user_nrp}` : ""}. Data personil dapat dilihat di menu Personil.
            </div>
          ) : (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>
                  {STATUS.filter((s) => s.v !== "diterima").map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
                <small className="muted">Untuk menerima pelamar, gunakan tombol &quot;Jadikan Anggota&quot;.</small>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan Admin</label>
                <textarea className="form-textarea" rows={2} value={statusForm.catatan_admin} onChange={(e) => setStatusForm({ ...statusForm, catatan_admin: e.target.value })} placeholder="Hasil wawancara, alasan penolakan, jadwal, dll." />
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={simpanStatus} disabled={saving}>
                  <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-save"}`} /> Simpan Status
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* JADIKAN ANGGOTA */}
      {rekrutModal && (
        <Modal title={`Jadikan Anggota — ${rekrutModal.nama}`} onClose={() => !saving && setRekrutModal(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setRekrutModal(null)} disabled={saving}>Batal</button>
              <button className="btn btn-success" onClick={doRekrut} disabled={saving}>
                <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-user-check"}`} /> {saving ? "Memproses..." : "Buat Akun Anggota"}
              </button>
            </>
          }
        >
          <div style={{ background: "var(--primary-light)", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12, color: "var(--primary)" }}>
            <i className="fas fa-info-circle" /> Sistem akan membuat akun personil dengan <strong>NRP {rekrutForm.role === "komandan" ? "KMD" : "AGT"} berikutnya</strong>, PIN awal <strong>123456</strong>, dan mewajibkan ganti PIN saat login pertama. Data & berkas pelamar disalin ke profil personil.
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <div className="form-chip-row">
              {["anggota", "komandan"].map((r) => (
                <button key={r} className={`form-chip ${rekrutForm.role === r ? "active" : ""}`} onClick={() => setRekrutForm({ ...rekrutForm, role: r })}>{r}</button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select className="form-select" value={rekrutForm.shift} onChange={(e) => setRekrutForm({ ...rekrutForm, shift: e.target.value })}>
                {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Penempatan (opsional)</label>
              <select className="form-select" value={rekrutForm.lokasi_id} onChange={(e) => setRekrutForm({ ...rekrutForm, lokasi_id: e.target.value })}>
                <option value="">-- Belum Ditempatkan --</option>
                {lokasi.map((l) => <option key={l.id} value={l.id}>📍 {l.nama}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* HASIL */}
      {rekrutResult && (
        <Modal title="Akun Anggota Dibuat" onClose={() => setRekrutResult(null)}
          footer={<button className="btn btn-primary" onClick={() => setRekrutResult(null)}>Sudah Dicatat & Tutup</button>}
        >
          <div style={{ textAlign: "center" }}>
            <div className="muted" style={{ marginBottom: 6 }}>{rekrutResult.user?.nama}</div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", margin: "8px 0 14px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "1.6rem", fontWeight: 700, padding: "12px 20px", background: "var(--hover-row)", border: "2px dashed var(--primary)", borderRadius: 12 }}>
                NRP {rekrutResult.user?.nrp}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "1.6rem", fontWeight: 700, padding: "12px 20px", background: "var(--hover-row)", border: "2px dashed var(--warning)", borderRadius: 12 }}>
                PIN {rekrutResult.initial_pin}
              </div>
            </div>
            <div style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>
              ⚠️ Sampaikan NRP & PIN awal ke anggota. Anggota WAJIB mengganti PIN saat login pertama (must_change_pin aktif).
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Role: {rekrutResult.user?.role} · Shift: {rekrutResult.user?.shift} · Penempatan: {rekrutResult.user?.status_penempatan}</div>
          </div>
        </Modal>
      )}

      {del && (
        <ConfirmDialog
          busy={saving}
          title="Hapus Lamaran?"
          msg={`Lamaran ${del.nomor_referensi} (${del.nama}) beserta seluruh berkasnya akan dihapus permanen.`}
          onConfirm={doDelete}
          onCancel={() => !saving && setDel(null)}
        />
      )}
    </div>
  );
}
