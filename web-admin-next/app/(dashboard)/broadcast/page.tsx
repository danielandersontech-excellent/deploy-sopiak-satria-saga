"use client";
import React, { useState, useEffect } from "react";
import { authApi, getUser, broadcastsApi } from "@/lib/api";
import { fmtDate, fmtDateTime, statusColor } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/hooks/useToast";
import { onRealtimeEvent } from "@/lib/socketClient";

export default function BroadcastPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    judul: "",
    pesan: "",
    prioritas: "normal",
    target: "all",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const load = async () => {
    try {
      const d = await broadcastsApi.list();
      setData(Array.isArray(d) ? d : []);
    } catch {}
  };
  useEffect(() => {
    load();
    // [5-1] Tampilkan broadcast baru realtime (mis. dari admin/lokasi lain).
    const unsub = onRealtimeEvent((ev) => {
      if (ev === "broadcast:new") load();
    });
    return unsub;
  }, []);
  const send = async () => {
    try {
      const uid = authApi.getUserId();
      await broadcastsApi.create({ pengirim_id: uid, ...form });
      toast("Broadcast dikirim 📢");
      setModal(false);
      setForm({ judul: "", pesan: "", prioritas: "normal", target: "all" });
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const pagedData = data.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-bullhorn" />
          Broadcast
        </h1>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <i className="fas fa-paper-plane" /> Kirim
        </button>
      </div>
      <div className="section-card">
        <table>
          <thead>
            <tr>
              <th>Judul</th>
              <th>Pesan</th>
              <th>Pengirim</th>
              <th>Prioritas</th>
              <th>Target</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((r) => (
              <tr key={r.id}>
                <td className="cell-ellipsis" title={r.judul}>
                  <strong>{r.judul}</strong>
                </td>
                <td
                  style={{
                    maxWidth: 300,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.pesan}
                </td>
                <td className="cell-ellipsis-sm" title={r.pengirim?.nama || r.pengirim_nama || "-"}>{r.pengirim?.nama || r.pengirim_nama || "-"}</td>
                <td>
                  <span className={`badge badge-${statusColor(r.prioritas)}`}>
                    {r.prioritas}
                  </span>
                </td>
                <td className="cell-ellipsis-sm" title={r.target}>{r.target}</td>
                <td>{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  Tidak ada broadcast
                </td>
              </tr>
            )}
          </tbody>
        </table>
      <Pagination currentPage={currentPage} totalItems={data.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {modal && (
        <Modal
          title="Kirim Broadcast"
          onClose={() => setModal(false)}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setModal(false)}
              >
                Batal
              </button>
              <button className="btn btn-primary" onClick={send}>
                <i className="fas fa-paper-plane" /> Kirim
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Judul *</label>
            <input
              className="form-input"
              value={form.judul}
              onChange={(e) => setForm({ ...form, judul: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Pesan *</label>
            <textarea
              className="form-textarea"
              value={form.pesan}
              onChange={(e) => setForm({ ...form, pesan: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prioritas</label>
              <div className="form-chip-row">
                {["normal", "urgent"].map((p) => (
                  <button
                    key={p}
                    className={`form-chip ${form.prioritas === p ? "active" : ""}`}
                    onClick={() => setForm({ ...form, prioritas: p })}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Target</label>
              <select
                className="form-select"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              >
                <option value="all">Semua</option>
                <option value="anggota">Anggota</option>
                <option value="komandan">Komandan</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
