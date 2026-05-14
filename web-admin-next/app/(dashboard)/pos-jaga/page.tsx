"use client";
import React, { useState, useEffect } from "react";
import { lokasiApi, posJagaApi } from "@/lib/api";
import { statusColor } from "@/lib/formatters";
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
    try {
      setData(await posJagaApi.list());
    } catch {}
    try {
      setLokasi(await lokasiApi.list());
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
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
  const pagedData = data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
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
      radius: String(r.radius || 100),
      latitude: String(r.latitude || ""),
      longitude: String(r.longitude || ""),
      status: r.status,
    });
    setModal(true);
  };
  const save = async () => {
    try {
      const payload = {
        ...form,
        radius: parseInt(form.radius) || 100,
        latitude: parseFloat(form.latitude) || null,
        longitude: parseFloat(form.longitude) || null,
      };
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
    }
  };
  const doDelete = async () => {
    try {
      await posJagaApi.del(del.id);
      toast("Pos Jaga dihapus");
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
                <td>
                  <strong>{r.nama}</strong>
                </td>
                <td>{lokasiName(r.lokasi_id)}</td>
                <td>{r.radius}m</td>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {r.latitude?.toFixed?.(4)}, {r.longitude?.toFixed?.(4)}
                </td>
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
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  Tidak ada data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={data.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title={`${edit ? "Edit" : "Tambah"} Pos Jaga`}
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
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          title="Hapus Pos Jaga?"
          msg={`"${del.nama}" akan dihapus.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}

