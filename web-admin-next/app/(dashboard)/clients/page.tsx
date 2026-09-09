"use client";
import React, { useState, useEffect } from "react";
import { apiUploadFile, apiFetch, clientsApi } from "@/lib/api";
import { fmtDate } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { QRCodeImage } from "@/components/ui/QRCodeImage";
import { useToast } from "@/hooks/useToast";

/**
 * CLIENTS PAGE — Tahap 7
 *
 * Three Tahap 7 fixes converge in this file:
 *   - BUG #6 (P2-5): QR codes are now rendered client-side via
 *     <QRCodeImage>. No more api.qrserver.com leak.
 *   - BUG #7 (P2-6): The plaintext "PIN: 123456" hint is gone from the
 *     table and from the create/edit modal banner. Admins can no longer
 *     glance at the table and see what every klien's PIN is — even if it
 *     was a default, surfacing it builds bad muscle memory.
 *   - BUG #8 (P2-7): A "Reset PIN" action button lives in each row's
 *     Aksi column. It calls the new POST /api/data/clients/:id/reset-pin
 *     endpoint, which returns a one-shot plaintext PIN that we surface
 *     in a modal with copy + 60s countdown.
 *
 * BUG #4 (P2-2/P2-3): the loading state finally clears properly on
 * error, and the table shows a skeleton while the initial fetch runs.
 */
