"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, checkpointsApi, routesApi, jadwalApi } from "@/lib/api";
import { statusColor } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function RoutesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [jadwalList, setJadwalList] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [search, setSearch] = useState("");
  const emptyForm = {
    nama: "",
    lokasi_id: "",
    checkpoint_ids: [] as string[],
    waktu_estimasi: "30",
    assigned_shift: "",
    status: "active",
  };
  const [form, setForm] = useState(emptyForm);
  const load = async () => {
    try {
      setData(await routesApi.list());
    } catch {}
    try {
      setLokasi(await lokasiApi.list());
    } catch {}
    try {
      setCheckpoints(await checkpointsApi.list());
    } catch {}
    try {
      setJadwalList(await jadwalApi.list());
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
  const lokasiName = (id: string) =>
    lokasi.find((l: any) => l.id === id)?.nama || "-";
  const filteredCp = checkpoints.filter(
    (c: any) => c.lokasi_id === form.lokasi_id && c.status === "active",
  );
  const filteredShifts = jadwalList.filter(
    (s: any) => s.lokasi_id === form.lokasi_id,
  );
  const toggleCp = (cpId: string) => {
    setForm((f) => ({
      ...f,
      checkpoint_ids: f.checkpoint_ids.includes(cpId)
        ? f.checkpoint_ids.filter((i) => i !== cpId)
        : [...f.checkpoint_ids, cpId],
    }));
  };
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
      checkpoint_ids: r.checkpoint_ids || [],
      waktu_estimasi: String(r.waktu_estimasi || 30),
      assigned_shift: r.assigned_shift || "",
      status: r.status,
    });
    setModal(true);
  };
  const save = async () => {
    try {
      const payload = {
        ...form,
        waktu_estimasi: parseInt(form.waktu_estimasi) || 30,
      };
      if (edit) {
        await routesApi.update(edit.id, payload);
        toast("Rute diperbarui");
      } else {
        await routesApi.create(payload);
        toast("Rute ditambahkan");
      }
      setModal(false);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const doDelete = async () => {
    try {
      await routesApi.del(del.id);
      toast("Rute dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const filtered = data.filter(
    (r) => !search || r.nama?.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-project-diagram" />
          Rute Patroli
        </h1>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus" /> Tambah
        </button>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari rute..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nama Rute</th>
              <th>Lokasi/Klien</th>
              <th>Checkpoint</th>
              <th>Estimasi</th>
              <th>Shift</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.nama}</strong>
                </td>
                <td>{lokasiName(r.lokasi_id)}</td>
                <td>{(r.checkpoint_ids || []).length} titik</td>
                <td>{r.waktu_estimasi} mnt</td>
                <td>{r.assigned_shift || "-"}</td>
                <td>
                  <span className={`badge badge-${statusColor(r.status)}`}>
                    {r.status}
                  </span>
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  Tidak ada data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal
          title={`${edit ? "Edit" : "Tambah"} Rute Patroli`}
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
            <label className="form-label">
              Lokasi / Klien *{" "}
              <small className="muted">
                (pilih dulu, baru checkpoint muncul)
              </small>
            </label>
            <select
              className="form-select"
              value={form.lokasi_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  lokasi_id: e.target.value,
                  checkpoint_ids: [],
                })
              }
            >
              <option value="">-- Pilih Lokasi --</option>
              {lokasi.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nama Rute *</label>
            <input
              className="form-input"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
            />
          </div>
          {form.lokasi_id && (
            <div className="form-group">
              <label className="form-label">
                Pilih Checkpoint ({form.checkpoint_ids.length} dipilih)
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                {filteredCp.length > 0 ? (
                  filteredCp.map((c) => (
                    <button
                      key={c.id}
                      className={`form-chip ${form.checkpoint_ids.includes(c.id) ? "active" : ""}`}
                      onClick={() => toggleCp(c.id)}
                    >
                      <i
                        className={`fas fa-${form.checkpoint_ids.includes(c.id) ? "check-circle" : "circle"}`}
                        style={{ marginRight: 4 }}
                      />
                      {c.nama}
                    </button>
                  ))
                ) : (
                  <span className="muted" style={{padding:'12px',background:'var(--warning-light)',borderRadius:8,display:'block',width:'100%'}}>
                    {form.lokasi_id ? "⚠️ Tidak ada checkpoint aktif untuk lokasi ini. Buat dulu di menu Checkpoint." : "👆 Pilih Lokasi/Klien dulu untuk melihat daftar checkpoint."}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Estimasi (menit)</label>
              <input
                className="form-input"
                type="number"
                value={form.waktu_estimasi}
                onChange={(e) =>
                  setForm({ ...form, waktu_estimasi: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select
                className="form-select"
                value={form.assigned_shift}
                onChange={(e) =>
                  setForm({ ...form, assigned_shift: e.target.value })
                }
              >
                <option value="">-- Semua Shift --</option>
                {filteredShifts.length > 0 ? (
                  filteredShifts.map((s) => (
                    <option
                      key={s.id}
                      value={`${s.waktu_mulai}-${s.waktu_selesai}`}
                    >
                      {s.nama} ({s.waktu_mulai}-{s.waktu_selesai})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="06:00-14:00">06:00-14:00</option>
                    <option value="14:00-22:00">14:00-22:00</option>
                    <option value="22:00-06:00">22:00-06:00</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <div className="form-chip-row">
              {["active", "inactive"].map((s) => (
                <button
                  key={s}
                  className={`form-chip ${form.status === s ? "active" : ""}`}
                  onClick={() => setForm({ ...form, status: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          title="Hapus Rute?"
          msg={`"${del.nama}" akan dihapus.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

