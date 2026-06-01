"use client";
import React, { useState, useEffect } from "react";
import { usersApi, posJagaApi, jadwalApi, shiftAssignApi } from "@/lib/api";
import { fmtDate } from "@/lib/formatters";
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
  const [filterDate, setFilterDate] = useState("");
  const emptyForm = {
    tanggal: new Date().toISOString().split("T")[0],
    user_id: "",
    shift_id: "",
    pos_jaga_id: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    try {
      setData(await shiftAssignApi.list());
    } catch {}
    try {
      // BUG #5 (P2-4): the dropdown needs every assignable user; bypass
      // the new default pagination on /api/users.
      setUsers(await usersApi.list("all=true"));
    } catch {}
    try {
      setShifts(await jadwalApi.list());
    } catch {}
    try {
      setPosJaga(await posJagaApi.list());
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
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
    ["anggota", "komandan"].includes(u.role),
  );
  const filtered = filterDate
    ? data.filter((r) => r.tanggal?.startsWith(filterDate))
    : data;
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const openNew = () => {
    setEdit(null);
    setForm(emptyForm);
    setModal(true);
  };
  const openEdit = (r: any) => {
    setEdit(r);
    setForm({
      tanggal: r.tanggal?.split?.("T")?.[0] || "",
      user_id: r.user_id || "",
      shift_id: r.shift_id || "",
      pos_jaga_id: r.pos_jaga_id || "",
    });
    setModal(true);
  };
  const save = async () => {
    try {
      if (edit) {
        await shiftAssignApi.update(edit.id, form);
        toast("Penugasan diperbarui");
      } else {
        await shiftAssignApi.create(form);
        toast("Penugasan ditambahkan");
      }
      setModal(false);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const doDelete = async () => {
    try {
      await shiftAssignApi.del(del.id);
      toast("Penugasan dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
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
          <input
            type="date"
            className="form-input"
            style={{ width: "auto" }}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
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
                <td>{userName(r.user_id)}</td>
                <td>{shiftName(r.shift_id)}</td>
                <td>{posName(r.pos_jaga_id)}</td>
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
                  Tidak ada data
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
          onClose={() => setModal(false)}
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
              onChange={(e) => setForm({ ...form, shift_id: e.target.value })}
            >
              <option value="">-- Pilih --</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.waktu_mulai}-{s.waktu_selesai})
                </option>
              ))}
            </select>
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
              {posJaga.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          title="Hapus Penugasan?"
          msg="Data penugasan akan dihapus."
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
