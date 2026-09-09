"use client";
import React, { useState, useEffect } from "react";
import { usersApi, posJagaApi, jadwalApi, shiftAssignApi } from "@/lib/api";
import { fmtDate, toYMD } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function ShiftAssignmentPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [posJaga, setPosJaga] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  // [Audit 2B] toISOString() = UTC → setelah pukul 07:00 WIB tanggal default
  // maju/mundur satu hari. Pakai tanggal lokal.
  const emptyForm = {
    tanggal: toYMD(new Date()),
    user_id: "",
    shift_id: "",
    pos_jaga_id: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      setData(await shiftAssignApi.list("all=true"));
    } catch (e: any) {
      toast(e?.message || "Gagal memuat penugasan", "error");
    } finally {
      setLoading(false);
    }
    try {
      // BUG #5 (P2-4): the dropdown needs every assignable user; bypass
      // the new default pagination on /api/users.
      setUsers(await usersApi.list("all=true"));
    } catch (e: any) { toast(e?.message || "Gagal memuat data pendukung (lokasi/checkpoint/shift). Muat ulang halaman.", "warning"); }
    try {
      setShifts(await jadwalApi.list("all=true"));
    } catch (e: any) { toast(e?.message || "Gagal memuat data pendukung (lokasi/checkpoint/shift). Muat ulang halaman.", "warning"); }
    try {
      setPosJaga(await posJagaApi.list("all=true"));
    } catch (e: any) { toast(e?.message || "Gagal memuat data pendukung (lokasi/checkpoint/shift). Muat ulang halaman.", "warning"); }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setCurrentPage(1); }, [filterDate, search]);
  const userName = (id: string) => {
    const u = users.find((u: any) => u.id === id);
    return u ? `${u.nama} (${u.nrp})` : "-";
  };
  const shiftName = (id: string) => {
    const s = shifts.find((s: any) => s.id === id);
    return s ? `${s.nama} (${s.waktu_mulai}-${s.waktu_selesai})` : "-";
  };
  const posName = (id: string) =>
    posJaga.find((p: any) => p.id === id)?.nama || "-";
  const anggota = users.filter((u: any) =>
    ["anggota", "komandan"].includes(u.role) && u.status_penempatan !== "nonaktif",
  );
  const selectedShift = shifts.find((s: any) => s.id === form.shift_id);
  // [Audit 2B] Pos jaga yang ditawarkan mengikuti lokasi shift yang dipilih.
  const posJagaOptions = selectedShift?.lokasi_id ? posJaga.filter((p: any) => p.lokasi_id === selectedShift.lokasi_id) : posJaga;
  const filtered = data.filter((r) =>
    (!filterDate || toYMD(r.tanggal) === filterDate) &&
    (!search || `${userName(r.user_id)} ${shiftName(r.shift_id)} ${posName(r.pos_jaga_id)}`.toLowerCase().includes(search.toLowerCase())),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const openNew = () => {
    setEdit(null);
    setForm(emptyForm);
    setModal(true);
  };
  const openEdit = (r: any) => {
    setEdit(r);
    setForm({
      tanggal: toYMD(r.tanggal) || "",
      user_id: r.user_id || "",
      shift_id: r.shift_id || "",
      pos_jaga_id: r.pos_jaga_id || "",
    });
    setModal(true);
  };
  const save = async () => {
    if (saving) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.tanggal)) return toast("Tanggal wajib diisi", "warning");
    if (!form.user_id) return toast("Pilih personil", "warning");
    if (!form.shift_id) return toast("Pilih shift", "warning");
    // [5-3] Cegah double-booking sebelum create/update (selaras filter
    // unassignedToday di mobile). Backend juga menolak sebagai lapis kedua.
    const clash = data.some(
      (r: any) => r.user_id === form.user_id && toYMD(r.tanggal) === form.tanggal && r.id !== edit?.id,
    );
    if (clash) return toast("Personil ini sudah ditugaskan pada tanggal tersebut.", "error");
    const payload = { ...form, pos_jaga_id: form.pos_jaga_id || null };
    setSaving(true);
    try {
      if (edit) {
        await shiftAssignApi.update(edit.id, payload);
        toast("Penugasan diperbarui");
      } else {
        await shiftAssignApi.create(payload);
        toast("Penugasan ditambahkan");
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
      await shiftAssignApi.del(del.id);
      toast("Penugasan dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-user-clock" />
          Penugasan Shift
        </h1>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus" /> Tambah
        </button>
      </div>
      <div className="section-card">
        <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
          <i className="fas fa-info-circle" />{" "}
          <strong>Cara kerja Penugasan Shift:</strong>
          <br />
          <br />
          📌 <strong>Langkah-langkah:</strong>
          <br />
          1️⃣ Pilih <strong>tanggal</strong> penugasan
          <br />
          2️⃣ Pilih <strong>personil</strong> (anggota/komandan) yang akan
          ditugaskan
          <br />
          3️⃣ Pilih <strong>shift</strong> yang sudah dibuat di menu Jadwal Shift
          (otomatis menentukan jam kerja)
          <br />
          4️⃣ <em>Opsional:</em> Pilih <strong>Pos Jaga</strong> - lokasi tepat
          dimana personil bertugas
          <br />
          <br />
          💡 Personil yang ditugaskan otomatis terikat ke lokasi dari shift yang
          dipilih. Radius geofence mengikuti lokasi tersebut.
        </p>
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari personil / shift / pos..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input
            type="date"
            className="form-input"
            style={{ width: "auto" }}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <button className="btn btn-sm btn-outline" onClick={() => setFilterDate(toYMD(new Date()))}>Hari ini</button>
          {(filterDate || search) && <button className="btn btn-sm btn-outline" onClick={() => { setFilterDate(""); setSearch(""); }}><i className="fas fa-times" /> Reset</button>}
          <span className="muted">{filtered.length} penugasan</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Personil</th>
              <th>Shift</th>
              <th>Pos Jaga</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{fmtDate(r.tanggal)}</strong>
                </td>
                <td className="cell-ellipsis" title={userName(r.user_id)}>{userName(r.user_id)}</td>
                <td>{shiftName(r.shift_id)}</td>
                <td className="cell-ellipsis" title={posName(r.pos_jaga_id)}>{posName(r.pos_jaga_id)}</td>
                <td>{fmtDate(r.created_at)}</td>
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  {loading ? "Memuat..." : "Belum ada penugasan" + (filterDate || search ? " untuk filter ini" : ". Klik Tambah untuk membuat penugasan.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={`${edit ? "Edit" : "Tambah"} Penugasan`}
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
            <label className="form-label">Tanggal *</label>
            <input
              className="form-input"
              type="date"
              value={form.tanggal}
              onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Personil *</label>
            <select
              className="form-select"
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            >
              <option value="">-- Pilih --</option>
              {anggota.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nama} ({u.nrp}) - {u.role}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Shift *</label>
            <select
              className="form-select"
              value={form.shift_id}
              onChange={(e) => setForm({ ...form, shift_id: e.target.value, pos_jaga_id: "" })}
            >
              <option value="">-- Pilih --</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.waktu_mulai}-{s.waktu_selesai}){s.lokasi_nama ? ` · ${s.lokasi_nama}` : ""}
                </option>
              ))}
            </select>
            {shifts.length === 0 && <small className="muted">Belum ada jadwal shift — buat dulu di menu Jadwal Shift.</small>}
          </div>
          <div className="form-group">
            <label className="form-label">Pos Jaga (opsional)</label>
            <select
              className="form-select"
              value={form.pos_jaga_id}
              onChange={(e) =>
                setForm({ ...form, pos_jaga_id: e.target.value })
              }
            >
              <option value="">-- Tidak ada --</option>
              {posJagaOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
            {selectedShift && posJagaOptions.length === 0 && <small className="muted">Tidak ada pos jaga pada lokasi shift ini.</small>}
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          busy={saving}
          title="Hapus Penugasan?"
          msg="Data penugasan akan dihapus."
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
