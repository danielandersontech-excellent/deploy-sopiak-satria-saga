"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, posJagaApi } from "@/lib/api";
import { statusColor, statusLabel } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function PosJagaPage() {
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
    lokasi_id: "",
    radius: "100",
    latitude: "",
    longitude: "",
    status: "active",
  };
  const [form, setForm] = useState(emptyForm);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    setLoading(true);
    try {
      setData(await posJagaApi.list("all=true"));
    } catch (e: any) {
      toast(e?.message || "Gagal memuat pos jaga", "error");
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
      if (e.data?.t === "pj-map")
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
  const filtered = data.filter(
    (r) =>
      (!filterLok || r.lokasi_id === filterLok) &&
      (!search || `${r.nama || ""} ${lokasiName(r.lokasi_id)}`.toLowerCase().includes(search.toLowerCase())),
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
      nama: r.nama,
      lokasi_id: r.lokasi_id || "",
      radius: String(r.radius || 100),
      latitude: String(r.latitude || ""),
      longitude: String(r.longitude || ""),
      status: r.status,
    });
    setModal(true);
  };
  const save = async () => {
    if (saving) return;
    const nama = form.nama.trim();
    const radius = parseInt(form.radius);
    const lat = form.latitude === "" ? null : parseFloat(form.latitude);
    const lng = form.longitude === "" ? null : parseFloat(form.longitude);
    if (!form.lokasi_id) return toast("Pilih lokasi/klien terlebih dahulu", "warning");
    if (nama.length < 2) return toast("Nama pos jaga minimal 2 karakter", "warning");
    if (!Number.isFinite(radius) || radius < 5 || radius > 5000) return toast("Radius harus 5–5000 meter", "warning");
    if ((lat === null) !== (lng === null)) return toast("Isi latitude DAN longitude, atau kosongkan keduanya", "warning");
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return toast("Latitude tidak valid", "warning");
    if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) return toast("Longitude tidak valid", "warning");
    const payload = { ...form, nama, radius, latitude: lat, longitude: lng };
    setSaving(true);
    try {
      if (edit) {
        await posJagaApi.update(edit.id, payload);
        toast("Pos Jaga diperbarui");
      } else {
        await posJagaApi.create(payload);
        toast("Pos Jaga ditambahkan");
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
      await posJagaApi.del(del.id);
      toast("Pos Jaga dihapus");
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
          <i className="fas fa-map-pin" />
          Pos Jaga
        </h1>
        <button className="btn btn-primary" onClick={openNew}>
          <i className="fas fa-plus" /> Tambah
        </button>
      </div>
      <div className="section-card">
        <p className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
          <i className="fas fa-info-circle" />{" "}
          <strong>Perbedaan Pos Jaga vs Checkpoint:</strong>
          <br />
          <br />
          🏢 <strong>Pos Jaga</strong> = Tempat berjaga tetap (gate, lobby,
          parkir). Anggota <em>berdiam</em> di pos ini dan harus tetap dalam
          radius pos. Absensi dilakukan dari pos jaga. Contoh: Gate Utama,
          Parkir Basement, Lobby Lt.1
          <br />
          <br />
          📍 <strong>Checkpoint</strong> = Titik yang harus di-scan saat{" "}
          <em>patroli keliling</em>. Anggota berjalan menuju checkpoint, scan
          QR, lalu lanjut ke checkpoint berikutnya sesuai rute. Contoh: Gudang
          A, Area Loading, Server Room
        </p>
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input placeholder="Cari pos jaga..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: "auto" }} value={filterLok} onChange={(e) => setFilterLok(e.target.value)}>
            <option value="">Semua Lokasi</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>{l.nama}</option>
            ))}
          </select>
          <span className="muted">{filtered.length} pos jaga</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Lokasi/Klien</th>
              <th>Radius</th>
              <th>Koordinat</th>
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
                <td>{r.radius}m</td>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {r.latitude != null && r.longitude != null ? `${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}` : <span className="muted">ikut lokasi</span>}
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
                <td colSpan={6} className="empty-row">
                  {loading ? "Memuat..." : "Belum ada pos jaga" + (search || filterLok ? " untuk filter ini" : ". Klik Tambah untuk membuat pos jaga pertama.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={`${edit ? "Edit" : "Tambah"} Pos Jaga`}
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
            <label className="form-label">Nama Pos Jaga *</label>
            <input
              className="form-input"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              📍 Pilih di Peta (klik pada peta)
            </label>
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
                Same iframe srcDoc pattern as checkpoint/lokasi. The
                form lat/lng inputs are type="number" here, which the
                browser enforces at the UI level — but openEdit() also
                seeds these from `r.latitude`/`r.longitude` (raw DB
                values via the data API), so we still don't want to
                trust the chain. Coerce to a finite Number at the
                point of interpolation; a non-numeric value falls back
                to the safe default.
              */}
              {(() => {
                const num = (v: any, def: number) => {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : def;
                };
                const la = num(form.latitude, 0);
                const ln = num(form.longitude, 0);
                const r = num(form.radius, 100);
                return (
                  <iframe
                    title="pj-map"
                    style={{ width: "100%", height: "100%", border: "none" }}
                    srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>body{margin:0}#m{height:100vh}</style></head><body><div id="m"></div><script>var la=${la},ln=${ln},r=${r};var m=L.map('m').setView([la||-0.5,ln||101.4],la?16:5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(m);var mk=null,ci=null;function up(a,b){if(mk)m.removeLayer(mk);if(ci)m.removeLayer(ci);mk=L.marker([a,b]).addTo(m);ci=L.circle([a,b],{radius:r,color:'#e74c3c',fillOpacity:0.12}).addTo(m)}if(la&&ln)up(la,ln);m.on('click',function(e){up(e.latlng.lat,e.latlng.lng);window.parent.postMessage({t:'pj-map',lat:e.latlng.lat.toFixed(6),lng:e.latlng.lng.toFixed(6)},'*')})<\/script></body></html>`}
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
          title="Hapus Pos Jaga?"
          msg={`"${del.nama}" akan dihapus.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
