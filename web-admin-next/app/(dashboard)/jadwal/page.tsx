"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, jadwalApi } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function JadwalPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [filterLok, setFilterLok] = useState("");
  const emptyForm = {
    nama: "",
    lokasi_id: "",
    waktu_mulai: "06:00",
    waktu_selesai: "14:00",
    warna: "#2980b9",
  };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      setData(await jadwalApi.list("all=true"));
    } catch (e: any) {
      toast(e?.message || "Gagal memuat jadwal shift", "error");
    } finally {
      setLoading(false);
    }
    try {
      setLokasi(await lokasiApi.list());
    } catch (e: any) { toast(e?.message || "Gagal memuat data pendukung (lokasi/checkpoint/shift). Muat ulang halaman.", "warning"); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setCurrentPage(1); }, [filterLok]);
  const lokasiName = (id: string) =>
    lokasi.find((l: any) => l.id === id)?.nama || "-";
  const openNew = () => {
    setEdit(null);
    setForm(emptyForm);
    setModal(true);
  };
  const openEdit = (r: any) => {
    setEdit(r);
    setForm({
      nama: r.nama,
      lokasi_id: r.lokasi_id || "",
      waktu_mulai: r.waktu_mulai || "06:00",
      waktu_selesai: r.waktu_selesai || "14:00",
      warna: r.warna || "#2980b9",
    });
    setModal(true);
  };
  const save = async () => {
    if (saving) return;
    const nama = form.nama.trim();
    if (!form.lokasi_id) return toast("Pilih lokasi/klien terlebih dahulu", "warning");
    if (nama.length < 2) return toast("Nama shift minimal 2 karakter", "warning");
    if (!/^\d{2}:\d{2}$/.test(form.waktu_mulai) || !/^\d{2}:\d{2}$/.test(form.waktu_selesai)) return toast("Waktu mulai/selesai wajib diisi (HH:MM)", "warning");
    if (form.waktu_mulai === form.waktu_selesai) return toast("Waktu mulai dan selesai tidak boleh sama", "warning");
    if (!/^#[0-9a-fA-F]{6}$/.test(form.warna)) return toast("Warna tidak valid", "warning");
    // [Audit 2B] Cegah nama shift ganda pada lokasi yang sama.
    const dup = data.find((s: any) => s.lokasi_id === form.lokasi_id && (s.nama || "").trim().toLowerCase() === nama.toLowerCase() && s.id !== edit?.id);
    if (dup) return toast(`Shift "${nama}" sudah ada di lokasi ini`, "warning");
    setSaving(true);
    try {
      if (edit) {
        await jadwalApi.update(edit.id, { ...form, nama });
        toast("Jadwal Shift diperbarui");
      } else {
        await jadwalApi.create({ ...form, nama });
        toast("Jadwal Shift ditambahkan");
      }
      setModal(false);
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
      await jadwalApi.del(del.id);
      toast("Jadwal dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const filtered = filterLok ? data.filter((r) => r.lokasi_id === filterLok) : data;
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-calendar-alt" />
          Jadwal Shift
        </h1>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus" /> Tambah
        </button>
      </div>
      <div className="section-card">
        <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
          <i className="fas fa-info-circle" /> <strong>Jadwal Shift</strong> =
          Mendefinisikan jam kerja di setiap lokasi klien. Contoh: &quot;Shift Pagi&quot;
          jam 06:00-14:00 di PT Chevron.
          <br />
          <br />
          📌 <strong>Langkah-langkah:</strong>
          <br />
          1️⃣ Pilih Lokasi/Klien tempat shift berlaku
          <br />
          2️⃣ Beri nama shift (mis: &quot;Shift Pagi&quot;, &quot;Shift Malam&quot;)
          <br />
          3️⃣ Tentukan jam mulai dan selesai
          <br />
          4️⃣ Setelah jadwal dibuat, buka menu <strong>
            Penugasan Shift
          </strong>{" "}
          untuk menugaskan personil ke shift ini pada tanggal tertentu
        </p>
        <div className="filters-row">
          <select className="form-select" style={{ width: "auto" }} value={filterLok} onChange={(e) => setFilterLok(e.target.value)}>
            <option value="">Semua Lokasi</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>{l.nama}</option>
            ))}
          </select>
          <span className="muted">{filtered.length} shift</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nama Shift</th>
              <th>Lokasi/Klien</th>
              <th>Mulai</th>
              <th>Selesai</th>
              <th>Durasi</th>
              <th>Warna</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => {
              const durasi = (() => {
                const [h1, m1] = (r.waktu_mulai || "06:00")
                  .split(":")
                  .map(Number);
                const [h2, m2] = (r.waktu_selesai || "14:00")
                  .split(":")
                  .map(Number);
                let d = h2 * 60 + m2 - (h1 * 60 + m1);
                if (d <= 0) d += 1440;
                return `${Math.floor(d / 60)}j ${d % 60}m`;
              })();
              return (
                <tr key={r.id}>
                  <td className="cell-ellipsis" title={r.nama}>
                    <strong>{r.nama}</strong>
                  </td>
                  <td className="cell-ellipsis" title={lokasiName(r.lokasi_id)}>{lokasiName(r.lokasi_id)}</td>
                  <td>{r.waktu_mulai}</td>
                  <td>{r.waktu_selesai}</td>
                  <td>{durasi}</td>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          background: r.warna,
                        }}
                      />
                      <small className="muted">{r.warna}</small>
                    </div>
                  </td>
                  <td>
                    <div className="btn-group">
                      <button className="btn-icon" onClick={() => openEdit(r)}>
                        <i className="fas fa-pen" />
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => setDel(r)}
                        style={{ color: "var(--danger)" }}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  {loading ? "Memuat..." : "Belum ada jadwal shift" + (filterLok ? " untuk lokasi ini" : ". Klik Tambah untuk membuat shift pertama.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={`${edit ? "Edit" : "Tambah"} Jadwal Shift`}
          onClose={() => !saving && setModal(false)}
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
          <div className="form-group">
            <label className="form-label">Lokasi / Klien *</label>
            <select
              className="form-select"
              value={form.lokasi_id}
              onChange={(e) => setForm({ ...form, lokasi_id: e.target.value })}
            >
              <option value="">-- Pilih --</option>
              {lokasi.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nama Shift *</label>
            <input
              className="form-input"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              placeholder="cth: Shift Pagi"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Waktu Mulai</label>
              <input
                className="form-input"
                type="time"
                value={form.waktu_mulai}
                onChange={(e) =>
                  setForm({ ...form, waktu_mulai: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Waktu Selesai</label>
              <input
                className="form-input"
                type="time"
                value={form.waktu_selesai}
                onChange={(e) =>
                  setForm({ ...form, waktu_selesai: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Warna</label>
              <input
                type="color"
                value={form.warna}
                onChange={(e) => setForm({ ...form, warna: e.target.value })}
                style={{
                  width: 50,
                  height: 36,
                  border: "none",
                  cursor: "pointer",
                }}
              />
            </div>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          busy={saving}
          title="Hapus Jadwal?"
          msg={`"${del.nama}" akan dihapus.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