export default function ClientsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // BUG #8: reset-PIN flow uses two states:
  //   - resetPinConfirm: client awaiting confirmation to reset
  //   - resetPinResult: the one-shot PIN returned by the backend; we show
  //     it inside a modal with a countdown and a Copy button, then drop it.
  const [resetPinConfirm, setResetPinConfirm] = useState<any>(null);
  const [resetPinResult, setResetPinResult] = useState<{
    client: any;
    pin: string;
    secondsLeft: number;
  } | null>(null);
  const [resetPinLoading, setResetPinLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setLoading(true);
    try {
      const d = await clientsApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch (e: any) {
      toast(e?.message || "Gagal memuat data klien", "error");
    } finally {
      // BUG #4 (P2-2): always clear loading.
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // [Audit 2B] Reset halaman saat filter/pencarian berubah.
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus]);

  // BUG #8: tick the countdown on the result modal. When it hits 0 we
  // close the modal — the operator's window to read the PIN closes.
  useEffect(() => {
    if (!resetPinResult) return;
    if (resetPinResult.secondsLeft <= 0) {
      setResetPinResult(null);
      return;
    }
    const t = window.setTimeout(() => {
      setResetPinResult((prev) =>
        prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : prev,
      );
    }, 1000);
    return () => window.clearTimeout(t);
  }, [resetPinResult]);

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
    if (saving) return;
    const nama = form.nama_klien.trim();
    if (nama.length < 3) return toast("Nama klien minimal 3 karakter", "warning");
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return toast("Format email tidak valid", "warning");
    if (form.nomor_telepon && !/^[0-9+()\-\s]{6,20}$/.test(form.nomor_telepon.trim())) return toast("Nomor telepon tidak valid", "warning");
    if (form.tgl_mulai_kontrak && form.tgl_habis_kontrak && form.tgl_habis_kontrak < form.tgl_mulai_kontrak) return toast("Tanggal habis kontrak tidak boleh sebelum tanggal mulai", "warning");
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        nama_klien: nama,
        email: form.email.trim() || null,
        nrp_login: form.kode_klien, // Auto-set login ID = kode_klien
        tgl_mulai_kontrak: form.tgl_mulai_kontrak || null,
        tgl_habis_kontrak: form.tgl_habis_kontrak || null,
      };
      if (edit) {
        await clientsApi.update(edit.id, payload);
        toast("Data klien berhasil diperbarui");
        setModal(false);
      } else {
        // [Audit 2B] Backend membuat PIN acak dan mengembalikannya SEKALI sebagai
        // `temp_pin` — sebelumnya diabaikan sehingga klien baru tidak pernah bisa
        // login tanpa admin menekan Reset PIN lagi.
        const created: any = await clientsApi.create(payload);
        const row = created?.data && typeof created.data === "object" ? created.data : created;
        const tempPin = row?.temp_pin ?? created?.temp_pin ?? null;
        setModal(false);
        if (tempPin) {
          setResetPinResult({ client: { ...row, nama_klien: row?.nama_klien || nama }, pin: String(tempPin), secondsLeft: 120 });
          toast("Klien baru berhasil ditambahkan — catat PIN awal");
        } else {
          toast("Klien baru ditambahkan. PIN awal tidak tercatat di respons — gunakan Reset PIN.", "warning");
        }
      }
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };
  const doDelete = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await clientsApi.del(del.id);
      toast("Klien berhasil dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // BUG #8: actual reset call. Backend returns the new plaintext PIN
  // exactly once; we show it in a modal and never store it locally
  // beyond the modal lifetime.
  const doResetPin = async () => {
    const client = resetPinConfirm;
    if (!client) return;
    setResetPinLoading(true);
    try {
      const res: any = await apiFetch(`/api/data/clients/${client.id}/reset-pin`, {
        method: "POST",
      });
      if (!res?.pin) {
        throw new Error(res?.error || "Server tidak mengembalikan PIN baru");
      }
      setResetPinConfirm(null);
      setResetPinResult({ client, pin: String(res.pin), secondsLeft: 60 });
    } catch (e: any) {
      toast(e?.message || "Gagal reset PIN", "error");
    } finally {
      setResetPinLoading(false);
    }
  };

  const copyPin = async () => {
    if (!resetPinResult?.pin) return;
    try {
      await navigator.clipboard.writeText(resetPinResult.pin);
      toast("PIN tersalin ke clipboard");
    } catch {
      toast("Gagal menyalin ke clipboard", "warning");
    }
  };

  const filtered = data.filter(
    (r) =>
      (!search ||
        r.nama_klien?.toLowerCase().includes(search.toLowerCase()) ||
        r.kode_klien?.toLowerCase().includes(search.toLowerCase())) &&
      (!filterStatus || r.status_klien === filterStatus),
  );
  const pagedData = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
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
            {loading && data.length === 0 ? (
              // BUG #4 (P2-3): skeleton while initial fetch runs.
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td colSpan={10}>
                    <div
                      className="animate-pulse"
                      style={{
                        background: "var(--hover-row, #e5e7eb)",
                        height: 48,
                        borderRadius: 6,
                      }}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <>
                {pagedData.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.kode_klien}</code>
                    </td>
                    <td className="cell-ellipsis" title={r.nama_klien}>
                      <strong>{r.nama_klien}</strong>
                    </td>
                    <td className="cell-ellipsis-sm" title={r.kontak_person || "-"}>{r.kontak_person || "-"}</td>
                    <td>{r.nomor_telepon || "-"}</td>
                    <td className="cell-ellipsis" title={r.email || "-"}>{r.email || "-"}</td>
                    <td className="cell-ellipsis-sm" title={r.jenis_jasa || "-"}>{r.jenis_jasa || "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.tgl_mulai_kontrak
                        ? `${fmtDate(r.tgl_mulai_kontrak)} - ${fmtDate(r.tgl_habis_kontrak)}`
                        : "-"}
                      {/* [Audit 2B-r2] Penanda kontrak habis / hampir habis (≤30 hari) untuk klien Aktif. */}
                      {r.status_klien === "Aktif" && r.tgl_habis_kontrak && (() => {
                        const sisa = Math.ceil((new Date(r.tgl_habis_kontrak).getTime() - Date.now()) / 86400000);
                        if (sisa < 0) return <span className="badge badge-danger" style={{ marginLeft: 6 }} title={`Kontrak habis ${Math.abs(sisa)} hari lalu`}>Habis</span>;
                        if (sisa <= 30) return <span className="badge badge-warning" style={{ marginLeft: 6 }} title={`Sisa ${sisa} hari`}>{sisa} hr</span>;
                        return null;
                      })()}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
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
                          {/* BUG #7 (P2-6): the plaintext "PIN: 123456"
                              hint has been removed. PIN is hashed at rest
                              and admins use Reset PIN to issue a new one. */}
                        </div>
                        {/* BUG #6 (P2-5): QR rendered locally, not via api.qrserver.com. */}
                        <QRCodeImage
                          data={r.nrp_login || r.kode_klien || ""}
                          size={32}
                          alt="Login QR"
                          style={{
                            borderRadius: 4,
                            background: "#fff",
                            border: "1px solid var(--border)",
                          }}
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
                        {/* BUG #8 (P2-7): Reset PIN trigger. */}
                        <button
                          className="btn-icon"
                          title="Reset PIN"
                          onClick={() => setResetPinConfirm(r)}
                          style={{ color: "var(--warning)" }}
                        >
                          <i className="fas fa-key" />
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
              </>
            )}
          </tbody>
        </table>
        <Pagination
          currentPage={currentPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>
      {modal && (
        <Modal
          title={edit ? "Edit Klien" : "Tambah Klien Baru"}
          onClose={() => !saving && setModal(false)}
          wide
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setModal(false)}
                disabled={saving}
              >
                Batal
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-save"}`} /> {saving ? "Menyimpan..." : "Simpan"}
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
                style={{
                  background: "var(--hover-row)",
                  fontWeight: "bold",
                  cursor: "not-allowed",
                }}
                placeholder="Auto-generated"
              />
              <small className="muted">
                Kode klien dibuat otomatis, tidak bisa diubah
              </small>
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
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nama@perusahaan.com"
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
                    const up = await apiUploadFile(
                      "/api/data/upload?folder=kontrak",
                      file,
                    );
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
                  rel="noreferrer"
                >
                  Lihat Berkas
                </a>
              )}
            </div>
            {form.path_kontrak_pdf && (
              <small
                className="success"
                style={{ marginTop: 4, display: "block" }}
              >
                ✓ {form.path_kontrak_pdf}
              </small>
            )}
          </div>
          <h4 style={{ margin: "16px 0 10px", color: "var(--success)" }}>
            🔐 Login Klien (Monitoring Mobile/Web)
          </h4>
          {/* BUG #7 (P2-6): info banner used to leak the default PIN.
              Replaced with a non-revealing reminder. */}
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
            <i className="fas fa-info-circle" /> Klien dapat login ke
            web/mobile untuk monitoring. Saat klien dibuat, sistem menerbitkan{" "}
            <strong>PIN awal acak</strong> yang tampil SEKALI setelah simpan —
            catat dan sampaikan ke klien. Bila hilang, gunakan tombol{" "}
            <strong>Reset PIN</strong> di tabel.
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ID Login Klien *</label>
              <div
                style={{ display: "flex", gap: 12, alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>
                  <input
                    className="form-input"
                    value={form.kode_klien}
                    disabled
                    style={{
                      background: "var(--hover-row)",
                      fontWeight: "bold",
                    }}
                  />
                  <small className="muted">
                    Gunakan ID ini untuk login di aplikasi mobile
                  </small>
                </div>
                {form.kode_klien && (
                  <div style={{ textAlign: "center" }}>
                    {/* BUG #6 (P2-5): QR rendered locally. */}
                    <QRCodeImage
                      data={form.kode_klien}
                      size={60}
                      alt="Login QR"
                      style={{
                        borderRadius: 4,
                        background: "#fff",
                        padding: 2,
                        border: "1px solid var(--border)",
                      }}
                    />
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--primary)",
                        marginTop: 2,
                      }}
                    >
                      Scan Login
                    </div>
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

      {/* BUG #8: Reset PIN confirmation step. */}
      {resetPinConfirm && !resetPinResult && (
        <ConfirmDialog
          title="Reset PIN Klien?"
          msg={`PIN klien "${resetPinConfirm.nama_klien}" akan diganti dengan PIN baru acak. PIN lama tidak bisa digunakan lagi. Lanjutkan?`}
          onConfirm={doResetPin}
          onCancel={() => !resetPinLoading && setResetPinConfirm(null)}
        />
      )}

      {/* BUG #8: Result modal — one-shot PIN display with countdown. */}
      {resetPinResult && (
        <Modal
          title="PIN Baru Klien"
          onClose={() => {
            /* deliberately no-op: force user to click the bottom button */
          }}
          footer={
            <>
              <button className="btn btn-outline" onClick={copyPin}>
                <i className="fas fa-copy" /> Copy PIN
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setResetPinResult(null)}
              >
                Sudah Dicatat & Tutup
              </button>
            </>
          }
        >
          <div style={{ textAlign: "center" }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              {resetPinResult.client.nama_klien}
            </div>
            <div className="pin-display" aria-label="PIN baru">
              {resetPinResult.pin}
            </div>
            <div className="text-danger" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              ⚠️ Catat PIN ini sekarang. Setelah modal ditutup, PIN tidak
              dapat dilihat lagi.
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Modal akan otomatis tertutup dalam{" "}
              <strong>{resetPinResult.secondsLeft}</strong> detik.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}