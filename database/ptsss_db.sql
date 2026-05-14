--
-- PostgreSQL database dump
--


-- Dumped from database version 16.6
-- Dumped by pg_dump version 18.1

-- Started on 2026-02-19 14:29:12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0; -- Removed: not supported in PG 16-alpine
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;


SET default_table_access_method = heap;

--
-- TOC entry 225 (class 1259 OID 41472)
-- Name: absensi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.absensi (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    tipe text NOT NULL,
    waktu timestamp with time zone DEFAULT now(),
    foto_url text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    alamat text,
    pos_jaga text,
    status text DEFAULT 'hadir'::text,
    dalam_radius boolean DEFAULT true,
    lokasi_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT absensi_status_check CHECK ((status = ANY (ARRAY['hadir'::text, 'terlambat'::text, 'tidak_hadir'::text, 'libur'::text]))),
    CONSTRAINT absensi_tipe_check CHECK ((tipe = ANY (ARRAY['masuk'::text, 'keluar'::text])))
);


--
-- TOC entry 235 (class 1259 OID 41683)
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_nama character varying(100),
    action character varying(20) NOT NULL,
    resource character varying(50) NOT NULL,
    resource_id uuid,
    detail jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 240 (class 1259 OID 41778)
-- Name: berkas_personil; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.berkas_personil (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    jenis text NOT NULL,
    nama_file text NOT NULL,
    file_url text NOT NULL,
    file_size integer,
    uploaded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT berkas_personil_jenis_check CHECK ((jenis = ANY (ARRAY['ktp'::text, 'ijazah'::text, 'skck'::text, 'sertifikat'::text, 'cv'::text, 'foto'::text, 'lainnya'::text])))
);


--
-- TOC entry 230 (class 1259 OID 41581)
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pengirim_id uuid,
    judul text NOT NULL,
    pesan text,
    prioritas text DEFAULT 'normal'::text,
    target text DEFAULT 'all'::text,
    lokasi_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT broadcasts_prioritas_check CHECK ((prioritas = ANY (ARRAY['normal'::text, 'urgent'::text])))
);


--
-- TOC entry 221 (class 1259 OID 41392)
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoints (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lokasi_id uuid,
    nama text NOT NULL,
    area text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius integer DEFAULT 15,
    qr_code text NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT checkpoints_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- TOC entry 217 (class 1259 OID 41305)
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    kode_klien character varying(20),
    nama_klien character varying(255) NOT NULL,
    jenis_kelamin character varying(20) DEFAULT 'Lainnya/Instansi'::character varying,
    kontak_person character varying(100),
    nomor_telepon character varying(20),
    email character varying(100),
    alamat_klien text,
    jenis_jasa character varying(100),
    tgl_mulai_kontrak date,
    tgl_habis_kontrak date,
    status_klien character varying(20) DEFAULT 'Aktif'::character varying,
    path_kontrak_pdf character varying(255),
    nrp_login character varying(50),
    pin_hash text,
    lokasi_id uuid,
    foto_url text,
    last_seen timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    -- P0-14: force PIN rotation after first login (random temporary PIN
    --        is set on account creation in auth.service.js / data.service.js).
    must_change_pin BOOLEAN DEFAULT TRUE,
    CONSTRAINT clients_jenis_kelamin_check CHECK (((jenis_kelamin)::text = ANY ((ARRAY['Laki-Laki'::character varying, 'Perempuan'::character varying, 'Lainnya/Instansi'::character varying])::text[]))),
    CONSTRAINT clients_status_klien_check CHECK (((status_klien)::text = ANY ((ARRAY['Aktif'::character varying, 'Non-Aktif'::character varying, 'Blacklist'::character varying])::text[])))
);


--
-- TOC entry 216 (class 1259 OID 41304)
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 5250 (class 0 OID 0)
-- Dependencies: 216
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- TOC entry 237 (class 1259 OID 41720)
-- Name: geofence_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geofence_violations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    lokasi_id uuid NOT NULL,
    tipe text NOT NULL,
    izin_keluar_id uuid,
    latitude double precision,
    longitude double precision,
    jarak_dari_pusat double precision,
    acknowledged boolean DEFAULT false,
    acknowledged_by uuid,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT geofence_violations_tipe_check CHECK ((tipe = ANY (ARRAY['no_permission'::text, 'overtime'::text])))
);


--
-- TOC entry 236 (class 1259 OID 41693)
-- Name: geofence_izin; Type: TABLE; Schema: public; Owner: -
-- Renamed from izin_keluar to match application code (v4 fix).
--

CREATE TABLE public.geofence_izin (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    lokasi_id uuid NOT NULL,
    alasan text NOT NULL,
    status text DEFAULT 'pending'::text,
    approved_by uuid,
    approved_at timestamp with time zone,
    catatan_komandan text,
    durasi_menit integer,
    batas_waktu timestamp with time zone,
    waktu_keluar timestamp with time zone,
    waktu_kembali timestamp with time zone,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT geofence_izin_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'returned'::text])))
);


--
-- TOC entry 232 (class 1259 OID 41625)
-- Name: jadwal_shift; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jadwal_shift (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lokasi_id uuid,
    nama text NOT NULL,
    waktu_mulai time without time zone NOT NULL,
    waktu_selesai time without time zone NOT NULL,
    warna text DEFAULT '#2980b9'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 226 (class 1259 OID 41491)
-- Name: laporan_harian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laporan_harian (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    tanggal date DEFAULT CURRENT_DATE,
    shift text,
    pos_jaga text,
    kondisi text,
    aktivitas text,
    temuan text,
    perhatian_khusus text,
    fotos text[] DEFAULT '{}'::text[],
    foto_dokumentasi text[] DEFAULT '{}'::text[],
    status text DEFAULT 'draft'::text,
    catatan_komandan text,
    validated_by uuid,
    lokasi_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT laporan_harian_kondisi_check CHECK ((kondisi = ANY (ARRAY['aman'::text, 'ada_masalah'::text, 'perhatian_khusus'::text]))),
    CONSTRAINT laporan_harian_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'revision'::text, 'rejected'::text])))
);


--
-- TOC entry 227 (class 1259 OID 41516)
-- Name: laporan_kejadian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laporan_kejadian (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    jenis text NOT NULL,
    prioritas text DEFAULT 'sedang'::text,
    waktu_kejadian timestamp with time zone DEFAULT now(),
    lokasi_text text,
    latitude double precision,
    longitude double precision,
    kronologi text,
    bukti_media text[] DEFAULT '{}'::text[],
    status text DEFAULT 'draft'::text,
    catatan_komandan text,
    validated_by uuid,
    lokasi_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT laporan_kejadian_prioritas_check CHECK ((prioritas = ANY (ARRAY['rendah'::text, 'sedang'::text, 'tinggi'::text, 'kritis'::text]))),
    CONSTRAINT laporan_kejadian_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'revision'::text, 'rejected'::text])))
);


--
-- TOC entry 238 (class 1259 OID 41746)
-- Name: location_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    accuracy double precision,
    dalam_radius boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 218 (class 1259 OID 41323)
-- Name: lokasi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lokasi (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nama text NOT NULL,
    alamat text NOT NULL,
    latitude double precision DEFAULT '-6.2088'::numeric,
    longitude double precision DEFAULT 106.8456,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    radius integer DEFAULT 500,
    client_id integer,
    CONSTRAINT lokasi_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- TOC entry 229 (class 1259 OID 41565)
-- Name: notifikasi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifikasi (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tipe text,
    judul text NOT NULL,
    pesan text,
    target_user_id uuid,
    target_role text[],
    dibaca boolean DEFAULT false,
    data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifikasi_tipe_check CHECK ((tipe = ANY (ARRAY['info'::text, 'warning'::text, 'danger'::text, 'success'::text])))
);


--
-- TOC entry 231 (class 1259 OID 41603)
-- Name: panic_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.panic_alerts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    latitude double precision,
    longitude double precision,
    alamat text,
    status text DEFAULT 'active'::text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    pesan text,
    foto_url text,
    lokasi_text text,
    catatan_resolver text,
    jenis_darurat text DEFAULT 'umum'::text,
    nomor_kontak text,
    respon_detail text,
    lokasi_id uuid,
    CONSTRAINT panic_alerts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'false_alarm'::text])))
);


--
-- TOC entry 224 (class 1259 OID 41453)
-- Name: patrol_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patrol_scans (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    patroli_id uuid,
    checkpoint_id uuid,
    scan_time timestamp with time zone DEFAULT now(),
    latitude double precision,
    longitude double precision,
    foto_url text
);


--
-- TOC entry 223 (class 1259 OID 41429)
-- Name: patroli; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patroli (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    route_id uuid,
    route_name text,
    start_time timestamp with time zone DEFAULT now(),
    end_time timestamp with time zone,
    status text DEFAULT 'active'::text,
    checkpoint_scanned integer DEFAULT 0,
    checkpoint_total integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT patroli_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'incomplete'::text, 'cancelled'::text])))
);


--
-- TOC entry 219 (class 1259 OID 41343)
-- Name: pos_jaga; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_jaga (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lokasi_id uuid,
    nama text NOT NULL,
    radius integer DEFAULT 100,
    latitude double precision,
    longitude double precision,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pos_jaga_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- TOC entry 239 (class 1259 OID 41759)
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    client_id integer,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 234 (class 1259 OID 41663)
-- Name: report_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_exports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tipe text,
    lokasi_id uuid,
    periode_start date,
    periode_end date,
    file_url text,
    generated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT report_exports_tipe_check CHECK ((tipe = ANY (ARRAY['absensi'::text, 'laporan_harian'::text, 'laporan_kejadian'::text, 'patroli'::text, 'all'::text, 'weekly_auto'::text])))
);


--
-- TOC entry 222 (class 1259 OID 41411)
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lokasi_id uuid,
    nama text NOT NULL,
    checkpoint_ids uuid[] DEFAULT '{}'::uuid[],
    waktu_estimasi integer DEFAULT 30,
    assigned_shift text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT routes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- TOC entry 228 (class 1259 OID 41542)
-- Name: serah_terima; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serah_terima (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    penerima_id uuid,
    kondisi_area text,
    inventaris jsonb DEFAULT '[]'::jsonb,
    catatan text,
    fotos text[] DEFAULT '{}'::text[],
    dikonfirmasi boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT serah_terima_kondisi_area_check CHECK ((kondisi_area = ANY (ARRAY['aman'::text, 'masalah'::text, 'perhatian'::text])))
);


--
-- TOC entry 233 (class 1259 OID 41640)
-- Name: shift_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    shift_id uuid,
    user_id uuid,
    pos_jaga_id uuid,
    tanggal date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 220 (class 1259 OID 41360)
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nrp text NOT NULL,
    nama text NOT NULL,
    pin_hash text NOT NULL,
    no_hp text,
    role text NOT NULL,
    foto_url text,
    lokasi_id uuid,
    pos_jaga_id uuid,
    shift text DEFAULT '08:00-16:00'::text,
    status text DEFAULT 'off_duty'::text,
    last_seen timestamp with time zone DEFAULT now(),
    last_latitude double precision,
    last_longitude double precision,
    skor integer DEFAULT 80,
    expo_push_token text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    no_ktp text,
    tempat_lahir text,
    tanggal_lahir date,
    alamat_rumah text,
    pendidikan text,
    berkas_ktp text,
    berkas_ijazah text,
    berkas_skck text,
    berkas_sertifikat text,
    berkas_lainnya text[],
    catatan_personil text,
    tanggal_bergabung date DEFAULT CURRENT_DATE,
    status_penempatan text DEFAULT 'belum_ditempatkan'::text,
    jenis_kelamin text DEFAULT 'L'::text,
    golongan_darah text,
    agama text,
    berkas_foto text,
    berkas_cv text,
    berkas_foto_formal text,
    berkas_kontrak text,
    -- P0-14: force PIN rotation after first login (random temporary PIN
    --        is set on account creation in auth.service.js / bootstrap.js).
    must_change_pin BOOLEAN DEFAULT TRUE,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['anggota'::text, 'komandan'::text, 'supervisor'::text, 'admin'::text]))),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['on_duty'::text, 'patroli'::text, 'break'::text, 'off_duty'::text]))),
    CONSTRAINT users_status_penempatan_check CHECK ((status_penempatan = ANY (ARRAY['belum_ditempatkan'::text, 'ditempatkan'::text, 'nonaktif'::text])))
);


