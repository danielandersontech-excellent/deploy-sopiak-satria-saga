"use client";
import React, { useState, useEffect } from "react";
import { authApi, apiUploadFile, usersApi, lokasiApi, apiFetch, API_URL } from "@/lib/api";
import { fmtDate, fmtDateTime, statusColor, avatarUrl } from "@/lib/formatters";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/hooks/useToast";

export default function PersonilPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [lokasi, setLokasi] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(""); // [5-4] server-side search
  const [filterRole, setFilterRole] = useState("");
  const [filterPenempatan, setFilterPenempatan] = useState("");
  const [filterLokasi, setFilterLokasi] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [slidePanel, setSlidePanel] = useState(false);
  const [berkasModal, setBerkasModal] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<"info" | "berkas">("info");
  const emptyForm = {
    nrp: "",
    nama: "",
    no_hp: "",
    role: "anggota",
    shift: "06:00-14:00",
    lokasi_id: "",
    skor: "80",
    foto_url: "",
    no_ktp: "",
    tempat_lahir: "",
    tanggal_lahir: "",
    alamat_rumah: "",
    pendidikan: "",
    jenis_kelamin: "L",
    golongan_darah: "",
    agama: "",
    catatan_personil: "",
    status_penempatan: "belum_ditempatkan",
  };
  const [form, setForm] = useState(emptyForm);
  const [berkasForm, setBerkasForm] = useState({
    berkas_ktp: "",
    berkas_ijazah: "",
    berkas_skck: "",
    berkas_sertifikat: "",
    berkas_cv: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  // BUG #5 (P2-4): server-side pagination. We track the server's reported
  // totals so the pager can render properly. `loading` finally has a
  // setter so we can show a skeleton (BUG #4).
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      // Paginated user list. Other consumers (analytics, shift-assignment)
      // pass `?all=true` to bypass pagination.
      const qs = new URLSearchParams({
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      if (filterRole) qs.set("role", filterRole);
      if (filterLokasi) qs.set("lokasi_id", filterLokasi);
      if (filterPenempatan) qs.set("status_penempatan", filterPenempatan);
      if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
      const d: any = await apiFetch(`/api/users?${qs.toString()}`);
      // Backend returns { data, total, page, limit, totalPages } when paginated,
      // or a raw array when ?all=true is passed. Handle both shapes defensively.
      if (Array.isArray(d)) {
        setData(d);
        setTotalUsers(d.length);
        setTotalPages(1);
      } else {
        setData(Array.isArray(d?.data) ? d.data : []);
        setTotalUsers(Number(d?.total) || 0);
        setTotalPages(Number(d?.totalPages) || 1);
      }
    } catch (e: any) {
      toast(e?.message || "Gagal memuat data personil", "error");
    } finally {
      setLoading(false);
    }
    try {
      // Locations list is small; load once. Use ?all=true wouldn't apply
      // here — lokasi has its own endpoint without forced pagination.
      const d = await lokasiApi.list("status=active");
      setLokasi(Array.isArray(d) ? d : []);
    } catch {}
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filterRole, filterLokasi, filterPenempatan, debouncedSearch]);

  // Reset to page 1 whenever a filter changes (otherwise you might land
  // on an empty page beyond totalPages for the new filter).
  useEffect(() => {
    if (currentPage !== 1) setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRole, filterLokasi, filterPenempatan]);

  // [5-4] Debounce kotak pencarian → kirim ke server (cari di SEMUA halaman,
  // bukan hanya halaman aktif) + reset ke halaman 1 saat kata kunci berubah.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Pencarian kini server-side (lihat backend user.repository ILIKE). Data yang
  // diterima sudah terfilter untuk halaman ini.
  const pagedData = data;
  const openNew = () => {
    setEdit(null);
    setForm(emptyForm);
    setModal(true);
  };
  const openEdit = (r: any) => {
    setEdit(r);
    setForm({
      nrp: r.nrp,
      nama: r.nama,
      no_hp: r.no_hp || "",
      role: r.role,
      shift: r.shift || "06:00-14:00",
      lokasi_id: r.lokasi_id || "",
      skor: String(r.skor || 80),
      foto_url: r.foto_url || "",
      no_ktp: r.no_ktp || "",
      tempat_lahir: r.tempat_lahir || "",
      tanggal_lahir: r.tanggal_lahir?.split?.("T")?.[0] || "",
      alamat_rumah: r.alamat_rumah || "",
      pendidikan: r.pendidikan || "",
      jenis_kelamin: r.jenis_kelamin || "L",
      golongan_darah: r.golongan_darah || "",
      agama: r.agama || "",
      catatan_personil: r.catatan_personil || "",
      status_penempatan: r.status_penempatan || "belum_ditempatkan",
    });
    setModal(true);
  };
  const save = async () => {
    if (!form.nama || !form.nrp)
      return toast("Nama dan NRP wajib diisi", "warning");
    try {
      const payload: any = {
        nama: form.nama,
        no_hp: form.no_hp,
        role: form.role,
        shift: form.shift,
        lokasi_id: form.lokasi_id || null,
        skor: parseInt(form.skor),
        foto_url: form.foto_url || null,
        no_ktp: form.no_ktp || null,
        tempat_lahir: form.tempat_lahir || null,
        tanggal_lahir: form.tanggal_lahir || null,
        alamat_rumah: form.alamat_rumah || null,
        pendidikan: form.pendidikan || null,
        jenis_kelamin: form.jenis_kelamin || null,
        golongan_darah: form.golongan_darah || null,
        agama: form.agama || null,
        catatan_personil: form.catatan_personil || null,
        status_penempatan: form.lokasi_id
          ? "ditempatkan"
          : form.status_penempatan || "belum_ditempatkan",
      };
      if (edit) {
        await usersApi.update(edit.id, payload);
        toast(`Data ${form.nama} berhasil diperbarui`);
      } else {
        // [2-1] Backend membuat PIN acak & mengembalikannya sekali sebagai
        // `initial_pin`. Tampilkan PIN itu (bukan "123456" yang ditebak).
        const created: any = await authApi.register({ nrp: form.nrp, ...payload });
        const initialPin = created?.initial_pin ?? created?.data?.initial_pin ?? null;
        toast(
          initialPin
            ? `${form.nama} (${form.role}) ditambahkan. Login: ${form.nrp} / PIN awal: ${initialPin} — sampaikan ke user (tampil sekali), minta ganti saat login pertama.`
            : `${form.nama} (${form.role}) ditambahkan. PIN awal dibuat namun tidak tercatat di respons — lakukan reset PIN bila user tidak dapat login.`,
          initialPin ? "success" : "warning",
        );
      }
      setModal(false);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const doDelete = async () => {
    try {
      await usersApi.del(del.id);
      toast(`${del.nama} berhasil dihapus`);
      setDel(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const openBerkas = (u: any) => {
    setBerkasModal(u);
    setBerkasForm({
      berkas_ktp: u.berkas_ktp || "",
      berkas_ijazah: u.berkas_ijazah || "",
      berkas_skck: u.berkas_skck || "",
      berkas_sertifikat: u.berkas_sertifikat || "",
      berkas_cv: u.berkas_cv || "",
    });
  };
  const saveBerkas = async () => {
    try {
      await usersApi.updateBerkas(berkasModal.id, berkasForm);
      toast("Berkas personil berhasil diperbarui");
      setBerkasModal(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const roles = ["anggota", "komandan", "supervisor", "admin"];
  const shifts = ["06:00-14:00", "14:00-22:00", "22:00-06:00"];
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-users" />
          Personil
        </h1>
        <button className="btn btn-primary" onClick={() => { openNew(); setSlidePanel(true); }}>
          <i className="fas fa-user-plus" /> Tambah Personil
        </button>
      </div>
      <div className="section-card">
        <div className="filters-row">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              placeholder="Cari nama / NRP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            style={{ width: "auto" }}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">Semua Role</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ width: "auto" }}
            value={filterPenempatan}
            onChange={(e) => setFilterPenempatan(e.target.value)}
          >
            <option value="">Semua Penempatan</option>
            <option value="belum_ditempatkan">Belum Ditempatkan</option>
            <option value="ditempatkan">Ditempatkan</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
          <select
            className="form-select"
            style={{ width: "auto" }}
            value={filterLokasi}
            onChange={(e) => setFilterLokasi(e.target.value)}
          >
            <option value="">Semua Lokasi</option>
            {lokasi.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nama}
              </option>
            ))}
          </select>
          <span className="muted">{totalUsers} personil{debouncedSearch ? ` (hasil pencarian)` : ""}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('table')} title="Tampilan Tabel"><i className="fas fa-list" /></button>
            <button className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('grid')} title="Tampilan Grid"><i className="fas fa-th" /></button>
          </div>
        </div>
        {loading && data.length === 0 ? (
          // BUG #4 (P2-3): skeleton while initial load is in flight.
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  background: "var(--hover-row, #e5e7eb)",
                  height: 56,
                  borderRadius: 8,
                }}
              />
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
            {pagedData.map((u) => (
              <div key={u.id} className="section-card" style={{ padding: 16, cursor: 'pointer', transition: 'var(--transition)', border: '1px solid var(--border)' }} onClick={() => setDetail(u)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <img className="avatar" src={avatarUrl(u.foto_url)} alt="" style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.nama}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{u.nrp}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`badge badge-${u.role === 'admin' ? 'danger' : u.role === 'supervisor' ? 'warning' : u.role === 'komandan' ? 'info' : 'primary'}`}>{u.role}</span>
                  <span className={`badge badge-${statusColor(u.status_penempatan || 'aktif')}`}>{u.status_penempatan || 'aktif'}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{u.lokasi_nama || '-'}</div>
              </div>
            ))}
          </div>
        ) : (
        <table>
          <thead>
            <tr>
              <th>Personil</th>
              <th>NRP</th>
              <th>Role</th>
              <th>Lokasi</th>
              <th>Penempatan</th>
              <th>Shift</th>
              <th>No HP</th>
              <th>Status</th>
              <th>Skor</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pagedData.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <img
                      className="avatar"
                      src={avatarUrl(u.foto_url)}
                      alt=""
                    />
                    <div>
                      <div className="user-name">{u.nama}</div>
                      <div className="user-sub">
                        Bergabung {fmtDate(u.tanggal_bergabung || u.created_at)}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <code>{u.nrp}</code>
                </td>
                <td>
                  <span
                    className={`badge badge-${u.role === "admin" ? "danger" : u.role === "supervisor" ? "purple" : u.role === "komandan" ? "info" : "default"}`}
                  >
                    {u.role}
                  </span>
                </td>
                <td>
                  {u.lokasi?.nama || u.lokasi_nama || (
                    <span className="muted">Belum</span>
                  )}
                </td>
                <td>
                  <span
                    className={`badge badge-${statusColor(u.status_penempatan || "belum_ditempatkan")}`}
                  >
                    {u.status_penempatan || "belum_ditempatkan"}
                  </span>
                </td>
                <td>{u.shift}</td>
                <td>{u.no_hp || "-"}</td>
                <td>
                  <span className={`status-dot ${u.status}`} />
                  {u.status?.replace("_", " ")}
                </td>
                <td>
                  <strong>{u.skor}</strong>
                </td>
                <td>
                  <div className="btn-group">
                    <button
                      className="btn-icon"
                      title="Detail"
                      onClick={() => {
                        setDetail(u);
                        setDetailTab("info");
                      }}
                    >
                      <i className="fas fa-eye" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Berkas"
                      onClick={() => openBerkas(u)}
                      style={{ color: "var(--purple)" }}
                    >
                      <i className="fas fa-folder-open" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Edit"
                      onClick={() => openEdit(u)}
                    >
                      <i className="fas fa-pen" />
                    </button>
                    <button
                      className="btn-icon"
                      title="Hapus"
                      onClick={() => setDel(u)}
                      style={{ color: "var(--danger)" }}
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pagedData.length === 0 && (
              <tr>
                <td colSpan={10} className="empty-row">
                  Tidak ada data personil
                </td>
              </tr>
            )}
          </tbody>
        </table>
        )}
        <Pagination currentPage={currentPage} totalItems={totalUsers} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
      {/* DETAIL MODAL with TABS */}
      {detail && (
        <Modal title="Detail Personil" onClose={() => setDetail(null)} wide>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img
              className="avatar avatar-lg"
              src={avatarUrl(detail.foto_url)}
              style={{ width: 80, height: 80 }}
             alt="avatar" />
            <h3 style={{ marginTop: 8 }}>{detail.nama}</h3>
            <span
              className={`badge badge-${detail.role === "admin" ? "danger" : "info"}`}
            >
              {detail.role}
            </span>{" "}
            <span
              className={`badge badge-${statusColor(detail.status_penempatan || "belum_ditempatkan")}`}
            >
              {detail.status_penempatan || "belum_ditempatkan"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              borderBottom: "2px solid var(--border)",
              paddingBottom: 8,
            }}
          >
            <button
              className={`form-chip ${detailTab === "info" ? "active" : ""}`}
              onClick={() => setDetailTab("info")}
            >
              📋 Info Personil
            </button>
            <button
              className={`form-chip ${detailTab === "berkas" ? "active" : ""}`}
              onClick={() => setDetailTab("berkas")}
            >
              📁 Berkas & Dokumen
            </button>
          </div>
          {detailTab === "info" && (
            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">NRP</div>
                <div className="detail-value">{detail.nrp}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">No HP</div>
                <div className="detail-value">{detail.no_hp || "-"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">No KTP</div>
                <div className="detail-value">{detail.no_ktp || "-"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Jenis Kelamin</div>
                <div className="detail-value">
                  {detail.jenis_kelamin === "P" ? "Perempuan" : "Laki-laki"}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Tempat Lahir</div>
                <div className="detail-value">{detail.tempat_lahir || "-"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Tanggal Lahir</div>
                <div className="detail-value">
                  {detail.tanggal_lahir ? fmtDate(detail.tanggal_lahir) : "-"}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Alamat Rumah</div>
                <div className="detail-value">{detail.alamat_rumah || "-"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Pendidikan</div>
                <div className="detail-value">{detail.pendidikan || "-"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Agama</div>
                <div className="detail-value">{detail.agama || "-"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Golongan Darah</div>
                <div className="detail-value">
                  {detail.golongan_darah || "-"}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Shift</div>
                <div className="detail-value">{detail.shift}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Lokasi</div>
                <div className="detail-value">
                  {detail.lokasi?.nama || detail.lokasi_nama || "-"}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Status</div>
                <div className="detail-value">
                  <span className={`status-dot ${detail.status}`} />
                  {detail.status}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Skor</div>
                <div className="detail-value">
                  <strong>{detail.skor}</strong>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Tanggal Bergabung</div>
                <div className="detail-value">
                  {fmtDate(detail.tanggal_bergabung || detail.created_at)}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Terakhir Online</div>
                <div className="detail-value">
                  {fmtDateTime(detail.last_seen)}
                </div>
              </div>
              {detail.catatan_personil && (
                <div className="detail-item" style={{ gridColumn: "1/-1" }}>
                  <div className="detail-label">Catatan</div>
                  <div className="detail-value">{detail.catatan_personil}</div>
                </div>
              )}
            </div>
          )}
          {detailTab === "berkas" && (
            <div>
              <p className="muted" style={{ marginBottom: 12 }}>
                📁 Folder Berkas: <strong>/personil/{detail.nrp}/</strong>
              </p>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">📄 KTP</div>
                  <div className="detail-value">
                    {detail.berkas_ktp ? (
                      <a
                        href={
                          detail.berkas_ktp.startsWith("http")
                            ? detail.berkas_ktp
                            : `${API_URL}/${detail.berkas_ktp}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="badge badge-success"
                      >
                        ✅ Tersedia
                      </a>
                    ) : (
                      <span className="badge badge-default">Belum ada</span>
                    )}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">🎓 Ijazah</div>
                  <div className="detail-value">
                    {detail.berkas_ijazah ? (
                      <a
                        href={
                          detail.berkas_ijazah.startsWith("http")
                            ? detail.berkas_ijazah
                            : `${API_URL}/${detail.berkas_ijazah}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="badge badge-success"
                      >
                        ✅ Tersedia
                      </a>
                    ) : (
                      <span className="badge badge-default">Belum ada</span>
                    )}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">📋 SKCK</div>
                  <div className="detail-value">
                    {detail.berkas_skck ? (
                      <a
                        href={
                          detail.berkas_skck.startsWith("http")
                            ? detail.berkas_skck
                            : `${API_URL}/${detail.berkas_skck}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="badge badge-success"
                      >
                        ✅ Tersedia
                      </a>
                    ) : (
                      <span className="badge badge-default">Belum ada</span>
                    )}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">📑 Sertifikat</div>
                  <div className="detail-value">
                    {detail.berkas_sertifikat ? (
                      <a
                        href={
                          detail.berkas_sertifikat.startsWith("http")
                            ? detail.berkas_sertifikat
                            : `${API_URL}/${detail.berkas_sertifikat}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="badge badge-success"
                      >
                        ✅ Tersedia
                      </a>
                    ) : (
                      <span className="badge badge-default">Belum ada</span>
                    )}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">📝 CV</div>
                  <div className="detail-value">
                    {detail.berkas_cv ? (
                      <a
                        href={
                          detail.berkas_cv.startsWith("http")
                            ? detail.berkas_cv
                            : `${API_URL}/${detail.berkas_cv}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="badge badge-success"
                      >
                        ✅ Tersedia
                      </a>
                    ) : (
                      <span className="badge badge-default">Belum ada</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => openBerkas(detail)}
              >
                <i className="fas fa-upload" /> Upload/Edit Berkas
              </button>
            </div>
          )}
        </Modal>
      )}
      {/* BERKAS UPLOAD MODAL */}
      {berkasModal && (
        <Modal
          title={`📁 Berkas Personil - ${berkasModal.nama}`}
          onClose={() => setBerkasModal(null)}
          footer={
            <>
              <button
                className="btn btn-outline"
                onClick={() => setBerkasModal(null)}
              >
                Batal
              </button>
              <button className="btn btn-primary" onClick={saveBerkas}>
                <i className="fas fa-save" /> Simpan
              </button>
            </>
          }
        >
          <p className="muted" style={{ marginBottom: 14 }}>
            Upload file berkas langsung (PDF, JPG, PNG). Folder berkas:{" "}
            <strong>/personil/{berkasModal.nrp}/</strong>
          </p>
          {[
            { k: "berkas_ktp", l: "📄 KTP", p: "Upload berkas KTP" },
            { k: "berkas_ijazah", l: "🎓 Ijazah", p: "Upload berkas ijazah" },
            { k: "berkas_skck", l: "📋 SKCK", p: "Upload berkas SKCK" },
            {
              k: "berkas_sertifikat",
              l: "📑 Sertifikat",
              p: "Upload berkas sertifikat",
            },
            { k: "berkas_cv", l: "📝 CV", p: "Upload berkas CV" },
          ].map((f) => (
            <div key={f.k} className="form-group">
              <label className="form-label">{f.l}</label>
              {(berkasForm as any)[f.k] && (
                <div style={{ marginBottom: 4 }}>
                  <a
                    href={
                      (berkasForm as any)[f.k].startsWith("http")
                        ? (berkasForm as any)[f.k]
                        : `${API_URL}/${(berkasForm as any)[f.k]}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="badge badge-success"
                    style={{ fontSize: 11 }}
                  >
                    ✅ File ada - klik untuk lihat
                  </a>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="form-input"
                  value={(berkasForm as any)[f.k]}
                  onChange={(e) =>
                    setBerkasForm({ ...berkasForm, [f.k]: e.target.value })
                  }
                  placeholder={`URL atau path file`}
                  style={{ flex: 1 }}
                />
                <label
                  className="btn btn-outline btn-sm"
                  style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  <i className="fas fa-upload" /> Upload
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const res = await apiUploadFile(
                          `/api/data/upload?folder=personil/${berkasModal.nrp}`,
                          file,
                        );
                        setBerkasForm((prev) => ({ ...prev, [f.k]: res.url }));
                        toast(`${f.l} berhasil diupload`);
                      } catch (err: any) {
                        toast(err.message, "error");
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </Modal>
      )}
      {/* ADD/EDIT MODAL */}
      {modal && (
        <Modal
          title={edit ? "Edit Personil" : "Tambah Personil Baru"}
          onClose={() => setModal(false)}
          wide
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
          {!edit && (
            <div
              style={{
                background: "var(--primary-light)",
                padding: 12,
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 12,
                color: "var(--primary)",
              }}
            >
              <i className="fas fa-info-circle" /> Personil baru mendapat akun
              login via NRP. PIN awal dibuat otomatis (acak) dan ditampilkan
              SEKALI setelah simpan — catat & sampaikan ke personil. Data berkas
              bisa dilengkapi nanti.
            </div>
          )}
          <h4 style={{ marginBottom: 10, color: "var(--primary)" }}>
            📋 Data Utama
          </h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nama *</label>
              <input
                className="form-input"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">NRP *</label>
              <input
                className="form-input"
                value={form.nrp}
                onChange={(e) => setForm({ ...form, nrp: e.target.value })}
                disabled={!!edit}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">No HP</label>
              <input
                className="form-input"
                value={form.no_hp}
                onChange={(e) => setForm({ ...form, no_hp: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">No KTP</label>
              <input
                className="form-input"
                value={form.no_ktp}
                onChange={(e) => setForm({ ...form, no_ktp: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <div className="form-chip-row">
              {roles.map((r) => (
                <button
                  key={r}
                  className={`form-chip ${form.role === r ? "active" : ""}`}
                  onClick={() => setForm({ ...form, role: r })}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            {["anggota", "komandan"].includes(form.role) && (
            <div className="form-group">
              <label className="form-label">Shift (Jam Kerja)</label>
              <select
                className="form-select"
                value={form.shift}
                onChange={(e) => setForm({ ...form, shift: e.target.value })}
              >
                {shifts.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <small className="muted">Hanya untuk Anggota & Komandan</small>
            </div>
            )}
            <div className="form-group">
              <label className="form-label">Penempatan di Perusahaan Klien</label>
              <select
                className="form-select"
                value={form.lokasi_id}
                onChange={(e) =>
                  setForm({ ...form, lokasi_id: e.target.value })
                }
              >
                <option value="">-- Belum Ditempatkan --</option>
                {lokasi.map((l) => (
                  <option key={l.id} value={l.id}>
                    📍 {l.nama}
                  </option>
                ))}
              </select>
              <small className="muted" style={{marginTop:4,display:'block'}}>Pilih perusahaan klien tempat personil akan ditugaskan</small>
            </div>
          </div>
          <h4 style={{ margin: "16px 0 10px", color: "var(--primary)" }}>
            👤 Data Pribadi (Opsional)
          </h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Jenis Kelamin</label>
              <div className="form-chip-row">
                {[
                  { v: "L", l: "Laki-laki" },
                  { v: "P", l: "Perempuan" },
                ].map((g) => (
                  <button
                    key={g.v}
                    className={`form-chip ${form.jenis_kelamin === g.v ? "active" : ""}`}
                    onClick={() => setForm({ ...form, jenis_kelamin: g.v })}
                  >
                    {g.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Golongan Darah</label>
              <select
                className="form-select"
                value={form.golongan_darah}
                onChange={(e) =>
                  setForm({ ...form, golongan_darah: e.target.value })
                }
              >
                <option value="">-</option>
                {["A", "B", "AB", "O"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tempat Lahir</label>
              <input
                className="form-input"
                value={form.tempat_lahir}
                onChange={(e) =>
                  setForm({ ...form, tempat_lahir: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal Lahir</label>
              <input
                className="form-input"
                type="date"
                value={form.tanggal_lahir}
                onChange={(e) =>
                  setForm({ ...form, tanggal_lahir: e.target.value })
                }
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Alamat Rumah</label>
            <textarea
              className="form-textarea"
              value={form.alamat_rumah}
              onChange={(e) =>
                setForm({ ...form, alamat_rumah: e.target.value })
              }
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Pendidikan</label>
              <select
                className="form-select"
                value={form.pendidikan}
                onChange={(e) =>
                  setForm({ ...form, pendidikan: e.target.value })
                }
              >
                <option value="">-</option>
                {["SD", "SMP", "SMA/SMK", "D3", "S1", "S2", "S3"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Agama</label>
              <select
                className="form-select"
                value={form.agama}
                onChange={(e) => setForm({ ...form, agama: e.target.value })}
              >
                <option value="">-</option>
                {[
                  "Islam",
                  "Kristen",
                  "Katolik",
                  "Hindu",
                  "Buddha",
                  "Konghucu",
                ].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Skor</label>
              <input
                className="form-input"
                type="number"
                value={form.skor}
                onChange={(e) => setForm({ ...form, skor: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Foto</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="form-input"
                  value={form.foto_url}
                  onChange={(e) =>
                    setForm({ ...form, foto_url: e.target.value })
                  }
                  placeholder="URL foto..."
                  style={{ flex: 1 }}
                />
                <label
                  className="btn btn-outline btn-sm"
                  style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  <i className="fas fa-camera" />
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const res = await apiUploadFile(
                          `/api/data/upload?folder=personil/${form.nrp || "temp"}`,
                          file,
                        );
                        setForm((f) => ({ ...f, foto_url: res.url }));
                        toast("Foto berhasil diupload");
                      } catch (err: any) {
                        toast(err.message, "error");
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Catatan Personil</label>
            <textarea
              className="form-textarea"
              value={form.catatan_personil}
              onChange={(e) =>
                setForm({ ...form, catatan_personil: e.target.value })
              }
            />
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog
          title="Hapus Personil?"
          msg={`${del.nama} (${del.nrp}) akan dihapus.`}
          onConfirm={doDelete}
          onCancel={() => setDel(null)}
        />
      )}
    </div>
  );
}
