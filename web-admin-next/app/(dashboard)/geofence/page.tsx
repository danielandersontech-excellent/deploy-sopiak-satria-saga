"use client";
import React, { useState, useEffect, useCallback } from "react";
import { geofenceApi } from "@/lib/api";
import { onRealtimeEvent } from "@/lib/socketClient";
import { fmtDate, fmtDateTime, statusColor } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/hooks/useToast";

export default function GeofencePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"izin" | "violations">("izin");
  const [izinList, setIzinList] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [approveModal, setApproveModal] = useState<any>(null);
  const [durasi, setDurasi] = useState(30);
  const [catatan, setCatatan] = useState("");
  const loadData = useCallback(async () => {
    try {
      const [iz, vi] = await Promise.all([
        geofenceApi.izinList(),
        geofenceApi.violations(),
      ]);
      setIzinList(iz);
      setViolations(vi);
    } catch {}
  }, []);
  useEffect(() => {
    loadData();
    const unsub = onRealtimeEvent((ev) => {
      if (ev.includes("geofence")) loadData();
    });
    return unsub;
  }, []);
  const handleApprove = async () => {
    if (!approveModal) return;
    try {
      await geofenceApi.izinApprove(approveModal.id, durasi, catatan);
      toast("Izin disetujui!");
      setApproveModal(null);
      loadData();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const handleReject = async (id: string) => {
    try {
      await geofenceApi.izinReject(id, "Ditolak");
      toast("Izin ditolak");
      loadData();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const handleAck = async (id: string) => {
    try {
      await geofenceApi.ackViolation(id);
      toast("Pelanggaran ditanggapi");
      loadData();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-shield-alt" />
          Geofence & Izin Keluar
        </h1>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Kelola izin keluar radius bagi anggota. Jika anggota ingin keluar dari
        radius lokasi, mereka harus minta izin ke komandan. Setelah disetujui,
        ada batas waktu. Jika keluar tanpa izin, muncul pelanggaran.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${tab === "izin" ? "btn-primary" : "btn-outline"}`}
          onClick={() => setTab("izin")}
        >
          📋 Izin Keluar (
          {izinList.filter((i) => i.status === "pending").length} pending)
        </button>
        <button
          className={`btn ${tab === "violations" ? "btn-danger" : "btn-outline"}`}
          onClick={() => setTab("violations")}
        >
          ⚠️ Pelanggaran ({violations.filter((v) => !v.acknowledged).length}{" "}
          belum)
        </button>
      </div>
      {tab === "izin" && (
        <div className="section-card">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>NRP</th>
                <th>Alasan</th>
                <th>Durasi</th>
                <th>Batas Waktu</th>
                <th>Status</th>
                <th>Waktu</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {izinList.map((iz) => (
                <tr key={iz.id}>
                  <td>
                    <strong>{iz.user_nama}</strong>
                  </td>
                  <td>
                    <code>{iz.nrp}</code>
                  </td>
                  <td>{iz.alasan}</td>
                  <td>{iz.durasi_menit ? `${iz.durasi_menit} mnt` : "-"}</td>
                  <td>{iz.batas_waktu ? fmtDateTime(iz.batas_waktu) : "-"}</td>
                  <td>
                    <span className={`badge badge-${statusColor(iz.status)}`}>
                      {iz.status}
                    </span>
                  </td>
                  <td>{fmtDateTime(iz.created_at)}</td>
                  <td>
                    {iz.status === "pending" && (
                      <div className="btn-group">
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setApproveModal(iz);
                            setDurasi(30);
                            setCatatan("");
                          }}
                        >
                          ✓ Setujui
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleReject(iz.id)}
                          style={{ color: "var(--danger)" }}
                        >
                          ✗ Tolak
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {izinList.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-row">
                    Tidak ada data izin
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "violations" && (
        <div className="section-card">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Jarak</th>
                <th>Lokasi</th>
                <th>Waktu</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.user_nama}</strong>
                  </td>
                  <td>
                    {v.tipe === "no_permission" ? (
                      <span className="badge badge-danger">Tanpa Izin</span>
                    ) : (
                      <span className="badge badge-warning">Overtime</span>
                    )}
                  </td>
                  <td>{v.jarak_dari_pusat}m</td>
                  <td>{v.lokasi_nama || "-"}</td>
                  <td>{fmtDateTime(v.created_at)}</td>
                  <td>
                    {v.acknowledged ? (
                      <span className="badge badge-success">Ditanggapi</span>
                    ) : (
                      <span className="badge badge-warning">Belum</span>
                    )}
                  </td>
                  <td>
                    {!v.acknowledged && (
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleAck(v.id)}
                      >
                        Tanggapi
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {violations.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-row">
                    Tidak ada pelanggaran
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {approveModal && (
        <Modal
          title={`Setujui Izin - ${approveModal.user_nama}`}
          onClose={() => setApproveModal(null)}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setApproveModal(null)}
              >
                Batal
              </button>
              <button className="btn btn-primary" onClick={handleApprove}>
                Setujui
              </button>
            </>
          }
        >
          <p className="muted" style={{ marginBottom: 12 }}>
            Tentukan berapa menit anggota boleh keluar dari radius. Setelah
            waktu habis, status izin menjadi expired.
          </p>
          <div className="form-group">
            <label className="form-label">Durasi (menit) *</label>
            <input
              type="number"
              className="form-input"
              value={durasi}
              onChange={(e) => setDurasi(parseInt(e.target.value) || 0)}
              min={1}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Catatan</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