--
-- TOC entry 4838 (class 2604 OID 41308)
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- TOC entry 5229 (class 0 OID 41472)
-- Dependencies: 225
-- Data for Name: absensi; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('934531e2-0215-4b21-aa69-4540429375e6', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'masuk', '2026-02-18 23:01:16.244748+07', NULL, 1.3716, 101.3956, 'Pos Utama Gate A Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('76222c04-7ced-452d-b9a2-08dec1b63968', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'masuk', '2026-02-18 23:06:16.244748+07', NULL, 1.3709, 101.3961, 'Pos Belakang Gate B Chevron', 'Pos Belakang Gate B', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('859bfd54-c772-4229-889c-09d9b403edca', '31c1c24a-c43f-4a3e-82cf-b001f52a8414', 'masuk', '2026-02-19 03:01:16.244748+07', NULL, 1.3721, 101.3949, 'Pos Gudang Chevron', 'Pos Gudang & Parkir', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('a90c3614-f012-4b3a-bca2-2c17796f1930', 'cbea5068-1c1b-48ec-913c-b5406f610e16', 'masuk', '2026-02-19 03:06:16.244748+07', NULL, 1.3717, 101.3957, 'Pos Utama Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('6840775f-56ef-4a43-a496-3d051aee6c28', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'masuk', '2026-02-18 22:56:16.244748+07', NULL, 1.0997, 101.9791, 'Pos Pertamina Utama', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('6632c3d0-4ce8-4198-abcf-aa718f48f21a', '30fbb76a-bfda-4f62-9074-32e2c4d8d0b9', 'masuk', '2026-02-18 23:11:16.244748+07', NULL, 1.0991, 101.9796, 'Pos Area Kilang', 'Pos Area Kilang', 'terlambat', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('395d960e-3293-43ae-a187-33c8aa1d9b1d', 'd47676f3-3e89-418d-a9c5-613005344de0', 'masuk', '2026-02-19 02:51:16.244748+07', NULL, 1.0989, 101.9783, 'Pos Dermaga Pertamina', 'Pos Dermaga', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('f33c9b90-b30a-4c4d-a977-ec5f33fadd2e', 'e2b87c1c-adf9-494c-baef-fd5b13eec00e', 'masuk', '2026-02-19 03:01:16.244748+07', NULL, 1.0998, 101.9792, 'Pos Utama Pertamina', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('d5ffc596-84ab-4a54-a32c-c8b8df4c5295', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'masuk', '2026-02-18 22:51:16.244748+07', NULL, 0.3526, 101.8451, 'Pos Gate Mill RAPP', 'Pos Gate Utama Mill', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('29cf707c-d56e-48d8-8df8-0fe6d7caac0a', '4e6f6cfe-6cb5-40d0-aba9-5bcf298725fc', 'masuk', '2026-02-18 23:01:16.244748+07', NULL, 0.3519, 101.8456, 'Pos Warehouse RAPP', 'Pos Area Warehouse', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('22daba00-6d0d-4faa-a0b3-87216535bf78', '6b452059-fb87-4d16-9851-a9201db7c5a5', 'masuk', '2026-02-19 03:01:16.244748+07', NULL, 0.3515, 101.8442, 'Pos Perimeter RAPP', 'Pos Perimeter Selatan', 'terlambat', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('d270b161-26fc-4ebf-92f7-8c287e1fad29', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'masuk', '2026-02-18 22:46:16.244748+07', NULL, 1.1259, 102.1349, 'Pos Camp CPI', 'Pos Pintu Masuk Camp', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('082587b0-6eb4-4535-b052-0d681df95ee5', '69fb2edc-e887-42a6-be75-92b90bacd31a', 'masuk', '2026-02-18 23:01:16.244748+07', NULL, 1.1253, 102.1351, 'Pos Produksi CPI', 'Pos Area Produksi', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('ed54fa92-1dcf-4e33-8af8-d278a23c7951', 'b507b106-9ed0-4877-8130-ca0227f471e6', 'masuk', '2026-02-18 23:01:16.244748+07', NULL, 0.5074, 101.4481, 'Pos Lobby PLN', 'Pos Lobby Utama', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('0d5f8271-c29d-4c33-9935-022e59fdd4a4', '9b9b23a5-1e71-475e-a04a-efa7d1b5e841', 'masuk', '2026-02-18 23:06:16.244748+07', NULL, 0.507, 101.4477, 'Pos Gardu PLN', 'Pos Gardu Induk', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('72538a6a-278f-4a18-8778-1ab4603e9a96', 'fcfb7880-4c19-466b-a5dc-eac27f938edb', 'masuk', '2026-02-19 03:01:16.244748+07', NULL, 0.5075, 101.4482, 'Pos Lobby PLN', 'Pos Lobby Utama', 'hadir', true, '2026-02-19 05:01:16.244748+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('c5f4ecfb-c94c-4bca-83b7-53cbe4ed3af5', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'masuk', '2026-02-17 23:01:16.265114+07', NULL, 1.3716, 101.3956, 'Pos Utama Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('52623368-6d29-416d-b0d8-8d187bce8758', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'keluar', '2026-02-18 07:01:16.265114+07', NULL, 1.3716, 101.3956, 'Pos Utama Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('218f6176-9fcd-4179-9948-bb50beba8c9a', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'masuk', '2026-02-17 23:06:16.265114+07', NULL, 1.3709, 101.3961, 'Pos Belakang Chevron', 'Pos Belakang Gate B', 'terlambat', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('94314b21-1ca7-44a3-b627-c67fd2df2004', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'keluar', '2026-02-18 07:11:16.265114+07', NULL, 1.3709, 101.3961, 'Pos Belakang Chevron', 'Pos Belakang Gate B', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('dd9f7fe6-be96-448a-a377-3f62b599d199', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'masuk', '2026-02-17 22:51:16.265114+07', NULL, 1.0997, 101.9791, 'Pertamina Gate', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('e66d7501-2bd4-4085-b5ba-cabeef4ce39d', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'keluar', '2026-02-18 07:01:16.265114+07', NULL, 1.0997, 101.9791, 'Pertamina Gate', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('6561b491-bd60-4358-9bee-ec819b4c380a', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'masuk', '2026-02-17 22:46:16.265114+07', NULL, 0.3526, 101.8451, 'RAPP Gate', 'Pos Gate Utama Mill', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('9ea57ecf-c9f4-4e9f-8ea7-f85411fab2d0', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'keluar', '2026-02-18 07:01:16.265114+07', NULL, 0.3526, 101.8451, 'RAPP Gate', 'Pos Gate Utama Mill', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('49c6cc23-1238-4054-92ca-55df173ab764', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'masuk', '2026-02-17 22:41:16.265114+07', NULL, 1.1259, 102.1349, 'CPI Camp', 'Pos Pintu Masuk Camp', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('0b820cb6-6bf7-42b3-b65a-2b97ddf46667', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'keluar', '2026-02-18 07:01:16.265114+07', NULL, 1.1259, 102.1349, 'CPI Camp', 'Pos Pintu Masuk Camp', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('75fb772d-2234-4f67-89bc-738308f67243', 'b507b106-9ed0-4877-8130-ca0227f471e6', 'masuk', '2026-02-17 23:01:16.265114+07', NULL, 0.5074, 101.4481, 'PLN Lobby', 'Pos Lobby Utama', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('92e18d41-0d75-47c4-a10b-6d31f48742c2', 'b507b106-9ed0-4877-8130-ca0227f471e6', 'keluar', '2026-02-18 07:01:16.265114+07', NULL, 0.5074, 101.4481, 'PLN Lobby', 'Pos Lobby Utama', 'hadir', true, '2026-02-18 05:01:16.265114+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('2dbcf418-53ca-4cde-85c7-a231f5049792', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'masuk', '2026-02-18 23:02:13.903958+07', NULL, 1.3716, 101.3956, 'Pos Utama Gate A Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('a1bddaf2-5862-45f5-99e5-23bf375aa147', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'masuk', '2026-02-18 23:07:13.903958+07', NULL, 1.3709, 101.3961, 'Pos Belakang Gate B Chevron', 'Pos Belakang Gate B', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('42c45c8a-7829-434b-84e6-52af4efc36e3', '31c1c24a-c43f-4a3e-82cf-b001f52a8414', 'masuk', '2026-02-19 03:02:13.903958+07', NULL, 1.3721, 101.3949, 'Pos Gudang Chevron', 'Pos Gudang & Parkir', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('b433e3dd-347b-4a7b-9011-84153b3e4326', 'cbea5068-1c1b-48ec-913c-b5406f610e16', 'masuk', '2026-02-19 03:07:13.903958+07', NULL, 1.3717, 101.3957, 'Pos Utama Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('b7537ab8-5567-41af-88e0-b8f0d3e2848b', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'masuk', '2026-02-18 22:57:13.903958+07', NULL, 1.0997, 101.9791, 'Pos Pertamina Utama', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('bd07350a-66ca-4ea1-8246-08f3fe81af28', '30fbb76a-bfda-4f62-9074-32e2c4d8d0b9', 'masuk', '2026-02-18 23:12:13.903958+07', NULL, 1.0991, 101.9796, 'Pos Area Kilang', 'Pos Area Kilang', 'terlambat', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('96257389-65d9-41a4-b658-4a4bed7c86e7', 'd47676f3-3e89-418d-a9c5-613005344de0', 'masuk', '2026-02-19 02:52:13.903958+07', NULL, 1.0989, 101.9783, 'Pos Dermaga Pertamina', 'Pos Dermaga', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('38a9791c-fb86-426a-ac7d-b61c7042ee78', 'e2b87c1c-adf9-494c-baef-fd5b13eec00e', 'masuk', '2026-02-19 03:02:13.903958+07', NULL, 1.0998, 101.9792, 'Pos Utama Pertamina', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('245a96de-1b55-4e26-9980-06b0b9971410', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'masuk', '2026-02-18 22:52:13.903958+07', NULL, 0.3526, 101.8451, 'Pos Gate Mill RAPP', 'Pos Gate Utama Mill', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('8f2a9216-cc21-459c-9c9d-215bf9e7a692', '4e6f6cfe-6cb5-40d0-aba9-5bcf298725fc', 'masuk', '2026-02-18 23:02:13.903958+07', NULL, 0.3519, 101.8456, 'Pos Warehouse RAPP', 'Pos Area Warehouse', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('ce68489d-9276-4a5e-a57e-30460b3c4ad4', '6b452059-fb87-4d16-9851-a9201db7c5a5', 'masuk', '2026-02-19 03:02:13.903958+07', NULL, 0.3515, 101.8442, 'Pos Perimeter RAPP', 'Pos Perimeter Selatan', 'terlambat', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('886a7910-5b46-4c64-8dc4-27ecc198d7cb', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'masuk', '2026-02-18 22:47:13.903958+07', NULL, 1.1259, 102.1349, 'Pos Camp CPI', 'Pos Pintu Masuk Camp', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('0916c516-5f3a-4a31-9c04-073fee48f496', '69fb2edc-e887-42a6-be75-92b90bacd31a', 'masuk', '2026-02-18 23:02:13.903958+07', NULL, 1.1253, 102.1351, 'Pos Produksi CPI', 'Pos Area Produksi', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('a7e2b954-6206-4827-9cb5-5026257ac483', 'b507b106-9ed0-4877-8130-ca0227f471e6', 'masuk', '2026-02-18 23:02:13.903958+07', NULL, 0.5074, 101.4481, 'Pos Lobby PLN', 'Pos Lobby Utama', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('39f32bde-efa3-4147-9206-03fe58b951c8', '9b9b23a5-1e71-475e-a04a-efa7d1b5e841', 'masuk', '2026-02-18 23:07:13.903958+07', NULL, 0.507, 101.4477, 'Pos Gardu PLN', 'Pos Gardu Induk', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('c6f6e312-bde5-4912-913b-51c6310f4efe', 'fcfb7880-4c19-466b-a5dc-eac27f938edb', 'masuk', '2026-02-19 03:02:13.903958+07', NULL, 0.5075, 101.4482, 'Pos Lobby PLN', 'Pos Lobby Utama', 'hadir', true, '2026-02-19 05:02:13.903958+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('e6cf9250-740d-4012-9088-8351db07511a', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'masuk', '2026-02-17 23:02:13.920083+07', NULL, 1.3716, 101.3956, 'Pos Utama Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('90e25e78-e0fb-47e5-a467-1118079bbb4c', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'keluar', '2026-02-18 07:02:13.920083+07', NULL, 1.3716, 101.3956, 'Pos Utama Chevron', 'Pos Utama Gate A', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('49c56684-c315-49d6-b169-0eb24f36fb14', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'masuk', '2026-02-17 23:07:13.920083+07', NULL, 1.3709, 101.3961, 'Pos Belakang Chevron', 'Pos Belakang Gate B', 'terlambat', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('928bf315-2695-4f84-b0f2-4894e53c9662', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'keluar', '2026-02-18 07:12:13.920083+07', NULL, 1.3709, 101.3961, 'Pos Belakang Chevron', 'Pos Belakang Gate B', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('9afd5794-afd7-413c-a3dd-2f74001af2ac', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'masuk', '2026-02-17 22:52:13.920083+07', NULL, 1.0997, 101.9791, 'Pertamina Gate', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('e73b4a04-bf15-4089-9491-5eaea95506e4', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'keluar', '2026-02-18 07:02:13.920083+07', NULL, 1.0997, 101.9791, 'Pertamina Gate', 'Pos Pintu Masuk Utama', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('18bac25a-bee1-4112-b594-31377fd89bea', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'masuk', '2026-02-17 22:47:13.920083+07', NULL, 0.3526, 101.8451, 'RAPP Gate', 'Pos Gate Utama Mill', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('35b6e6a6-1e2a-4950-8ae4-f0df64ed4b34', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'keluar', '2026-02-18 07:02:13.920083+07', NULL, 0.3526, 101.8451, 'RAPP Gate', 'Pos Gate Utama Mill', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('ce16e00d-03aa-4962-b2eb-d918429aa8e2', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'masuk', '2026-02-17 22:42:13.920083+07', NULL, 1.1259, 102.1349, 'CPI Camp', 'Pos Pintu Masuk Camp', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('5175db9e-6146-4dba-82a3-27dd07a75b5e', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'keluar', '2026-02-18 07:02:13.920083+07', NULL, 1.1259, 102.1349, 'CPI Camp', 'Pos Pintu Masuk Camp', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('57fcfd34-a893-40b6-b376-047f5f197728', 'b507b106-9ed0-4877-8130-ca0227f471e6', 'masuk', '2026-02-17 23:02:13.920083+07', NULL, 0.5074, 101.4481, 'PLN Lobby', 'Pos Lobby Utama', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('97b2e4a5-22ff-43c2-aad6-dc08c0bbb85f', 'b507b106-9ed0-4877-8130-ca0227f471e6', 'keluar', '2026-02-18 07:02:13.920083+07', NULL, 0.5074, 101.4481, 'PLN Lobby', 'Pos Lobby Utama', 'hadir', true, '2026-02-18 05:02:13.920083+07');
INSERT INTO public.absensi (id, user_id, tipe, waktu, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, created_at) VALUES ('2448290c-6acf-4501-9809-e82b74e391b8', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'keluar', NULL, 'http://192.168.1.5:8081/uploads/absensi/76d5b6a4-6935-4095-b9db-1f205e9e46ab.jpg', 0.5656135, 101.4292646, 'Jalan Tegalsari, Kota Pekanbaru, Kecamatan Rumbai, Riau', 'Pos Lobby Utama', 'hadir', false, '2026-02-19 05:15:35.640896+07');


--
-- TOC entry 5239 (class 0 OID 41683)
-- Dependencies: 235
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('c7b5aed3-84c2-4477-9b50-fae2f285225e', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', NULL, '{"ip": "192.168.1.100", "device": "Chrome/Windows"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('53d1a287-d31d-478a-946c-462a2745382e', '51d249e7-6ac0-421e-b928-3b2090bf0596', 'Hendri Saputra', 'LOGIN', 'auth', NULL, '{"ip": "192.168.1.101", "device": "Chrome/Android"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('a902b1cd-d64e-420d-a18e-ce6cc1cb01ce', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Rizky Firmansyah', 'LOGIN', 'auth', NULL, '{"ip": "10.0.0.50", "device": "PTSSS Mobile App"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('65482c56-6d2f-4909-b253-91bd1cb399f6', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'LOGIN', 'auth', NULL, '{"ip": "10.0.0.51", "device": "PTSSS Mobile App"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('726f1cc9-d61e-4843-b0e1-2967de0f0a23', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'Budi Santoso', 'LOGIN', 'auth', NULL, '{"ip": "10.0.0.52", "device": "PTSSS Mobile App"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('12a84eb7-382e-46db-a93e-3d0e829d00af', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'CREATE', 'users', NULL, '{"nrp": "AGT001", "nama": "Ahmad Fadillah", "role": "anggota"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('100bf774-f383-4bb0-8425-0737734c8217', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Rizky Firmansyah', 'UPDATE', 'laporan_harian', NULL, '{"count": 3, "action": "approve"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('455549c1-0f02-487b-b9c4-cecd75cbb866', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'CREATE', 'absensi', NULL, '{"tipe": "masuk", "status": "hadir"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('22b9c468-2d5d-47cd-80f6-f1ade6b0c44f', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'Budi Santoso', 'CREATE', 'panic_alerts', NULL, '{"alasan": "Penyusup terdeteksi"}', NULL, '2026-02-19 05:01:16.343156+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('f5e6139c-2910-4d8f-a41a-b20ddd2e9bb4', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', NULL, '{"ip": "192.168.1.100", "device": "Chrome/Windows"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('3af00b27-c3bd-4889-b6a1-85890e498773', '51d249e7-6ac0-421e-b928-3b2090bf0596', 'Hendri Saputra', 'LOGIN', 'auth', NULL, '{"ip": "192.168.1.101", "device": "Chrome/Android"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('4f2a0ceb-bba0-4110-bb58-ceca78f86873', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Rizky Firmansyah', 'LOGIN', 'auth', NULL, '{"ip": "10.0.0.50", "device": "PTSSS Mobile App"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('a9a17c1a-ee34-414d-aa2b-5378a3cb4ac2', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'LOGIN', 'auth', NULL, '{"ip": "10.0.0.51", "device": "PTSSS Mobile App"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('ae75888e-96f5-41fe-b48a-b999c0fc26e1', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'Budi Santoso', 'LOGIN', 'auth', NULL, '{"ip": "10.0.0.52", "device": "PTSSS Mobile App"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('4d4e1837-e081-4e8a-af1a-669991c90d9d', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'CREATE', 'users', NULL, '{"nrp": "AGT001", "nama": "Ahmad Fadillah", "role": "anggota"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('aa25ff73-789c-4b51-8a9b-6ce9b0fcf1e2', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Rizky Firmansyah', 'UPDATE', 'laporan_harian', NULL, '{"count": 3, "action": "approve"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('ae833ab8-605d-4af0-8629-2ef5ebda6ea9', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'CREATE', 'absensi', NULL, '{"tipe": "masuk", "status": "hadir"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('57ceb1a8-6849-40ab-a7ef-2281181e0934', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'Budi Santoso', 'CREATE', 'panic_alerts', NULL, '{"alasan": "Penyusup terdeteksi"}', NULL, '2026-02-19 05:02:13.990035+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('550b6364-274f-484f-a903-e31d94be4c54', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:07:04.908238+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('e1be383e-bfa2-4406-83c8-c65244967217', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:07:05.084301+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('7fff2e59-e457-4861-94c9-78d161d1175b', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:07:05.17509+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('53471bfb-1ea0-409a-a472-9887fe118a47', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'LOGIN', 'auth', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '{"nrp": "AGT001", "role": "anggota"}', NULL, '2026-02-19 05:07:05.491719+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('eff16802-64fd-460c-99f8-cb1864f0ba98', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:07:06.800922+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('7f8003b3-a379-4d1d-8f9e-8d1f4066874f', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:07:06.967296+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('589c6520-cedd-47ad-aa18-570cba66d914', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:07:07.057882+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('264d2d2b-7aad-4d0e-9ff8-182109895ae2', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'LOGIN', 'auth', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '{"nrp": "AGT001", "role": "anggota"}', NULL, '2026-02-19 05:14:08.368715+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('74638fcc-b272-4c6d-ae82-ae77dd254495', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'CREATE', 'absensi', '2448290c-6acf-4501-9809-e82b74e391b8', '{"tipe": "keluar", "status": "hadir"}', NULL, '2026-02-19 05:15:35.645609+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('60f4f5d9-3a3d-4892-b838-0a2b8e1d024e', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Rizky Firmansyah', 'LOGIN', 'auth', '6cb94259-680d-4031-9a51-219a8e3c3537', '{"nrp": "KMD001", "role": "komandan"}', NULL, '2026-02-19 05:17:15.859749+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('f2907650-8e70-43ba-be78-e2dca4ed3e6f', '51d249e7-6ac0-421e-b928-3b2090bf0596', 'Hendri Saputra', 'LOGIN', 'auth', '51d249e7-6ac0-421e-b928-3b2090bf0596', '{"nrp": "SPV001", "role": "supervisor"}', NULL, '2026-02-19 05:18:03.145985+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('a5fc043e-9c02-4d8a-a04e-92c5393fe856', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:18:36.244651+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('e783430c-291c-4821-8e1d-9f487a080258', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 05:19:21.999648+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('cfcebbd7-6443-4d1c-a81c-80d21f9e3498', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'LOGIN', 'auth', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '{"nrp": "AGT001", "role": "anggota"}', NULL, '2026-02-19 05:21:50.922282+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('7241855e-9e1f-4526-8ed2-b7b7261e8dee', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'CREATE', 'laporan_harian', '7c106e6d-04cd-44a7-a3d6-ca154c3b3436', '{"shift": "06:00-14:00"}', NULL, '2026-02-19 05:22:22.918823+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('7d5c10d9-8e8b-434b-a8ac-23235787dc18', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 14:10:31.817248+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('42743403-969b-4778-b059-d63a5d1006ee', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 14:10:32.150248+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('a59c8181-b7ed-4643-bed4-4f313fdc8d1e', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 14:10:32.250204+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('6f98ef3c-ae1e-4589-b53a-ed357d598f09', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Ahmad Fadillah', 'LOGIN', 'auth', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '{"nrp": "AGT001", "role": "anggota"}', NULL, '2026-02-19 14:10:32.434056+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('5124bbf7-82e6-4836-befb-05747eb61bc3', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 14:10:33.666889+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('2be78714-28ed-4954-9a0a-1f00cb25ab61', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 14:10:33.830548+07');
INSERT INTO public.audit_log (id, user_id, user_nama, action, resource, resource_id, detail, ip_address, created_at) VALUES ('99d313a9-9cec-4f9c-8661-238691bff432', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Sopiak Pranata', 'LOGIN', 'auth', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '{"nrp": "ADM001", "role": "admin"}', NULL, '2026-02-19 14:10:33.91689+07');


--
-- TOC entry 5244 (class 0 OID 41778)
-- Dependencies: 240
-- Data for Name: berkas_personil; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5234 (class 0 OID 41581)
-- Dependencies: 230
-- Data for Name: broadcasts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.broadcasts (id, pengirim_id, judul, pesan, prioritas, target, lokasi_id, created_at) VALUES ('a71b0c6f-d340-4538-8979-613b3ff4585b', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Peningkatan Keamanan', 'Tingkatkan pengawasan pagar timur. Ada laporan orang mencurigakan.', 'urgent', 'Semua Anggota', '9d20382f-7742-4559-806a-8158a399d3a2', '2026-02-19 05:01:16.326962+07');
INSERT INTO public.broadcasts (id, pengirim_id, judul, pesan, prioritas, target, lokasi_id, created_at) VALUES ('5312eea4-c7b3-4b22-a093-b002bd1a58e3', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Training Bulanan', 'Training keamanan Sabtu depan jam 08:00 di aula kantor.', 'normal', 'Semua Anggota', NULL, '2026-02-19 05:01:16.326962+07');
INSERT INTO public.broadcasts (id, pengirim_id, judul, pesan, prioritas, target, lokasi_id, created_at) VALUES ('0623cb74-f04f-45e4-8099-0b90e818f985', '14b53a67-ea59-4948-8f01-888926d3b4e7', 'Ganti Shift Darurat', 'AGT007 dan AGT009 ganti shift besok. Konfirmasi ke komandan.', 'urgent', 'Shift Pagi', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', '2026-02-19 05:01:16.326962+07');
INSERT INTO public.broadcasts (id, pengirim_id, judul, pesan, prioritas, target, lokasi_id, created_at) VALUES ('ec8d6399-5852-4ce0-acef-01a940022294', '6cb94259-680d-4031-9a51-219a8e3c3537', 'Peningkatan Keamanan', 'Tingkatkan pengawasan pagar timur. Ada laporan orang mencurigakan.', 'urgent', 'Semua Anggota', '9d20382f-7742-4559-806a-8158a399d3a2', '2026-02-19 05:02:13.97566+07');
INSERT INTO public.broadcasts (id, pengirim_id, judul, pesan, prioritas, target, lokasi_id, created_at) VALUES ('f99a7016-dd8c-4f63-8a23-bf97e2a1df3f', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'Training Bulanan', 'Training keamanan Sabtu depan jam 08:00 di aula kantor.', 'normal', 'Semua Anggota', NULL, '2026-02-19 05:02:13.97566+07');
INSERT INTO public.broadcasts (id, pengirim_id, judul, pesan, prioritas, target, lokasi_id, created_at) VALUES ('ffc5f5aa-f042-46b5-8e27-605b11e6a9a4', '14b53a67-ea59-4948-8f01-888926d3b4e7', 'Ganti Shift Darurat', 'AGT007 dan AGT009 ganti shift besok. Konfirmasi ke komandan.', 'urgent', 'Shift Pagi', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', '2026-02-19 05:02:13.97566+07');


--
-- TOC entry 5225 (class 0 OID 41392)
-- Dependencies: 221
-- Data for Name: checkpoints; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000001-0001-4000-8000-000000000001', '9d20382f-7742-4559-806a-8158a399d3a2', 'CP Gate A Utama', 'Gerbang Utama', 1.3717, 101.3957, 15, 'CHV-CP-001', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000001-0001-4000-8000-000000000002', '9d20382f-7742-4559-806a-8158a399d3a2', 'CP Gate B Belakang', 'Gerbang Belakang', 1.371, 101.3962, 15, 'CHV-CP-002', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000001-0001-4000-8000-000000000003', '9d20382f-7742-4559-806a-8158a399d3a2', 'CP Gudang Logistik', 'Area Gudang', 1.3722, 101.395, 15, 'CHV-CP-003', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000001-0001-4000-8000-000000000004', '9d20382f-7742-4559-806a-8158a399d3a2', 'CP Parkiran VIP', 'Area Parkir', 1.3715, 101.3948, 15, 'CHV-CP-004', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000002-0001-4000-8000-000000000001', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'CP Pintu Kilang', 'Area Kilang', 1.0998, 101.9792, 15, 'PTM-CP-001', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000002-0001-4000-8000-000000000002', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'CP Dermaga Muat', 'Area Dermaga', 1.099, 101.9784, 15, 'PTM-CP-002', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000002-0001-4000-8000-000000000003', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'CP Tangki Timbun', 'Area Tangki', 1.0985, 101.9798, 15, 'PTM-CP-003', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000002-0001-4000-8000-000000000004', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'CP Kantor Ops', 'Area Kantor', 1.0996, 101.978, 15, 'PTM-CP-004', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000003-0001-4000-8000-000000000001', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'CP Gate Mill', 'Area Gate', 0.3527, 101.8452, 15, 'RAPP-CP-001', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000003-0001-4000-8000-000000000002', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'CP Warehouse A', 'Area Warehouse', 0.352, 101.8457, 15, 'RAPP-CP-002', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000003-0001-4000-8000-000000000003', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'CP Perimeter', 'Area Perimeter', 0.3516, 101.8443, 15, 'RAPP-CP-003', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000003-0001-4000-8000-000000000004', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'CP Loading Bay', 'Area Loading', 0.3523, 101.846, 15, 'RAPP-CP-004', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000004-0001-4000-8000-000000000001', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'CP Camp Gate', 'Area Camp', 1.126, 102.135, 15, 'CPI-CP-001', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000004-0001-4000-8000-000000000002', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'CP Well Pad 7', 'Area Produksi', 1.1249, 102.1359, 15, 'CPI-CP-002', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000005-0001-4000-8000-000000000001', '57f63efa-d5b6-4628-8a92-94647033572e', 'CP Lobby PLN', 'Area Kantor', 0.5075, 101.4482, 15, 'PLN-CP-001', 'active', '2026-02-19 05:01:16.202689+07');
INSERT INTO public.checkpoints (id, lokasi_id, nama, area, latitude, longitude, radius, qr_code, status, created_at) VALUES ('c0000005-0001-4000-8000-000000000002', '57f63efa-d5b6-4628-8a92-94647033572e', 'CP Gardu Induk', 'Area Gardu', 0.5071, 101.4478, 15, 'PLN-CP-002', 'active', '2026-02-19 05:01:16.202689+07');


--
-- TOC entry 5221 (class 0 OID 41305)
-- Dependencies: 217
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.clients (id, kode_klien, nama_klien, jenis_kelamin, kontak_person, nomor_telepon, email, alamat_klien, jenis_jasa, tgl_mulai_kontrak, tgl_habis_kontrak, status_klien, path_kontrak_pdf, nrp_login, pin_hash, lokasi_id, foto_url, last_seen, created_at, updated_at) VALUES (1, 'K-001', 'PT Chevron Pacific Indonesia', 'Lainnya/Instansi', 'Ir. Bambang Suryo', '0811-7000-0001', 'security@chevron.co.id', 'Jl. Riau No. 1, Duri, Bengkalis, Riau', 'Pengamanan Area Produksi & Perkantoran', '2025-01-01', '2026-12-31', 'Aktif', NULL, 'K001', '$2a$12$LJ3m4yPE5CbKG9G0sV2lXOqJz3tFE.A8Y1VdmGp3rYKfZ6RhGjPjS', '9d20382f-7742-4559-806a-8158a399d3a2', NULL, NULL, '2026-02-19 05:01:16.133595+07', '2026-02-19 05:01:16.133595+07');
INSERT INTO public.clients (id, kode_klien, nama_klien, jenis_kelamin, kontak_person, nomor_telepon, email, alamat_klien, jenis_jasa, tgl_mulai_kontrak, tgl_habis_kontrak, status_klien, path_kontrak_pdf, nrp_login, pin_hash, lokasi_id, foto_url, last_seen, created_at, updated_at) VALUES (2, 'K-002', 'PT Pertamina EP Siak', 'Lainnya/Instansi', 'Hendra Gunawan', '0811-7000-0002', 'security@pertamina-ep.co.id', 'Jl. Pertamina Km.5, Siak Sri Indrapura, Riau', 'Pengamanan Kilang & Dermaga', '2025-03-01', '2027-02-28', 'Aktif', NULL, 'K002', '$2a$12$LJ3m4yPE5CbKG9G0sV2lXOqJz3tFE.A8Y1VdmGp3rYKfZ6RhGjPjS', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', NULL, NULL, '2026-02-19 05:01:16.133595+07', '2026-02-19 05:01:16.133595+07');
INSERT INTO public.clients (id, kode_klien, nama_klien, jenis_kelamin, kontak_person, nomor_telepon, email, alamat_klien, jenis_jasa, tgl_mulai_kontrak, tgl_habis_kontrak, status_klien, path_kontrak_pdf, nrp_login, pin_hash, lokasi_id, foto_url, last_seen, created_at, updated_at) VALUES (3, 'K-003', 'RAPP (Riau Andalan Pulp & Paper)', 'Lainnya/Instansi', 'Teguh Firmansyah', '0811-7000-0003', 'security@rapp.co.id', 'Pangkalan Kerinci, Pelalawan, Riau', 'Pengamanan Pabrik & Warehouse', '2025-06-01', '2027-05-31', 'Aktif', NULL, 'K003', '$2a$12$LJ3m4yPE5CbKG9G0sV2lXOqJz3tFE.A8Y1VdmGp3rYKfZ6RhGjPjS', '378904f6-ffc8-404a-ac5a-07c7cb401631', NULL, NULL, '2026-02-19 05:01:16.133595+07', '2026-02-19 05:01:16.133595+07');
INSERT INTO public.clients (id, kode_klien, nama_klien, jenis_kelamin, kontak_person, nomor_telepon, email, alamat_klien, jenis_jasa, tgl_mulai_kontrak, tgl_habis_kontrak, status_klien, path_kontrak_pdf, nrp_login, pin_hash, lokasi_id, foto_url, last_seen, created_at, updated_at) VALUES (4, 'K-004', 'PT CPI Area Minas', 'Lainnya/Instansi', 'Drs. Agus Santoso', '0811-7000-0004', 'minas@cpi.co.id', 'Minas, Siak, Riau', 'Pengamanan Camp & Well Pad', '2025-02-01', '2026-01-31', 'Aktif', NULL, 'K004', '$2a$12$LJ3m4yPE5CbKG9G0sV2lXOqJz3tFE.A8Y1VdmGp3rYKfZ6RhGjPjS', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', NULL, NULL, '2026-02-19 05:01:16.133595+07', '2026-02-19 05:01:16.133595+07');
INSERT INTO public.clients (id, kode_klien, nama_klien, jenis_kelamin, kontak_person, nomor_telepon, email, alamat_klien, jenis_jasa, tgl_mulai_kontrak, tgl_habis_kontrak, status_klien, path_kontrak_pdf, nrp_login, pin_hash, lokasi_id, foto_url, last_seen, created_at, updated_at) VALUES (5, 'K-005', 'PLN ULP Pekanbaru', 'Lainnya/Instansi', 'Ratna Dewi', '0811-7000-0005', 'security@pln-pku.co.id', 'Jl. Dr. Sutomo No. 69, Pekanbaru, Riau', 'Pengamanan Kantor & Gardu Induk', '2025-04-01', '2026-03-31', 'Aktif', NULL, 'K005', '$2a$12$LJ3m4yPE5CbKG9G0sV2lXOqJz3tFE.A8Y1VdmGp3rYKfZ6RhGjPjS', '57f63efa-d5b6-4628-8a92-94647033572e', NULL, NULL, '2026-02-19 05:01:16.133595+07', '2026-02-19 05:01:16.133595+07');


--
-- TOC entry 5241 (class 0 OID 41720)
-- Dependencies: 237
-- Data for Name: geofence_violations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.geofence_violations (id, user_id, lokasi_id, tipe, izin_keluar_id, latitude, longitude, jarak_dari_pusat, acknowledged, acknowledged_by, acknowledged_at, created_at) VALUES ('72358f59-dd0c-4ec8-99c9-a7e030db97d7', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '9d20382f-7742-4559-806a-8158a399d3a2', 'no_permission', NULL, 0.5656135, 101.4292646, 89657, false, NULL, NULL, '2026-02-19 05:17:06.757647+07');
INSERT INTO public.geofence_violations (id, user_id, lokasi_id, tipe, izin_keluar_id, latitude, longitude, jarak_dari_pusat, acknowledged, acknowledged_by, acknowledged_at, created_at) VALUES ('386ebcac-4127-475b-b801-d81b0c704afb', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '9d20382f-7742-4559-806a-8158a399d3a2', 'no_permission', NULL, 0.5655889, 101.4292104, 89660, false, NULL, NULL, '2026-02-19 05:24:15.363619+07');


--
-- TOC entry 5240 (class 0 OID 41693)
-- Dependencies: 236
-- Data for Name: geofence_izin; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5236 (class 0 OID 41625)
-- Dependencies: 232
-- Data for Name: jadwal_shift; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('ecd0745d-a69a-430c-ac30-d7449dc9a5a6', '9d20382f-7742-4559-806a-8158a399d3a2', 'Shift Pagi Chevron', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('40cab207-1052-4ef9-aee0-34f6ee46fc10', '9d20382f-7742-4559-806a-8158a399d3a2', 'Shift Siang Chevron', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('e4a12814-bf70-4781-bee1-63cde185a6f0', '9d20382f-7742-4559-806a-8158a399d3a2', 'Shift Malam Chevron', '22:00:00', '06:00:00', '#8e44ad', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('7bb8e4b3-7bd6-46c3-84c3-bf623646a7c0', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Shift Pagi Pertamina', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('7d18498b-73aa-4abd-89fd-bcbd7cb6e936', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Shift Siang Pertamina', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('ced117b2-fab8-45f4-aa9f-93bfd6c7def8', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Shift Malam Pertamina', '22:00:00', '06:00:00', '#8e44ad', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('7d7511f8-ddbf-42fc-894e-7f19162381e2', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Shift Pagi RAPP', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('63d5bd52-ba2f-4aaa-9fe0-53f3c0acfeb2', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Shift Siang RAPP', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('7e963c75-5dfd-4365-87d6-ed265ddd7fea', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Shift Pagi CPI', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('651fee33-3a88-4e69-ad60-79e211724559', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Shift Siang CPI', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('3b903484-b34c-486f-acbc-aadf3247c51d', '57f63efa-d5b6-4628-8a92-94647033572e', 'Shift Pagi PLN', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('97fdaa69-f20c-49aa-8807-51f25ec6eaf7', '57f63efa-d5b6-4628-8a92-94647033572e', 'Shift Siang PLN', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:01:16.219842+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('c0c95cc3-045b-483d-b9db-921007cb0ec4', '9d20382f-7742-4559-806a-8158a399d3a2', 'Shift Pagi Chevron', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('067d6b61-0bfc-4325-98de-3be8ce8a0410', '9d20382f-7742-4559-806a-8158a399d3a2', 'Shift Siang Chevron', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('3634f756-3cef-4d3c-b89c-165944203d49', '9d20382f-7742-4559-806a-8158a399d3a2', 'Shift Malam Chevron', '22:00:00', '06:00:00', '#8e44ad', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('8dca8ae4-76c2-40bd-98ef-31e59d3eee3a', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Shift Pagi Pertamina', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('812e86d5-3ad5-446d-aa19-ab289ecde47f', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Shift Siang Pertamina', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('64a7fca3-cfb3-4b3a-b779-ee82b269a8ab', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Shift Malam Pertamina', '22:00:00', '06:00:00', '#8e44ad', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('d5bc8556-41ab-4cd7-ad2f-323ec3fb0320', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Shift Pagi RAPP', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('18e7d1d9-cbb9-4ebb-8a2b-44282f8a3278', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Shift Siang RAPP', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('ea63e765-0250-453d-8373-f3659fe3006e', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Shift Pagi CPI', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('2e5d839e-55c9-4513-976f-8af48ce29307', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Shift Siang CPI', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('c050ae56-c9cc-4d84-abe6-fcf25e976e42', '57f63efa-d5b6-4628-8a92-94647033572e', 'Shift Pagi PLN', '06:00:00', '14:00:00', '#27ae60', '2026-02-19 05:02:13.887746+07');
INSERT INTO public.jadwal_shift (id, lokasi_id, nama, waktu_mulai, waktu_selesai, warna, created_at) VALUES ('94f61661-04f6-4a8a-8b41-a0b95d3f5952', '57f63efa-d5b6-4628-8a92-94647033572e', 'Shift Siang PLN', '14:00:00', '22:00:00', '#2980b9', '2026-02-19 05:02:13.887746+07');


--
-- TOC entry 5230 (class 0 OID 41491)
-- Dependencies: 226
-- Data for Name: laporan_harian; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('579ed25a-1da4-4be6-92bd-56c785905448', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '2026-02-19', '06:00-14:00', 'Pos Utama Gate A', 'aman', 'Patroli rutin, cek akses kendaraan', 'Tidak ada temuan', '{}', 'approved', 'Bagus!', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('e8f84668-e406-41ce-b10f-5ff83e7b2a82', 'fca105e8-71b8-4708-8004-56d7a07f51bb', '2026-02-19', '06:00-14:00', 'Pos Belakang Gate B', 'ada_masalah', 'Ditemukan pagar rusak sisi timur', 'Pagar kawat rusak 3 meter', '{}', 'pending', NULL, NULL, '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('c3914ca1-6307-4fd8-9f44-7d1c18cac17c', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', '2026-02-19', '06:00-14:00', 'Pos Pintu Masuk Utama', 'aman', 'Pengecekan ID kendaraan', 'Normal', '{}', 'approved', 'OK', '14b53a67-ea59-4948-8f01-888926d3b4e7', '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('629fb50b-4953-408b-b789-73b06a6698a2', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', '2026-02-19', '06:00-14:00', 'Pos Gate Utama Mill', 'aman', 'Monitoring CCTV', 'Semua normal', '{}', 'pending', NULL, NULL, '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('189f71d6-57c9-4b3b-a3a1-4e3c12e7f0d7', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', '2026-02-19', '06:00-14:00', 'Pos Pintu Masuk Camp', 'perhatian_khusus', 'Bekas ban truk tak dikenal di well pad', 'Kemungkinan kendaraan tanpa izin', '{}', 'pending', NULL, NULL, '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('324378dd-b481-4f38-83be-cc890226bba1', 'b507b106-9ed0-4877-8130-ca0227f471e6', '2026-02-19', '06:00-14:00', 'Pos Lobby Utama', 'aman', 'Pengawasan tamu kantor PLN', 'Normal', '{}', 'approved', 'Rapi', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('110b1d1a-e267-480a-9ddd-b30766b9fc9a', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '2026-02-18', '06:00-14:00', 'Pos Utama Gate A', 'aman', 'Patroli pagi', 'Normal', '{}', 'approved', 'OK', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('a3856f6c-7391-497f-873f-e66b2865c00f', 'fca105e8-71b8-4708-8004-56d7a07f51bb', '2026-02-18', '06:00-14:00', 'Pos Belakang Gate B', 'aman', 'Cek kunci gembok', 'Aman', '{}', 'approved', 'Good', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('9e2f3b2a-6d8b-4666-b1cd-b638fe2a72e4', '31c1c24a-c43f-4a3e-82cf-b001f52a8414', '2026-02-18', '14:00-22:00', 'Pos Gudang & Parkir', 'aman', 'Pengawasan gudang shift siang', 'Aman', '{}', 'approved', 'OK', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:01:16.294973+07', '2026-02-19 05:01:16.294973+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('6cd565ff-bcd4-4085-8d48-8471d71b621e', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '2026-02-19', '06:00-14:00', 'Pos Utama Gate A', 'aman', 'Patroli rutin, cek akses kendaraan', 'Tidak ada temuan', '{}', 'approved', 'Bagus!', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('7cb2df71-a248-41dc-9c03-75aceeb9849d', 'fca105e8-71b8-4708-8004-56d7a07f51bb', '2026-02-19', '06:00-14:00', 'Pos Belakang Gate B', 'ada_masalah', 'Ditemukan pagar rusak sisi timur', 'Pagar kawat rusak 3 meter', '{}', 'pending', NULL, NULL, '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('1de26e23-101e-4f14-bd7e-9aa8f3569095', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', '2026-02-19', '06:00-14:00', 'Pos Pintu Masuk Utama', 'aman', 'Pengecekan ID kendaraan', 'Normal', '{}', 'approved', 'OK', '14b53a67-ea59-4948-8f01-888926d3b4e7', '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('ae8add35-bb2d-45af-9f53-3d61c18547eb', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', '2026-02-19', '06:00-14:00', 'Pos Gate Utama Mill', 'aman', 'Monitoring CCTV', 'Semua normal', '{}', 'pending', NULL, NULL, '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('d0364fb5-b88d-43c3-8e65-f39e214b0a93', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', '2026-02-19', '06:00-14:00', 'Pos Pintu Masuk Camp', 'perhatian_khusus', 'Bekas ban truk tak dikenal di well pad', 'Kemungkinan kendaraan tanpa izin', '{}', 'pending', NULL, NULL, '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('a69bda99-f010-46df-9675-d55366c7839f', 'b507b106-9ed0-4877-8130-ca0227f471e6', '2026-02-19', '06:00-14:00', 'Pos Lobby Utama', 'aman', 'Pengawasan tamu kantor PLN', 'Normal', '{}', 'approved', 'Rapi', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('228c5f9b-88e3-4a63-aece-9931662703dd', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', '2026-02-18', '06:00-14:00', 'Pos Utama Gate A', 'aman', 'Patroli pagi', 'Normal', '{}', 'approved', 'OK', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('4b39b9b3-7fc0-4eae-b0be-f0bd03a42678', 'fca105e8-71b8-4708-8004-56d7a07f51bb', '2026-02-18', '06:00-14:00', 'Pos Belakang Gate B', 'aman', 'Cek kunci gembok', 'Aman', '{}', 'approved', 'Good', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('196a9b06-3029-4339-94d0-cea99728b47f', '31c1c24a-c43f-4a3e-82cf-b001f52a8414', '2026-02-18', '14:00-22:00', 'Pos Gudang & Parkir', 'aman', 'Pengawasan gudang shift siang', 'Aman', '{}', 'approved', 'OK', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:02:13.948678+07', '2026-02-19 05:02:13.948678+07');
INSERT INTO public.laporan_harian (id, user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, fotos, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('7c106e6d-04cd-44a7-a3d6-ca154c3b3436', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', NULL, '06:00-14:00', 'Pos Utama', 'aman', 'Aman Aman Aman Aman  Aman Aman  Aman Aman  Aman Aman  Aman Aman  Aman Aman  Aman Aman  Aman Aman', 'Aman Aman', '{http://192.168.1.5:8081/uploads/laporan/06f4aadf-90e4-4c8e-a891-d1204aca65dc.jpg}', 'pending', NULL, NULL, '2026-02-19 05:22:22.910598+07', '2026-02-19 05:22:22.910598+07');


--
-- TOC entry 5231 (class 0 OID 41516)
-- Dependencies: 227
-- Data for Name: laporan_kejadian; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('47dbb531-c328-4863-a0c7-09fa9a864e66', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Pencurian', 'sedang', '2026-02-19 02:01:16.307941+07', 'Gudang Logistik Chevron', 1.3722, 101.395, 'Gembok gudang B3 terpotong. Barang hilang diinventarisir. CCTV diamankan.', '{}', 'pending', NULL, NULL, '2026-02-19 05:01:16.307941+07', '2026-02-19 05:01:16.307941+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('26ba232c-20b4-4c13-9945-238ec781fb6e', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'Orang Mencurigakan', 'sedang', '2026-02-19 00:01:16.307941+07', 'Pagar Timur Gate B Chevron', 1.371, 101.3965, '2 orang mencurigakan di pagar timur. Sudah difoto.', '{}', 'approved', 'Koordinasi dengan polsek', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:01:16.307941+07', '2026-02-19 05:01:16.307941+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('e9cba0ff-869b-4e83-a44d-7caffc93ca45', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'Kebakaran', 'tinggi', '2026-02-18 03:01:16.307941+07', 'Tangki Cadangan Pertamina', 1.0985, 101.9798, 'Asap dari tangki #7. PMK dipanggil. False alarm - uap valve.', '{}', 'approved', 'False alarm, clear', '14b53a67-ea59-4948-8f01-888926d3b4e7', '2026-02-19 05:01:16.307941+07', '2026-02-19 05:01:16.307941+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('3434a9db-9828-4a6e-9b5b-d3fd869913e6', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'Kerusakan Fasilitas', 'rendah', '2026-02-19 03:01:16.307941+07', 'Pagar Camp CPI', 1.125, 102.136, 'Pagar rusak akibat pohon tumbang. Garis pengaman dipasang.', '{}', 'pending', NULL, NULL, '2026-02-19 05:01:16.307941+07', '2026-02-19 05:01:16.307941+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('0b0d7da5-1a91-4c87-b2b6-e228a3d88f9e', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'Pencurian', 'sedang', '2026-02-19 02:02:13.959542+07', 'Gudang Logistik Chevron', 1.3722, 101.395, 'Gembok gudang B3 terpotong. Barang hilang diinventarisir. CCTV diamankan.', '{}', 'pending', NULL, NULL, '2026-02-19 05:02:13.959542+07', '2026-02-19 05:02:13.959542+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('195d941c-8c42-4b80-ac3c-673bfd9b3783', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 'Orang Mencurigakan', 'sedang', '2026-02-19 00:02:13.959542+07', 'Pagar Timur Gate B Chevron', 1.371, 101.3965, '2 orang mencurigakan di pagar timur. Sudah difoto.', '{}', 'approved', 'Koordinasi dengan polsek', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 05:02:13.959542+07', '2026-02-19 05:02:13.959542+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('1a5bec7e-6cb4-45a4-a600-de93b7aee6a8', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'Kebakaran', 'tinggi', '2026-02-18 03:02:13.959542+07', 'Tangki Cadangan Pertamina', 1.0985, 101.9798, 'Asap dari tangki #7. PMK dipanggil. False alarm - uap valve.', '{}', 'approved', 'False alarm, clear', '14b53a67-ea59-4948-8f01-888926d3b4e7', '2026-02-19 05:02:13.959542+07', '2026-02-19 05:02:13.959542+07');
INSERT INTO public.laporan_kejadian (id, user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude, kronologi, bukti_media, status, catatan_komandan, validated_by, created_at, updated_at) VALUES ('26f1951f-a8c8-432a-80b7-a60126966411', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 'Kerusakan Fasilitas', 'rendah', '2026-02-19 03:02:13.959542+07', 'Pagar Camp CPI', 1.125, 102.136, 'Pagar rusak akibat pohon tumbang. Garis pengaman dipasang.', '{}', 'pending', NULL, NULL, '2026-02-19 05:02:13.959542+07', '2026-02-19 05:02:13.959542+07');


--
-- TOC entry 5242 (class 0 OID 41746)
-- Dependencies: 238
-- Data for Name: location_history; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.location_history (id, user_id, latitude, longitude, accuracy, dalam_radius, created_at) VALUES ('2addf242-e007-4941-9de7-9d0f92d5a38d', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 0.5656135, 101.4292646, 100, true, '2026-02-19 05:17:06.746376+07');
INSERT INTO public.location_history (id, user_id, latitude, longitude, accuracy, dalam_radius, created_at) VALUES ('da6dc571-c9a2-47ac-858a-9cc23149253e', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', 0.5655889, 101.4292104, 100, true, '2026-02-19 05:19:16.172893+07');
INSERT INTO public.location_history (id, user_id, latitude, longitude, accuracy, dalam_radius, created_at) VALUES ('f9ae4508-5685-4d26-9200-30fd30eac50b', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 0.5655889, 101.4292104, 100, true, '2026-02-19 05:24:15.35257+07');


--
-- TOC entry 5222 (class 0 OID 41323)
-- Dependencies: 218
-- Data for Name: lokasi; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.lokasi (id, nama, alamat, latitude, longitude, status, created_at, updated_at, radius, client_id) VALUES ('9d20382f-7742-4559-806a-8158a399d3a2', 'PT Chevron Pacific Indonesia', 'Jl. Riau No. 1, Duri, Bengkalis, Riau', 1.3712, 101.3952, 'active', '2026-02-19 05:01:16.188388+07', '2026-02-19 05:01:16.188388+07', 800, 1);
INSERT INTO public.lokasi (id, nama, alamat, latitude, longitude, status, created_at, updated_at, radius, client_id) VALUES ('f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'PT Pertamina EP Siak', 'Jl. Pertamina Km.5, Siak Sri Indrapura, Riau', 1.0993, 101.9788, 'active', '2026-02-19 05:01:16.188388+07', '2026-02-19 05:01:16.188388+07', 600, 2);
INSERT INTO public.lokasi (id, nama, alamat, latitude, longitude, status, created_at, updated_at, radius, client_id) VALUES ('378904f6-ffc8-404a-ac5a-07c7cb401631', 'RAPP (Riau Andalan Pulp & Paper)', 'Pangkalan Kerinci, Pelalawan, Riau', 0.3522, 101.8447, 'active', '2026-02-19 05:01:16.188388+07', '2026-02-19 05:01:16.188388+07', 1000, 3);
INSERT INTO public.lokasi (id, nama, alamat, latitude, longitude, status, created_at, updated_at, radius, client_id) VALUES ('d1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'PT CPI Area Minas', 'Minas, Siak, Riau', 1.1256, 102.1345, 'active', '2026-02-19 05:01:16.188388+07', '2026-02-19 05:01:16.188388+07', 700, 4);
INSERT INTO public.lokasi (id, nama, alamat, latitude, longitude, status, created_at, updated_at, radius, client_id) VALUES ('57f63efa-d5b6-4628-8a92-94647033572e', 'PLN ULP Pekanbaru', 'Jl. Dr. Sutomo No. 69, Pekanbaru, Riau', 0.5071, 101.4478, 'active', '2026-02-19 05:01:16.188388+07', '2026-02-19 05:01:16.188388+07', 300, 5);


--
-- TOC entry 5233 (class 0 OID 41565)
-- Dependencies: 229
-- Data for Name: notifikasi; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('6f91e6c7-8007-49fc-99e5-e19566de785f', 'info', 'Sistem PTSSS v17 Aktif', 'Sistem diperbarui ke v17 â€” Klien terpisah dari Users.', NULL, '{admin,supervisor}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('9f7b595f-8626-4742-a4e3-8e564f35fe8b', 'warning', 'Reminder: Laporan Harian', 'Segera lengkapi laporan harian sebelum akhir shift.', NULL, '{anggota}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('70538afc-cd74-4fe1-92cd-891974c5dff7', 'success', 'Laporan Bulanan Selesai', 'Laporan bulanan Januari 2026 berhasil.', NULL, '{admin,supervisor}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('f1834708-34cc-4721-acf5-1411f8e0061a', 'danger', 'APAR Perlu Isi Ulang', 'Beberapa pos melaporkan APAR perlu isi ulang.', NULL, '{admin,supervisor}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('13d16de0-ed8e-4456-b504-89a371542138', 'info', 'Patroli Hari Ini', '6 rute patroli terjadwal. Pastikan semua checkpoint dipindai.', NULL, '{komandan}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('d3f9710d-520a-4e42-9adb-3ae4077dc4f7', 'danger', 'Insiden: Pencurian', 'Ahmad Fadillah melaporkan Pencurian di Gudang Chevron', NULL, '{komandan,supervisor}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('1f740cb9-a499-4450-8b6f-612426a418a5', 'info', 'Laporan Harian Baru', 'Ahmad Fadillah mengirim laporan harian (aman)', NULL, '{komandan}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('4adfb315-1556-45aa-8dbe-0148b19dc908', 'success', 'Absensi Lengkap', '15/16 anggota shift pagi sudah absen masuk.', NULL, '{supervisor}', false, NULL, '2026-02-19 05:01:16.332755+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('3c3837a1-3314-45b3-bfea-44344c3e32a6', 'info', 'Sistem PTSSS v17 Aktif', 'Sistem diperbarui ke v17 â€” Klien terpisah dari Users.', NULL, '{admin,supervisor}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('23e35730-6b83-4882-a794-9153d83c1ebe', 'warning', 'Reminder: Laporan Harian', 'Segera lengkapi laporan harian sebelum akhir shift.', NULL, '{anggota}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('744083b2-d4e8-41d7-b561-e1663349e2e7', 'success', 'Laporan Bulanan Selesai', 'Laporan bulanan Januari 2026 berhasil.', NULL, '{admin,supervisor}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('f3c5082e-3ec3-40f4-8fe1-7a761ddedf0b', 'danger', 'APAR Perlu Isi Ulang', 'Beberapa pos melaporkan APAR perlu isi ulang.', NULL, '{admin,supervisor}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('5ba214d9-d8ad-4ecd-b603-073059c24c27', 'info', 'Patroli Hari Ini', '6 rute patroli terjadwal. Pastikan semua checkpoint dipindai.', NULL, '{komandan}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('69bd32cf-424a-4dc7-8617-cc01050ca93a', 'danger', 'Insiden: Pencurian', 'Ahmad Fadillah melaporkan Pencurian di Gudang Chevron', NULL, '{komandan,supervisor}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('976407c0-39c1-4b34-a4d2-356bd21d87c0', 'info', 'Laporan Harian Baru', 'Ahmad Fadillah mengirim laporan harian (aman)', NULL, '{komandan}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('315d1ab2-679b-4889-a61c-c6521408e87c', 'success', 'Absensi Lengkap', '15/16 anggota shift pagi sudah absen masuk.', NULL, '{supervisor}', false, NULL, '2026-02-19 05:02:13.98072+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('d09a9228-7194-4373-a7ad-6d502f6dec5f', 'success', 'Absensi Keluar', 'Ahmad Fadillah absensi keluar di Pos Lobby Utama pukul 05.15.32', NULL, '{komandan,supervisor}', false, NULL, '2026-02-19 05:15:35.460089+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('ce1777d2-6aea-4b02-aa42-eb39fa8f6e15', 'warning', 'Absensi Di Luar Radius', 'Ahmad Fadillah absen keluar di luar radius Pos Lobby Utama (6.8km)', NULL, '{komandan,supervisor}', false, NULL, '2026-02-19 05:15:35.646324+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('96744a92-9612-498d-bc68-7d1e7b29569a', 'danger', 'Pelanggaran Geofence', 'Ahmad Fadillah KELUAR dari wilayah PT Chevron Pacific Indonesia TANPA IZIN! Jarak: 89657m (radius: 800m).', NULL, '{komandan,supervisor,admin}', false, '{"type": "geofence_violation", "jarak": 89657, "radius": 800, "user_id": "325256b1-5cb6-4349-bb32-4fb11f5bda3e", "severity": "danger", "user_nama": "Ahmad Fadillah", "lokasi_nama": "PT Chevron Pacific Indonesia"}', '2026-02-19 05:17:06.760561+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('144fc60c-2f57-457c-8d6c-7bd156407a04', 'info', 'Laporan Harian Baru', 'Ahmad Fadillah mengirim laporan harian (aman)', NULL, '{komandan}', false, NULL, '2026-02-19 05:22:22.879858+07');
INSERT INTO public.notifikasi (id, tipe, judul, pesan, target_user_id, target_role, dibaca, data, created_at) VALUES ('5041c079-9e49-4f48-852d-6329ae7fd26c', 'danger', 'Pelanggaran Geofence', 'Ahmad Fadillah KELUAR dari wilayah PT Chevron Pacific Indonesia TANPA IZIN! Jarak: 89660m (radius: 800m).', NULL, '{komandan,supervisor,admin}', false, '{"type": "geofence_violation", "jarak": 89660, "radius": 800, "user_id": "325256b1-5cb6-4349-bb32-4fb11f5bda3e", "severity": "danger", "user_nama": "Ahmad Fadillah", "lokasi_nama": "PT Chevron Pacific Indonesia"}', '2026-02-19 05:24:15.365469+07');


--
-- TOC entry 5235 (class 0 OID 41603)
-- Dependencies: 231
-- Data for Name: panic_alerts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.panic_alerts (id, user_id, latitude, longitude, alamat, status, resolved_by, resolved_at, created_at, pesan, foto_url, lokasi_text, catatan_resolver, jenis_darurat, nomor_kontak, respon_detail) VALUES ('334c8bc0-4f08-43eb-a3e1-7f60855b9169', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 1.3708, 101.3965, 'Pagar belakang Gate B, PT Chevron', 'resolved', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 01:01:16.322581+07', '2026-02-19 05:01:16.322581+07', NULL, NULL, NULL, NULL, 'umum', NULL, NULL);
INSERT INTO public.panic_alerts (id, user_id, latitude, longitude, alamat, status, resolved_by, resolved_at, created_at, pesan, foto_url, lokasi_text, catatan_resolver, jenis_darurat, nomor_kontak, respon_detail) VALUES ('869b2371-263f-4868-9ade-abda9026cbd0', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 1.1253, 102.1355, 'Well Pad Area 7, CPI Minas', 'resolved', '7a062de0-193d-443f-ba28-98be719e6c1e', '2026-02-18 05:01:16.322581+07', '2026-02-19 05:01:16.322581+07', NULL, NULL, NULL, NULL, 'umum', NULL, NULL);
INSERT INTO public.panic_alerts (id, user_id, latitude, longitude, alamat, status, resolved_by, resolved_at, created_at, pesan, foto_url, lokasi_text, catatan_resolver, jenis_darurat, nomor_kontak, respon_detail) VALUES ('6e15ffce-b177-46ad-8f89-b34aba73302e', 'fca105e8-71b8-4708-8004-56d7a07f51bb', 1.3708, 101.3965, 'Pagar belakang Gate B, PT Chevron', 'resolved', '6cb94259-680d-4031-9a51-219a8e3c3537', '2026-02-19 01:02:13.97162+07', '2026-02-19 05:02:13.97162+07', NULL, NULL, NULL, NULL, 'umum', NULL, NULL);
INSERT INTO public.panic_alerts (id, user_id, latitude, longitude, alamat, status, resolved_by, resolved_at, created_at, pesan, foto_url, lokasi_text, catatan_resolver, jenis_darurat, nomor_kontak, respon_detail) VALUES ('faf1fc48-03f1-40b0-8f16-da8450a117c2', 'd89f0df6-e04b-4e35-a227-9f76ef10c310', 1.1253, 102.1355, 'Well Pad Area 7, CPI Minas', 'resolved', '7a062de0-193d-443f-ba28-98be719e6c1e', '2026-02-18 05:02:13.97162+07', '2026-02-19 05:02:13.97162+07', NULL, NULL, NULL, NULL, 'umum', NULL, NULL);


--
-- TOC entry 5228 (class 0 OID 41453)
-- Dependencies: 224
-- Data for Name: patrol_scans; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5227 (class 0 OID 41429)
-- Dependencies: 223
-- Data for Name: patroli; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5223 (class 0 OID 41343)
-- Dependencies: 219
-- Data for Name: pos_jaga; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('b586fc62-2352-405a-8ecc-1f95225ebcdf', '9d20382f-7742-4559-806a-8158a399d3a2', 'Pos Utama Gate A', 100, 1.3716, 101.3956, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('c6b35ff6-cb15-4b43-bf6f-bb5b6e1a6c42', '9d20382f-7742-4559-806a-8158a399d3a2', 'Pos Belakang Gate B', 100, 1.3709, 101.3961, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('6e1a2262-fae5-4d07-9422-a7abd2212781', '9d20382f-7742-4559-806a-8158a399d3a2', 'Pos Gudang & Parkir', 80, 1.3721, 101.3949, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('83f85ec8-414d-4288-9b5c-ce49f645a78d', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Pos Pintu Masuk Utama', 100, 1.0997, 101.9791, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('a2d47e1c-6f83-4fb2-b9a3-c7e6d5f80123', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Pos Area Kilang', 80, 1.0991, 101.9796, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('d4e58f2d-7a94-4ac3-ca84-d8f7e6a91234', 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'Pos Dermaga', 80, 1.0989, 101.9783, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('e5f69a3e-8ba5-4bd4-db95-e9a8f7ba2345', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Pos Gate Utama Mill', 120, 0.3526, 101.8451, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('f6a7ab4f-9cb6-4ce5-ec06-fab9a8cb3456', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Pos Area Warehouse', 80, 0.3519, 101.8456, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('a7b8bc5a-0dc7-4df6-fd17-abcab9dc4567', '378904f6-ffc8-404a-ac5a-07c7cb401631', 'Pos Perimeter Selatan', 100, 0.3515, 101.8442, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('b8c9cd6b-1ed8-4ea7-ae28-bcdba0ed5678', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Pos Pintu Masuk Camp', 100, 1.1259, 102.1349, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('c9d0de7c-2fe9-4fb8-bf39-cdecb1fe6789', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Pos Area Produksi', 80, 1.1253, 102.1351, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('d0e1ef8d-3af0-4ac9-c040-defdc2af7890', 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'Pos Well Pad 7', 60, 1.1248, 102.1358, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('e1f2fa9e-4ba1-4bda-d151-efaed3ba8901', '57f63efa-d5b6-4628-8a92-94647033572e', 'Pos Lobby Utama', 80, 0.5074, 101.4481, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('f2a3ab0f-5cb2-4ceb-e262-fabfe4cb9012', '57f63efa-d5b6-4628-8a92-94647033572e', 'Pos Gardu Induk', 60, 0.507, 101.4477, 'active', '2026-02-19 05:01:16.191382+07');
INSERT INTO public.pos_jaga (id, lokasi_id, nama, radius, latitude, longitude, status, created_at) VALUES ('a3b4bc1a-6dc3-4dfc-f373-abcaf5dc0123', '57f63efa-d5b6-4628-8a92-94647033572e', 'Pos Parkir & Loading', 80, 0.5068, 101.4484, 'active', '2026-02-19 05:01:16.191382+07');


--
-- TOC entry 5243 (class 0 OID 41759)
-- Dependencies: 239
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.refresh_tokens (id, user_id, client_id, token, expires_at, created_at) VALUES ('1e42a3b7-208b-48e7-b98c-1458f734206d', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', NULL, 'ed547bb70ba2b9860552a5f4f4767cfca78e4a25711c3a130ddc0d473295601ea0d51b1adf1ea00d', '2026-02-26 14:10:32.425+07', '2026-02-19 14:10:32.428494+07');
INSERT INTO public.refresh_tokens (id, user_id, client_id, token, expires_at, created_at) VALUES ('536c8f96-b9e4-4fa1-b62c-bc3d33966a7f', '89d4c584-2b42-40f6-9a5e-efcc7b05292f', NULL, '6ff871f122d151b53205dab36cfbdd2d211bcbb4723d949670da77314f759cedc87e3597c05a3c51', '2026-02-26 14:10:33.912+07', '2026-02-19 14:10:33.914702+07');


--
-- TOC entry 5238 (class 0 OID 41663)
-- Dependencies: 234
-- Data for Name: report_exports; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5226 (class 0 OID 41411)
-- Dependencies: 222
-- Data for Name: routes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5232 (class 0 OID 41542)
-- Dependencies: 228
-- Data for Name: serah_terima; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('27dbf4d0-f60f-469a-ab9c-71ee0c155051', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'cbea5068-1c1b-48ec-913c-b5406f610e16', 'aman', '[{"qty": 2, "nama": "HT Motorola", "kondisi": "baik"}, {"qty": 1, "nama": "Senter LED", "kondisi": "baik"}, {"qty": 3, "nama": "Kunci Pos", "kondisi": "baik"}]', 'Inventaris lengkap. Area aman. APAR dicek.', '{}', true, '2026-02-19 05:01:16.315646+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('59aefaa2-c7a9-4907-9dda-3ef542ac613e', 'fca105e8-71b8-4708-8004-56d7a07f51bb', '130a2d71-1787-4ad9-87dd-2494ef99f13b', 'perhatian', '[{"qty": 2, "nama": "HT Motorola", "kondisi": "baik"}, {"qty": 1, "nama": "Senter", "kondisi": "rusak"}]', 'Senter mati. Pagar timur masih rusak.', '{}', true, '2026-02-19 05:01:16.315646+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('22f4727a-947f-47da-9dee-470d085ba071', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'e2b87c1c-adf9-494c-baef-fd5b13eec00e', 'aman', '[{"qty": 1, "nama": "HT Icom", "kondisi": "baik"}, {"qty": 2, "nama": "Kunci Gate", "kondisi": "baik"}]', 'Normal.', '{}', false, '2026-02-19 05:01:16.315646+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('2d9a45e8-a90a-4fe5-81de-049b51257641', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', '6b452059-fb87-4d16-9851-a9201db7c5a5', 'aman', '[{"qty": 2, "nama": "HT Baofeng", "kondisi": "baik"}, {"qty": 1, "nama": "APAR", "kondisi": "terisi"}]', 'Semua OK.', '{}', true, '2026-02-19 05:01:16.315646+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('5f5b23eb-d1a6-4a23-aaed-44ed2e5eb471', '325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'cbea5068-1c1b-48ec-913c-b5406f610e16', 'aman', '[{"qty": 2, "nama": "HT Motorola", "kondisi": "baik"}, {"qty": 1, "nama": "Senter LED", "kondisi": "baik"}, {"qty": 3, "nama": "Kunci Pos", "kondisi": "baik"}]', 'Inventaris lengkap. Area aman. APAR dicek.', '{}', true, '2026-02-19 05:02:13.965319+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('a964e5da-3374-407e-ac1c-7381e581d16d', 'fca105e8-71b8-4708-8004-56d7a07f51bb', '130a2d71-1787-4ad9-87dd-2494ef99f13b', 'perhatian', '[{"qty": 2, "nama": "HT Motorola", "kondisi": "baik"}, {"qty": 1, "nama": "Senter", "kondisi": "rusak"}]', 'Senter mati. Pagar timur masih rusak.', '{}', true, '2026-02-19 05:02:13.965319+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('cbd7eac4-d810-4f79-a73d-52e178d5db9a', '710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'e2b87c1c-adf9-494c-baef-fd5b13eec00e', 'aman', '[{"qty": 1, "nama": "HT Icom", "kondisi": "baik"}, {"qty": 2, "nama": "Kunci Gate", "kondisi": "baik"}]', 'Normal.', '{}', false, '2026-02-19 05:02:13.965319+07');
INSERT INTO public.serah_terima (id, user_id, penerima_id, kondisi_area, inventaris, catatan, fotos, dikonfirmasi, created_at) VALUES ('efc56c4b-0165-497d-9b06-3e18ab70850d', '7246bf2f-9602-4dfb-8233-f03f6f37a26b', '6b452059-fb87-4d16-9851-a9201db7c5a5', 'aman', '[{"qty": 2, "nama": "HT Baofeng", "kondisi": "baik"}, {"qty": 1, "nama": "APAR", "kondisi": "terisi"}]', 'Semua OK.', '{}', true, '2026-02-19 05:02:13.965319+07');


--
-- TOC entry 5237 (class 0 OID 41640)
-- Dependencies: 233
-- Data for Name: shift_assignments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- TOC entry 5224 (class 0 OID 41360)
-- Dependencies: 220
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('fca105e8-71b8-4708-8004-56d7a07f51bb', 'AGT002', 'Budi Santoso', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0002', 'anggota', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', 'c6b35ff6-cb15-4b43-bf6f-bb5b6e1a6c42', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.194813+07', 1.3709, 101.3961, 82, NULL, '2026-02-19 05:01:16.194813+07', '2026-02-19 05:01:16.194813+07', NULL, 'Pekanbaru', '1996-08-30', 'Jl. Nangka No. 7, Duri', 'SMA', NULL, NULL, NULL, NULL, NULL, NULL, '2023-04-15', 'ditempatkan', 'L', NULL, 'Islam', NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('0a54aa1d-d778-41a2-a990-4c8135f6aadf', 'ADM002', 'Rina Maharani', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0812-7700-0002', 'admin', NULL, NULL, NULL, '08:00-17:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.5072, 101.4479, 92, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2021-06-01', 'ditempatkan', 'P', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('0603727b-da65-4f68-bbed-9381d30c487e', 'SPV002', 'Dewi Anggraini', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0813-6500-0002', 'supervisor', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', NULL, '08:00-17:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.0994, 101.9789, 88, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2021-09-01', 'ditempatkan', 'P', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('14b53a67-ea59-4948-8f01-888926d3b4e7', 'KMD002', 'Wahyu Pratama', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0821-7100-0002', 'komandan', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', NULL, '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.0995, 101.979, 85, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2022-05-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('7a062de0-193d-443f-ba28-98be719e6c1e', 'KMD003', 'Dedi Irawan', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0821-7100-0003', 'komandan', NULL, '378904f6-ffc8-404a-ac5a-07c7cb401631', NULL, '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.3523, 101.8448, 87, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2022-08-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('31c1c24a-c43f-4a3e-82cf-b001f52a8414', 'AGT003', 'Candra Wijaya', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0003', 'anggota', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', '6e1a2262-fae5-4d07-9422-a7abd2212781', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.3721, 101.3949, 78, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-06-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('cbea5068-1c1b-48ec-913c-b5406f610e16', 'AGT004', 'Dimas Prasetyo', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0004', 'anggota', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', 'b586fc62-2352-405a-8ecc-1f95225ebcdf', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.3717, 101.3957, 90, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-07-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('130a2d71-1787-4ad9-87dd-2494ef99f13b', 'AGT005', 'Eko Kurniawan', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0005', 'anggota', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', 'c6b35ff6-cb15-4b43-bf6f-bb5b6e1a6c42', '22:00-06:00', 'off_duty', '2026-02-19 05:01:16.198949+07', 1.371, 101.3958, 75, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-09-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('710f9a4f-dadf-43cd-9dde-b85fcdca7b38', 'AGT006', 'Fajar Ramadhan', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0006', 'anggota', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', '83f85ec8-414d-4288-9b5c-ce49f645a78d', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.0997, 101.9791, 88, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-03-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('30fbb76a-bfda-4f62-9074-32e2c4d8d0b9', 'AGT007', 'Gunawan Hidayat', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0007', 'anggota', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'a2d47e1c-6f83-4fb2-b9a3-c7e6d5f80123', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.0991, 101.9796, 79, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-05-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('d47676f3-3e89-418d-a9c5-613005344de0', 'AGT008', 'Hasan Abdullah', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0008', 'anggota', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'd4e58f2d-7a94-4ac3-ca84-d8f7e6a91234', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.0989, 101.9783, 83, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-08-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('e2b87c1c-adf9-494c-baef-fd5b13eec00e', 'AGT009', 'Irfan Maulana', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0009', 'anggota', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', '83f85ec8-414d-4288-9b5c-ce49f645a78d', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.0998, 101.9792, 86, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-10-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('4d5cce23-f338-4e48-9a97-5d10da69026f', 'AGT010', 'Joko Susilo', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0010', 'anggota', NULL, 'f01e11a2-728a-4b86-ae23-b92fc8b0a73b', 'd4e58f2d-7a94-4ac3-ca84-d8f7e6a91234', '22:00-06:00', 'off_duty', '2026-02-19 05:01:16.198949+07', 1.099, 101.9784, 80, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-01-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('7246bf2f-9602-4dfb-8233-f03f6f37a26b', 'AGT011', 'Krisna Putra', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0011', 'anggota', NULL, '378904f6-ffc8-404a-ac5a-07c7cb401631', 'e5f69a3e-8ba5-4bd4-db95-e9a8f7ba2345', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.3526, 101.8451, 84, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-04-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('4e6f6cfe-6cb5-40d0-aba9-5bcf298725fc', 'AGT012', 'Lukman Hakim', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0012', 'anggota', NULL, '378904f6-ffc8-404a-ac5a-07c7cb401631', 'f6a7ab4f-9cb6-4ce5-ec06-fab9a8cb3456', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.3519, 101.8456, 81, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-07-15', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('6b452059-fb87-4d16-9851-a9201db7c5a5', 'AGT013', 'Muhammad Arif', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0013', 'anggota', NULL, '378904f6-ffc8-404a-ac5a-07c7cb401631', 'a7b8bc5a-0dc7-4df6-fd17-abcab9dc4567', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.3515, 101.8442, 77, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-11-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-1111-4aaa-bbbb-111111111111', 'AGT014', 'Naufal Akbar', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0014', 'anggota', NULL, '378904f6-ffc8-404a-ac5a-07c7cb401631', 'e5f69a3e-8ba5-4bd4-db95-e9a8f7ba2345', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.3524, 101.8449, 82, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-02-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-2222-4aaa-bbbb-222222222222', 'AGT015', 'Oscar Pratama', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0015', 'anggota', NULL, '378904f6-ffc8-404a-ac5a-07c7cb401631', 'f6a7ab4f-9cb6-4ce5-ec06-fab9a8cb3456', '22:00-06:00', 'off_duty', '2026-02-19 05:01:16.198949+07', 0.352, 101.8453, 79, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-03-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('d89f0df6-e04b-4e35-a227-9f76ef10c310', 'AGT016', 'Pandu Wicaksono', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0016', 'anggota', NULL, 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'b8c9cd6b-1ed8-4ea7-ae28-bcdba0ed5678', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.1259, 102.1349, 85, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-05-15', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('69fb2edc-e887-42a6-be75-92b90bacd31a', 'AGT017', 'Rafi Ananda', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0017', 'anggota', NULL, 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'c9d0de7c-2fe9-4fb8-bf39-cdecb1fe6789', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.1253, 102.1351, 83, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-08-15', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-3333-4aaa-bbbb-333333333333', 'AGT018', 'Surya Darma', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0018', 'anggota', NULL, 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'd0e1ef8d-3af0-4ac9-c040-defdc2af7890', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.1248, 102.1358, 80, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-01-15', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-4444-4aaa-bbbb-444444444444', 'AGT019', 'Taufik Hidayat', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0019', 'anggota', NULL, 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'b8c9cd6b-1ed8-4ea7-ae28-bcdba0ed5678', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 1.126, 102.1347, 78, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-04-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-5555-4aaa-bbbb-555555555555', 'AGT020', 'Umar Faruk', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0020', 'anggota', NULL, 'd1c1278c-ebd6-4f2d-801e-07cb1e58a214', 'c9d0de7c-2fe9-4fb8-bf39-cdecb1fe6789', '22:00-06:00', 'off_duty', '2026-02-19 05:01:16.198949+07', 1.1255, 102.135, 76, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-06-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('b507b106-9ed0-4877-8130-ca0227f471e6', 'AGT021', 'Vino Pratama', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0021', 'anggota', NULL, '57f63efa-d5b6-4628-8a92-94647033572e', 'e1f2fa9e-4ba1-4bda-d151-efaed3ba8901', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.5074, 101.4481, 87, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-06-15', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('51d249e7-6ac0-421e-b928-3b2090bf0596', 'SPV001', 'Hendri Saputra', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0813-6500-0001', 'supervisor', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', NULL, '08:00-17:00', 'on_duty', '2026-02-19 05:18:03.137432+07', 1.3713, 101.3953, 90, NULL, '2026-02-19 05:01:16.194813+07', '2026-02-19 05:01:16.194813+07', NULL, 'Dumai', '1988-07-22', 'Jl. Gajah Mada No. 12, Duri', 'S1 Hukum', NULL, NULL, NULL, NULL, NULL, NULL, '2021-03-01', 'ditempatkan', 'L', NULL, 'Islam', NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('6cb94259-680d-4031-9a51-219a8e3c3537', 'KMD001', 'Rizky Firmansyah', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0821-7100-0001', 'komandan', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', NULL, '06:00-14:00', 'on_duty', '2026-02-19 05:17:24.594987+07', 0.5655889, 101.4292104, 88, NULL, '2026-02-19 05:01:16.194813+07', '2026-02-19 05:01:16.194813+07', NULL, 'Bengkalis', '1990-11-05', 'Jl. Hang Tuah No. 8, Duri', 'SMA', NULL, NULL, NULL, NULL, NULL, NULL, '2022-01-10', 'ditempatkan', 'L', NULL, 'Islam', NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('9b9b23a5-1e71-475e-a04a-efa7d1b5e841', 'AGT022', 'Wawan Setiawan', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0022', 'anggota', NULL, '57f63efa-d5b6-4628-8a92-94647033572e', 'f2a3ab0f-5cb2-4ceb-e262-fabfe4cb9012', '06:00-14:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.507, 101.4477, 84, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2023-09-15', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('fcfb7880-4c19-466b-a5dc-eac27f938edb', 'AGT023', 'Yusuf Rahman', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0023', 'anggota', NULL, '57f63efa-d5b6-4628-8a92-94647033572e', 'e1f2fa9e-4ba1-4bda-d151-efaed3ba8901', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.5075, 101.4482, 81, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-01-10', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-6666-4aaa-bbbb-666666666666', 'AGT024', 'Zaki Mubarak', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0024', 'anggota', NULL, '57f63efa-d5b6-4628-8a92-94647033572e', 'f2a3ab0f-5cb2-4ceb-e262-fabfe4cb9012', '14:00-22:00', 'on_duty', '2026-02-19 05:01:16.198949+07', 0.5069, 101.4476, 79, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-05-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('a1b2c3d4-7777-4aaa-bbbb-777777777777', 'AGT025', 'Andi Saputra', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0025', 'anggota', NULL, '57f63efa-d5b6-4628-8a92-94647033572e', 'a3b4bc1a-6dc3-4dfc-f373-abcaf5dc0123', '22:00-06:00', 'off_duty', '2026-02-19 05:01:16.198949+07', 0.5067, 101.4483, 77, NULL, '2026-02-19 05:01:16.198949+07', '2026-02-19 05:01:16.198949+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2024-07-01', 'ditempatkan', 'L', NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('89d4c584-2b42-40f6-9a5e-efcc7b05292f', 'ADM001', 'Sopiak Pranata', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0812-7700-0001', 'admin', NULL, NULL, NULL, '08:00-17:00', 'on_duty', '2026-02-19 14:10:33.91243+07', 0.5655889, 101.4292104, 95, 'fu7QMO-DTa6mPgOGWUGM8O:APA91bFwzoPeTlZqm7MdtyNxsYx7VYHWCcx-taiqT5m4evPtK71EumicNfgpKujN-cS-sMLSQeFX_DbZA32vnS9BxxehKnAhmUICjVsU6dNHvd4Stn3iPtQ', '2026-02-19 05:01:16.194813+07', '2026-02-19 05:01:16.194813+07', NULL, 'Pekanbaru', '1985-03-15', 'Jl. Sudirman No. 45, Pekanbaru', 'S1 Manajemen', NULL, NULL, NULL, NULL, NULL, NULL, '2020-01-15', 'ditempatkan', 'L', NULL, 'Islam', NULL, NULL);
INSERT INTO public.users (id, nrp, nama, pin_hash, no_hp, role, foto_url, lokasi_id, pos_jaga_id, shift, status, last_seen, last_latitude, last_longitude, skor, expo_push_token, created_at, updated_at, no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_lainnya, catatan_personil, tanggal_bergabung, status_penempatan, jenis_kelamin, golongan_darah, agama, berkas_foto, berkas_cv) VALUES ('325256b1-5cb6-4349-bb32-4fb11f5bda3e', 'AGT001', 'Ahmad Fadillah', '$2a$10$k451eEogrNiXmEITg/petOr71LsXB253TVpYADhgRUzYC1StFlCGm', '0852-6300-0001', 'anggota', NULL, '9d20382f-7742-4559-806a-8158a399d3a2', 'b586fc62-2352-405a-8ecc-1f95225ebcdf', '06:00-14:00', 'on_duty', '2026-02-19 14:10:32.424132+07', 0.5655889, 101.4292104, 85, 'fu7QMO-DTa6mPgOGWUGM8O:APA91bFwzoPeTlZqm7MdtyNxsYx7VYHWCcx-taiqT5m4evPtK71EumicNfgpKujN-cS-sMLSQeFX_DbZA32vnS9BxxehKnAhmUICjVsU6dNHvd4Stn3iPtQ', '2026-02-19 05:01:16.194813+07', '2026-02-19 05:01:16.194813+07', NULL, 'Siak', '1995-04-18', 'Jl. Meranti No. 3, Duri', 'SMA', NULL, NULL, NULL, NULL, NULL, NULL, '2023-02-01', 'ditempatkan', 'L', NULL, 'Islam', NULL, NULL);


--
-- TOC entry 5251 (class 0 OID 0)
-- Dependencies: 216
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.clients_id_seq', 5, true);


--
-- TOC entry 4996 (class 2606 OID 41485)
-- Name: absensi absensi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absensi
    ADD CONSTRAINT absensi_pkey PRIMARY KEY (id);


--
-- TOC entry 5021 (class 2606 OID 41692)
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 5037 (class 2606 OID 41787)
-- Name: berkas_personil berkas_personil_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berkas_personil
    ADD CONSTRAINT berkas_personil_pkey PRIMARY KEY (id);


--
-- TOC entry 5011 (class 2606 OID 41592)
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- TOC entry 4985 (class 2606 OID 41403)
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (id);


--
-- TOC entry 4987 (class 2606 OID 41405)
-- Name: checkpoints checkpoints_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_qr_code_key UNIQUE (qr_code);


--
-- TOC entry 4965 (class 2606 OID 41320)
-- Name: clients clients_kode_klien_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_kode_klien_key UNIQUE (kode_klien);


--
-- TOC entry 4967 (class 2606 OID 41322)
-- Name: clients clients_nrp_login_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_nrp_login_key UNIQUE (nrp_login);


--
-- TOC entry 4969 (class 2606 OID 41318)
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- TOC entry 5027 (class 2606 OID 41730)
-- Name: geofence_violations geofence_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_violations
    ADD CONSTRAINT geofence_violations_pkey PRIMARY KEY (id);


--
-- TOC entry 5025 (class 2606 OID 41704)
-- Name: geofence_izin geofence_izin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_izin
    ADD CONSTRAINT geofence_izin_pkey PRIMARY KEY (id);


--
-- TOC entry 5015 (class 2606 OID 41634)
-- Name: jadwal_shift jadwal_shift_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jadwal_shift
    ADD CONSTRAINT jadwal_shift_pkey PRIMARY KEY (id);


--
-- TOC entry 5001 (class 2606 OID 41505)
-- Name: laporan_harian laporan_harian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_harian
    ADD CONSTRAINT laporan_harian_pkey PRIMARY KEY (id);


--
-- TOC entry 5004 (class 2606 OID 41531)
-- Name: laporan_kejadian laporan_kejadian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_kejadian
    ADD CONSTRAINT laporan_kejadian_pkey PRIMARY KEY (id);


--
-- TOC entry 5031 (class 2606 OID 41753)
-- Name: location_history location_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4974 (class 2606 OID 41337)
-- Name: lokasi lokasi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lokasi
    ADD CONSTRAINT lokasi_pkey PRIMARY KEY (id);


--
-- TOC entry 5009 (class 2606 OID 41575)
-- Name: notifikasi notifikasi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifikasi
    ADD CONSTRAINT notifikasi_pkey PRIMARY KEY (id);


--
-- TOC entry 5013 (class 2606 OID 41614)
-- Name: panic_alerts panic_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panic_alerts
    ADD CONSTRAINT panic_alerts_pkey PRIMARY KEY (id);


--
-- TOC entry 4994 (class 2606 OID 41461)
-- Name: patrol_scans patrol_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrol_scans
    ADD CONSTRAINT patrol_scans_pkey PRIMARY KEY (id);


--
-- TOC entry 4992 (class 2606 OID 41442)
-- Name: patroli patroli_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patroli
    ADD CONSTRAINT patroli_pkey PRIMARY KEY (id);


--
-- TOC entry 4976 (class 2606 OID 41354)
-- Name: pos_jaga pos_jaga_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_jaga
    ADD CONSTRAINT pos_jaga_pkey PRIMARY KEY (id);


--
-- TOC entry 5035 (class 2606 OID 41767)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 5019 (class 2606 OID 41672)
-- Name: report_exports report_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exports
    ADD CONSTRAINT report_exports_pkey PRIMARY KEY (id);


--
-- TOC entry 4989 (class 2606 OID 41423)
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- TOC entry 5006 (class 2606 OID 41554)
-- Name: serah_terima serah_terima_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima
    ADD CONSTRAINT serah_terima_pkey PRIMARY KEY (id);


--
-- TOC entry 5017 (class 2606 OID 41647)
-- Name: shift_assignments shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 4981 (class 2606 OID 41381)
-- Name: users users_nrp_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_nrp_key UNIQUE (nrp);


--
-- TOC entry 4983 (class 2606 OID 41379)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4997 (class 1259 OID 41796)
-- Name: idx_absensi_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_absensi_user ON public.absensi USING btree (user_id);


--
-- TOC entry 4998 (class 1259 OID 41797)
-- Name: idx_absensi_waktu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_absensi_waktu ON public.absensi USING btree (waktu);


--
-- TOC entry 5022 (class 1259 OID 41803)
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_log USING btree (created_at);


--
-- TOC entry 5023 (class 1259 OID 41802)
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_log USING btree (user_id);


--
-- TOC entry 5038 (class 1259 OID 41811)
-- Name: idx_berkas_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_berkas_user ON public.berkas_personil USING btree (user_id);


--
-- TOC entry 4970 (class 1259 OID 41806)
-- Name: idx_clients_kode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_kode ON public.clients USING btree (kode_klien);


--
-- TOC entry 4971 (class 1259 OID 41807)
-- Name: idx_clients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_status ON public.clients USING btree (status_klien);


--
-- TOC entry 4999 (class 1259 OID 41799)
-- Name: idx_laporan_harian_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laporan_harian_user ON public.laporan_harian USING btree (user_id);


--
-- TOC entry 5002 (class 1259 OID 41800)
-- Name: idx_laporan_kejadian_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_laporan_kejadian_user ON public.laporan_kejadian USING btree (user_id);


--
-- TOC entry 5028 (class 1259 OID 41805)
-- Name: idx_location_history_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_created ON public.location_history USING btree (created_at);


--
-- TOC entry 5029 (class 1259 OID 41804)
-- Name: idx_location_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_user ON public.location_history USING btree (user_id);


--
-- TOC entry 4972 (class 1259 OID 41808)
-- Name: idx_lokasi_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lokasi_client ON public.lokasi USING btree (client_id);


--
-- TOC entry 5007 (class 1259 OID 41801)
-- Name: idx_notifikasi_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifikasi_target ON public.notifikasi USING btree (target_user_id);


--
-- TOC entry 4990 (class 1259 OID 41798)
-- Name: idx_patroli_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patroli_user ON public.patroli USING btree (user_id);


--
-- TOC entry 5032 (class 1259 OID 41810)
-- Name: idx_refresh_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_token ON public.refresh_tokens USING btree (token);


--
-- TOC entry 5033 (class 1259 OID 41809)
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- TOC entry 4977 (class 1259 OID 41795)
-- Name: idx_users_lokasi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_lokasi ON public.users USING btree (lokasi_id);


--
-- TOC entry 4978 (class 1259 OID 41793)
-- Name: idx_users_nrp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_nrp ON public.users USING btree (nrp);


--
-- TOC entry 4979 (class 1259 OID 41794)
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- TOC entry 5049 (class 2606 OID 41486)
-- Name: absensi absensi_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.absensi
    ADD CONSTRAINT absensi_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: absensi absensi_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- Added in v4 fix to support per-location filtering.
--

ALTER TABLE ONLY public.absensi
    ADD CONSTRAINT absensi_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE SET NULL;


--
-- TOC entry 5076 (class 2606 OID 41788)
-- Name: berkas_personil berkas_personil_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berkas_personil
    ADD CONSTRAINT berkas_personil_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5057 (class 2606 OID 41598)
-- Name: broadcasts broadcasts_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5058 (class 2606 OID 41593)
-- Name: broadcasts broadcasts_pengirim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pengirim_id_fkey FOREIGN KEY (pengirim_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5043 (class 2606 OID 41406)
-- Name: checkpoints checkpoints_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5070 (class 2606 OID 41741)
-- Name: geofence_violations geofence_violations_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_violations
    ADD CONSTRAINT geofence_violations_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id);


--
-- TOC entry 5071 (class 2606 OID 41736)
-- Name: geofence_violations geofence_violations_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_violations
    ADD CONSTRAINT geofence_violations_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5072 (class 2606 OID 41731)
-- Name: geofence_violations geofence_violations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_violations
    ADD CONSTRAINT geofence_violations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5067 (class 2606 OID 41715)
-- Name: geofence_izin geofence_izin_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_izin
    ADD CONSTRAINT geofence_izin_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- TOC entry 5068 (class 2606 OID 41710)
-- Name: geofence_izin geofence_izin_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_izin
    ADD CONSTRAINT geofence_izin_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5069 (class 2606 OID 41705)
-- Name: geofence_izin geofence_izin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_izin
    ADD CONSTRAINT geofence_izin_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5061 (class 2606 OID 41635)
-- Name: jadwal_shift jadwal_shift_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jadwal_shift
    ADD CONSTRAINT jadwal_shift_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5050 (class 2606 OID 41506)
-- Name: laporan_harian laporan_harian_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_harian
    ADD CONSTRAINT laporan_harian_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: laporan_harian laporan_harian_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- Added in v4 fix to support per-location filtering.
--

ALTER TABLE ONLY public.laporan_harian
    ADD CONSTRAINT laporan_harian_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE SET NULL;


--
-- TOC entry 5051 (class 2606 OID 41511)
-- Name: laporan_harian laporan_harian_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_harian
    ADD CONSTRAINT laporan_harian_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES public.users(id);


--
-- TOC entry 5052 (class 2606 OID 41532)
-- Name: laporan_kejadian laporan_kejadian_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_kejadian
    ADD CONSTRAINT laporan_kejadian_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: laporan_kejadian laporan_kejadian_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- Added in v4 fix to support per-location filtering.
--

ALTER TABLE ONLY public.laporan_kejadian
    ADD CONSTRAINT laporan_kejadian_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE SET NULL;


--
-- TOC entry 5053 (class 2606 OID 41537)
-- Name: laporan_kejadian laporan_kejadian_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laporan_kejadian
    ADD CONSTRAINT laporan_kejadian_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES public.users(id);


--
-- TOC entry 5073 (class 2606 OID 41754)
-- Name: location_history location_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5039 (class 2606 OID 41338)
-- Name: lokasi lokasi_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lokasi
    ADD CONSTRAINT lokasi_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- TOC entry 5056 (class 2606 OID 41576)
-- Name: notifikasi notifikasi_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifikasi
    ADD CONSTRAINT notifikasi_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id);


--
-- TOC entry 5059 (class 2606 OID 41620)
-- Name: panic_alerts panic_alerts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panic_alerts
    ADD CONSTRAINT panic_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- TOC entry 5060 (class 2606 OID 41615)
-- Name: panic_alerts panic_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.panic_alerts
    ADD CONSTRAINT panic_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- v9: panic_alerts.lokasi_id is INSERTed by operasional.repository.js:70
--     and filtered by dashboard.repository.js:22.
--

ALTER TABLE ONLY public.panic_alerts
    ADD CONSTRAINT panic_alerts_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE SET NULL;


--
-- TOC entry 5047 (class 2606 OID 41467)
-- Name: patrol_scans patrol_scans_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrol_scans
    ADD CONSTRAINT patrol_scans_checkpoint_id_fkey FOREIGN KEY (checkpoint_id) REFERENCES public.checkpoints(id);


--
-- TOC entry 5048 (class 2606 OID 41462)
-- Name: patrol_scans patrol_scans_patroli_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrol_scans
    ADD CONSTRAINT patrol_scans_patroli_id_fkey FOREIGN KEY (patroli_id) REFERENCES public.patroli(id) ON DELETE CASCADE;


--
-- TOC entry 5045 (class 2606 OID 41448)
-- Name: patroli patroli_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patroli
    ADD CONSTRAINT patroli_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id);


--
-- TOC entry 5046 (class 2606 OID 41443)
-- Name: patroli patroli_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patroli
    ADD CONSTRAINT patroli_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5040 (class 2606 OID 41355)
-- Name: pos_jaga pos_jaga_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_jaga
    ADD CONSTRAINT pos_jaga_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5074 (class 2606 OID 41773)
-- Name: refresh_tokens refresh_tokens_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- TOC entry 5075 (class 2606 OID 41768)
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5065 (class 2606 OID 41678)
-- Name: report_exports report_exports_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exports
    ADD CONSTRAINT report_exports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id);


--
-- TOC entry 5066 (class 2606 OID 41673)
-- Name: report_exports report_exports_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_exports
    ADD CONSTRAINT report_exports_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id);


--
-- TOC entry 5044 (class 2606 OID 41424)
-- Name: routes routes_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id) ON DELETE CASCADE;


--
-- TOC entry 5054 (class 2606 OID 41560)
-- Name: serah_terima serah_terima_penerima_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima
    ADD CONSTRAINT serah_terima_penerima_id_fkey FOREIGN KEY (penerima_id) REFERENCES public.users(id);


--
-- TOC entry 5055 (class 2606 OID 41555)
-- Name: serah_terima serah_terima_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima
    ADD CONSTRAINT serah_terima_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5062 (class 2606 OID 41658)
-- Name: shift_assignments shift_assignments_pos_jaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_pos_jaga_id_fkey FOREIGN KEY (pos_jaga_id) REFERENCES public.pos_jaga(id);


--
-- TOC entry 5063 (class 2606 OID 41648)
-- Name: shift_assignments shift_assignments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.jadwal_shift(id) ON DELETE CASCADE;


--
-- TOC entry 5064 (class 2606 OID 41653)
-- Name: shift_assignments shift_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5041 (class 2606 OID 41382)
-- Name: users users_lokasi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_lokasi_id_fkey FOREIGN KEY (lokasi_id) REFERENCES public.lokasi(id);


--
-- TOC entry 5042 (class 2606 OID 41387)
-- Name: users users_pos_jaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pos_jaga_id_fkey FOREIGN KEY (pos_jaga_id) REFERENCES public.pos_jaga(id);


-- Completed on 2026-02-19 14:29:13

--
-- PostgreSQL database dump complete
--