"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, clientsApi } from "@/lib/api";
import { fmtDate, statusColor } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function LokasiPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [klienUsers, setKlienUsers] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    nama: "",
    alamat: "",
    latitude: "-6.2088",
    longitude: "106.8456",
    radius: "500",
    status: "active",
    client_id: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    try {
      const d = await lokasiApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch {}
    try {
      const u = await clientsApi.list();
      setKlienUsers(Array.isArray(u) ? u : []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.t === "lok-map")
        setForm((f: any) => ({
          ...f,
          latitude: e.data.lat,
          longitude: e.data.lng,
        }));
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);
  const openNew = () => {
    setEdit(null);
    setForm({
      nama: "",
      alamat: "",
      latitude: "-6.2088",
      longitude: "106.8456",
      radius: "500",
      status: "active",
      client_id: "",
    });
    setModal(true);
  };
  const openEdit = (r: any) => {
    setEdit(r);
    setForm({
      nama: r.nama,
      alamat: r.alamat,
      latitude: String(r.latitude),
      longitude: String(r.longitude),
      radius: String(r.radius || 500),
      status: r.status,
      client_id: r.client_id ? String(r.client_id) : "",
    });
    setModal(true);
  };
  const handleKlienSelect = (klienId: string) => {
    const kl = klienUsers.find((k) => String(k.id) === klienId);
    if (kl)
      setForm((f) => ({ ...f, nama: kl.nama_klien, client_id: String(kl.id) }));
    else setForm((f) => ({ ...f, client_id: "" }));
  };
  const save = async () => {
    if (!form.nama) return toast("Nama lokasi wajib diisi", "warning");
    const payload: any = {
      nama: form.nama,
      alamat: form.alamat,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius: parseInt(form.radius) || 500,
      status: form.status,
      client_id: form.client_id ? parseInt(form.client_id) : null,
    };
    try {
      if (edit) {
        await lokasiApi.update(edit.id, payload);
        toast("Lokasi berhasil diperbarui");
      } else {
        await lokasiApi.create(payload);
        toast("Lokasi baru berhasil ditambahkan");
      }
      setModal(false);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const doDelete = async () => {
    try {
      await lokasiApi.del(del.id);
      toast("Lokasi berhasil dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const filtered = data.filter(
    (r) =>
      !search ||
      r.nama?.toLowerCase().includes(search.toLowerCase()) ||
      r.alamat?.toLowerCase().includes(search.toLowerCase()),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-building" />
          Lokasi / Klien
        </h1>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus" /> Tambah Lokasi
        </button>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari lokasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted">{filtered.length} lokasi</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nama Lokasi</th>
              <th>Klien</th>
              <th>Alamat</th>
              <th>Koordinat</th>
              <th>Radius</th>
              <th>Status</th>
              <th>Dibuat</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => {
              const kl = klienUsers.find((k) => k.id == r.client_id);
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.nama}</strong>
                  </td>
                  <td>
                    {kl ? (
                      <span className="badge badge-info">{kl.nama_klien}</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>{r.alamat}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {r.latitude?.toFixed?.(4)}, {r.longitude?.toFixed?.(4)}
                  </td>
                  <td>
                    <strong>{r.radius || 500}m</strong>
                  </td>
                  <td>
                    <span className={`badge badge-${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{fmtDate(r.created_at)}</td>
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
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  Tidak ada data lokasi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={edit ? "Edit Lokasi" : "Tambah Lokasi"}
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
            <label className="form-label">Pilih Klien *</label>
            <select
              className="form-select"
              value={form.client_id}
              onChange={(e) => handleKlienSelect(e.target.value)}
            >
              <option value="">-- Pilih Klien --</option>
              {klienUsers.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_klien} ({k.kode_klien})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nama Lokasi *</label>
            <input
              className="form-input"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              placeholder="Nama lokasi / perusahaan klien"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Alamat *</label>
            <textarea
              className="form-textarea"
              value={form.alamat}
              onChange={(e) => setForm({ ...form, alamat: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              📍 Pilih Lokasi di Peta (klik pada peta)
            </label>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                height: 280,
                marginTop: 4,
              }}
            >
              <iframe
                title="lok-map"
                style={{ width: "100%", height: "100%", border: "none" }}
                srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>body{margin:0}#m{height:100vh}</style></head><body><div id="m"></div><script>var la=${form.latitude || 0},ln=${form.longitude || 0},r=${form.radius || 500};var m=L.map('m').setView([la||-0.5,ln||101.4],la?14:5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(m);var mk=null,ci=null;function up(a,b){if(mk)m.removeLayer(mk);if(ci)m.removeLayer(ci);mk=L.marker([a,b]).addTo(m);ci=L.circle([a,b],{radius:r,color:'#3388ff',fillOpacity:0.12}).addTo(m)}if(la&&ln)up(la,ln);m.on('click',function(e){up(e.latlng.lat,e.latlng.lng);window.parent.postMessage({t:'lok-map',lat:e.latlng.lat.toFixed(6),lng:e.latlng.lng.toFixed(6)},'*')})<\/script></body></html>`}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Latitude</label>
              <input
                className="form-input"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude</label>
              <input
                className="form-input"
                value={form.longitude}
                onChange={(e) =>
                  setForm({ ...form, longitude: e.target.value })
                }
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Radius Geofence (meter)</label>
            <input
              type="number"
              className="form-input"
              value={form.radius}
              onChange={(e) => setForm({ ...form, radius: e.target.value })}
              min="50"
              max="5000"
            />
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
          title="Hapus Lokasi?"
          msg={`"${del.nama}" akan dihapus permanen.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

