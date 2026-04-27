"use client";
import React, { useState, useEffect } from "react";
import { apiUploadFile, clientsApi } from "@/lib/api";
import { fmtDate } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function ClientsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const emptyForm = {
    kode_klien: "",
    nama_klien: "",
    jenis_kelamin: "Lainnya/Instansi",
    kontak_person: "",
    nomor_telepon: "",
    email: "",
    alamat_klien: "",
    jenis_jasa: "",
    tgl_mulai_kontrak: "",
    tgl_habis_kontrak: "",
    status_klien: "Aktif",
    path_kontrak_pdf: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    try {
      const d = await clientsApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
  const openNew = () => {
    const newCode = `CLI-${Date.now().toString().slice(-6)}`;
    setEdit(null);
    setForm({ ...emptyForm, kode_klien: newCode });
    setModal(true);
  };
  const openEdit = (r: any) => {
    setEdit(r);
    setForm({
      kode_klien: r.kode_klien || "",
      nama_klien: r.nama_klien || "",
      jenis_kelamin: r.jenis_kelamin || "Lainnya/Instansi",
      kontak_person: r.kontak_person || "",
      nomor_telepon: r.nomor_telepon || "",
      email: r.email || "",
      alamat_klien: r.alamat_klien || "",
      jenis_jasa: r.jenis_jasa || "",
      tgl_mulai_kontrak: r.tgl_mulai_kontrak?.split?.("T")?.[0] || "",
      tgl_habis_kontrak: r.tgl_habis_kontrak?.split?.("T")?.[0] || "",
      status_klien: r.status_klien || "Aktif",
      path_kontrak_pdf: r.path_kontrak_pdf || "",
    });
    setModal(true);
  };
  const save = async () => {
    if (!form.nama_klien) return toast("Nama klien wajib diisi", "warning");
    try {
      const payload: any = {
        ...form,
        nrp_login: form.kode_klien, // Auto-set login ID = kode_klien
        tgl_mulai_kontrak: form.tgl_mulai_kontrak || null,
        tgl_habis_kontrak: form.tgl_habis_kontrak || null,
      };
      if (edit) {
        await clientsApi.update(edit.id, payload);
        toast("Data klien berhasil diperbarui");
      } else {
        await clientsApi.create(payload);
        toast("Klien baru berhasil ditambahkan");
      }
      setModal(false);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const doDelete = async () => {
    try {
      await clientsApi.del(del.id);
      toast("Klien berhasil dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const filtered = data.filter(
    (r) =>
      (!search ||
        r.nama_klien?.toLowerCase().includes(search.toLowerCase()) ||
        r.kode_klien?.toLowerCase().includes(search.toLowerCase())) &&
      (!filterStatus || r.status_klien === filterStatus),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const statusBadge = (s: string) =>
    s === "Aktif" ? "success" : s === "Non-Aktif" ? "default" : "danger";
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-handshake" />
          Manajemen Klien
        </h1>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus" /> Tambah Klien
        </button>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari klien..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            style={{ width: "auto" }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Semua Status</option>
            <option value="Aktif">Aktif</option>
            <option value="Non-Aktif">Non-Aktif</option>
            <option value="Blacklist">Blacklist</option>
          </select>
          <span className="muted">{filtered.length} klien</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Klien</th>
              <th>Kontak Person</th>
              <th>Telepon</th>
              <th>Email</th>
              <th>Jenis Jasa</th>
              <th>Kontrak</th>
              <th>Login ID</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.kode_klien}</code>
                </td>
                <td>
                  <strong>{r.nama_klien}</strong>
                </td>
                <td>{r.kontak_person || "-"}</td>
                <td>{r.nomor_telepon || "-"}</td>
                <td>{r.email || "-"}</td>
                <td>{r.jenis_jasa || "-"}</td>
                <td>
                  {r.tgl_mulai_kontrak
                    ? `${fmtDate(r.tgl_mulai_kontrak)} - ${fmtDate(r.tgl_habis_kontrak)}`
                    : "-"}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <code
                        style={{
                          fontSize: 10,
                          background: "var(--hover-row)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {r.nrp_login || r.kode_klien}
                      </code>
                      <span className="muted" style={{ fontSize: 9, marginTop: 2 }}>
                        PIN: 123456
                      </span>
                    </div>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=${encodeURIComponent(r.nrp_login || r.kode_klien)}`} 
                      alt="Login QR"
                      style={{ width: 32, height: 32, borderRadius: 4, background: '#fff', border: '1px solid var(--border)' }}
                    />
                  </div>
                </td>
                <td>
                  <span
                    className={`badge badge-${statusBadge(r.status_klien)}`}
                  >
                    {r.status_klien}
                  </span>
                </td>
                <td>
                  <div className="btn-group">
                    <button
                      className="btn-icon"
                      title="Edit"
                      onClick={() => openEdit(r)}
                    >
                      <i className="fas fa-pen" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Hapus"
                      onClick={() => setDel(r)}
                      style={{ color: "var(--danger)" }}
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="empty-row">
                  Tidak ada data klien
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={edit ? "Edit Klien" : "Tambah Klien Baru"}
          onClose={() => setModal(false)}
          wide
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setModal(false)}
              >
                Batal
              </button>
              <button className="btn btn-primary" onClick={save}>
                <i className="fas fa-save" /> Simpan
              </button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kode Klien (Auto-Generate)</label>
              <input
                className="form-input"
                value={form.kode_klien}
                readOnly
                disabled
                style={{ background: "var(--hover-row)", fontWeight: 'bold', cursor: 'not-allowed' }}
                placeholder="Auto-generated"
              />
              <small className="muted">Kode klien dibuat otomatis, tidak bisa diubah</small>
            </div>
            <div className="form-group">
              <label className="form-label">Nama Klien *</label>
              <input
                className="form-input"
                value={form.nama_klien}
                onChange={(e) =>
                  setForm({ ...form, nama_klien: e.target.value })
                }
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jenis Kelamin / Tipe</label>
              <select
                className="form-select"
                value={form.jenis_kelamin}
                onChange={(e) =>
                  setForm({ ...form, jenis_kelamin: e.target.value })
                }
              >
                <option value="Lainnya/Instansi">Instansi / Perusahaan</option>
                <option value="Laki-Laki">Laki-Laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Kontak Person</label>
              <input
                className="form-input"
                value={form.kontak_person}
                onChange={(e) =>
                  setForm({ ...form, kontak_person: e.target.value })
                }
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nomor Telepon</label>
              <input
                className="form-input"
                value={form.nomor_telepon}
                onChange={(e) =>
                  setForm({ ...form, nomor_telepon: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Alamat</label>
            <textarea
              className="form-textarea"
              value={form.alamat_klien}
              onChange={(e) =>
                setForm({ ...form, alamat_klien: e.target.value })
              }
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jenis Jasa</label>
              <select
                className="form-select"
                value={form.jenis_jasa}
                onChange={(e) =>
                  setForm({ ...form, jenis_jasa: e.target.value })
                }
              >
                <option value="">-- Pilih Jenis Jasa --</option>
                <option value="Jasa Keamanan">Jasa Keamanan</option>
                <option value="Pengawalan">Pengawalan</option>
                <option value="Jasa Security">Jasa Security</option>
                <option value="Penjagaan">Penjagaan</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status Klien</label>
              <div className="form-chip-row">
                {["Aktif", "Non-Aktif", "Blacklist"].map((s) => (
                  <button
                    key={s}
                    className={`form-chip ${form.status_klien === s ? "active" : ""}`}
                    onClick={() => setForm({ ...form, status_klien: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <h4 style={{ margin: "16px 0 10px", color: "var(--primary)" }}>
            📋 Kontrak
          </h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tanggal Mulai Kontrak</label>
              <input
                className="form-input"
                type="date"
                value={form.tgl_mulai_kontrak}
                onChange={(e) =>
                  setForm({ ...form, tgl_mulai_kontrak: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal Habis Kontrak</label>
              <input
                className="form-input"
                type="date"
                value={form.tgl_habis_kontrak}
                onChange={(e) =>
                  setForm({ ...form, tgl_habis_kontrak: e.target.value })
                }
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">File Kontrak PDF</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    toast("Mengunggah file...", "info");
                    const up = await apiUploadFile("/api/data/upload?folder=kontrak", file);
                    setForm({ ...form, path_kontrak_pdf: up.url });
                    toast("File berhasil diunggah");
                  } catch (err: any) {
                    toast(err.message, "error");
                  }
                }}
                className="form-input"
              />
              {form.path_kontrak_pdf && (
                <a
                  href={form.path_kontrak_pdf}
                  target="_blank"
                  className="btn btn-sm btn-outline"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Lihat Berkas
                </a>
              )}
            </div>
            {form.path_kontrak_pdf && (
              <small className="success" style={{ marginTop: 4, display: "block" }}>
                ✓ {form.path_kontrak_pdf}
              </small>
            )}
          </div>
          <h4 style={{ margin: "16px 0 10px", color: "var(--success)" }}>
            🔐 Login Klien (Monitoring Mobile/Web)
          </h4>
          <div
            style={{
              background: "var(--primary-light)",
              padding: 12,
              borderRadius: 8,
              marginBottom: 10,
              fontSize: 12,
              color: "var(--primary)",
            }}
          >
            <i className="fas fa-info-circle" /> Klien bisa login ke web/mobile
            untuk monitoring perusahaannya. Berikan kode akses berikut. Default
            PIN: <strong>123456</strong>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ID Login Klien *</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <input
                    className="form-input"
                    value={form.kode_klien}
                    disabled
                    style={{ background: "var(--hover-row)", fontWeight: 'bold' }}
                  />
                  <small className="muted">
                    Gunakan ID ini untuk login di aplikasi mobile
                  </small>
                </div>
                {(form.kode_klien) && (
                  <div style={{ textAlign: 'center' }}>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(form.kode_klien)}`} 
                      alt="Login QR"
                      style={{ width: 60, height: 60, borderRadius: 4, background: '#fff', padding: 2, border: '1px solid var(--border)' }}
                    />
                    <div style={{ fontSize: 9, color: 'var(--primary)', marginTop: 2 }}>Scan Login</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          title="Hapus Klien?"
          msg={`"${del.nama_klien}" akan dihapus permanen.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

