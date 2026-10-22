# Geo Entity Manager

Aplikasi web untuk menampilkan dan mengelola entitas yang memiliki lokasi
geografis, misalnya kendaraan, perangkat IoT, dan fasilitas. Setiap entitas
punya identitas, atribut dasar, status, dan koordinat, dan bisa dibuat,
dilihat, diubah, serta dihapus langsung dari peta.

**Stack:** Go (chi, pgx) · PostgreSQL + PostGIS · React + TypeScript (Vite,
MapLibre GL, TanStack Query, react-hook-form, zod, Tailwind CSS)

## Fitur

- Entitas ditampilkan di peta interaktif sebagai marker yang di-*cluster* dan
  diberi warna sesuai status. Hanya entitas di area peta yang sedang terlihat
  yang dimuat, dan data dimuat ulang saat peta digeser atau di-zoom.
- Pencarian berdasarkan nama serta filter tipe dan status. Daftar dan peta
  selalu menampilkan hasil yang sama.
- Panel detail berisi koordinat, waktu dibuat/diubah, dan atribut bebas
  (misalnya plat nomor untuk kendaraan, versi firmware untuk perangkat).
- Membuat dan mengubah entitas lewat form. Lokasi bisa diatur dengan klik di
  peta atau menggeser pin. Hapus dengan konfirmasi.
- Validasi di dua sisi: form mengecek aturan yang sama dengan API sebelum
  mengirim, dan error yang tetap dikembalikan API ditampilkan di field yang
  bersangkutan.

## Menjalankan dengan Docker (cara tercepat)

Prasyarat: [Docker](https://www.docker.com/products/docker-desktop/) dengan
Docker Compose.

```bash
docker compose up --build
```

Lalu buka **http://localhost:3000**. Start pertama akan mem-build image
(sekitar satu menit) dan memuat 15 entitas contoh di berbagai kota di Indonesia.

| Service | URL                   | Keterangan                                    |
| ------- | --------------------- | --------------------------------------------- |
| Web UI  | http://localhost:3000 | nginx menyajikan aplikasi dan mem-proxy `/api` |
| API     | http://localhost:8080 | contoh: `curl localhost:8080/api/v1/entities`  |
| DB      | localhost:5432        | PostgreSQL + PostGIS, user/password `geo`      |

Hentikan dengan `docker compose down`. Tambahkan `-v` untuk menghapus data
juga; entitas contoh akan dimuat lagi pada start berikutnya.

> Port 3000, 8080, dan 5432 harus kosong. Kalau Anda sudah menjalankan
> PostgreSQL di komputer, hentikan dulu atau ubah port di `docker-compose.yml`.

## Development lokal

Jalankan database di Docker, sedangkan API dan UI dijalankan langsung dengan
*hot reload*.

**Backend** ([Go 1.26+](https://go.dev/dl/)):

```bash
docker compose up -d --wait db
cd backend
go run ./cmd/api              # http://localhost:8080, migrasi otomatis saat start
```

**Frontend** ([Node.js 20+](https://nodejs.org/)), di terminal kedua:

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, /api di-proxy ke :8080
```

Set `SEED_SAMPLE_DATA=true` sebelum `go run` untuk memuat entitas contoh ke
database yang masih kosong. `Makefile` membungkus perintah yang sering dipakai
(`make up`, `make backend-test-integration`, `make frontend-check`, ...). Setiap
target hanyalah perintah biasa yang juga bisa dijalankan manual.

## Testing

| Perintah                          | Yang dijalankan                                         |
| --------------------------------- | ------------------------------------------------------- |
| `cd backend && go test ./...`     | Unit test Go (domain, HTTP handler, config, seed)       |
| `make backend-test-integration`   | Semua test Go, termasuk test repository ke database PostGIS sungguhan |
| `make backend-lint`               | golangci-lint                                           |
| `cd frontend && npm test`         | Unit test dan component test (Vitest)                   |
| `make frontend-check`             | Prettier, ESLint, TypeScript, test, dan build           |

Test repository membutuhkan database dan dilewati (*skip*) kalau
`TEST_DATABASE_URL` tidak di-set. Docker Compose membuat database terpisah
bernama `geo_test` untuk keperluan ini. Tanpa `make`, lihat `Makefile` untuk
perintah `docker run` yang setara.

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
menjalankan semua pengecekan di atas pada setiap push dan pull request,
ditambah build image Docker.

## Arsitektur

```
Browser ── http://localhost:3000 ──> nginx (web)
                                      ├─ /         aplikasi React (static)
                                      └─ /api/*  ──> Go API (api) ──> PostgreSQL + PostGIS (db)
```

### Backend (`backend/`)

```
cmd/api                    entrypoint: config, wiring, graceful shutdown
internal/config            konfigurasi dari environment variable
internal/entity            domain: model, aturan validasi, service, interface Repository
internal/httpapi           router, middleware, handler, format error JSON
internal/storage/postgres  pgx pool, migrasi SQL (embedded), implementasi Repository
internal/seed              data contoh untuk instalasi baru
```

Dependensi mengarah ke dalam: `httpapi` → `entity.Service` → `entity.Repository`.
Paket domain tidak tahu apa pun soal HTTP maupun SQL, sehingga aturan bisnis
bisa dites tanpa keduanya, dan storage bisa diganti tanpa menyentuh aturan
tersebut.

### Frontend (`frontend/src/`)

```
app/                 app shell dan query client
components/ui/       komponen UI generik (Button, Field, ConfirmDialog, ...)
features/entities/   semua yang berkaitan dengan entitas:
  model.ts           tipe, schema zod untuk response, enum, label
  api.ts             pemanggilan HTTP
  queries.ts         hook TanStack Query dan cache key
  form.ts            schema form, konversi data, pemetaan error dari server
  map.ts             helper peta (GeoJSON, bounding box, kamera)
  components/        EntityExplorer (layar utama), EntityMap, EntityList,
                     EntityDetail, EntityForm, EntityFilters
lib/                 HTTP client, format tampilan
```

Kontrak REST lengkap ada di [docs/API.md](docs/API.md) (dalam bahasa Inggris).
Ringkasnya: `GET/POST /api/v1/entities` dan `GET/PUT/DELETE /api/v1/entities/{id}`,
dengan filter `type`, `status`, `search`, `bbox`, dan `limit` pada endpoint list.

### Validasi

| Lapisan             | Yang dicek                                                               |
| ------------------- | ------------------------------------------------------------------------ |
| Form (zod)          | Field wajib, panjang teks, enum, rentang koordinat, key atribut, duplikat |
| HTTP handler        | JSON valid, `Content-Type`, ukuran body, field tak dikenal, koordinat wajib ada |
| Domain (Go)         | Semua aturan bisnis; sumber kebenaran                                     |
| Database            | Constraint `NOT NULL` dan `CHECK` untuk type dan status                   |
| Response API (zod)  | Frontend mem-*parse* setiap response, sehingga ketidakcocokan kontrak langsung ketahuan |

Semua error memakai format yang sama,
`{"error": {"code", "message", "details": [{"field", "message"}]}}`:
`400` jika request tidak bisa di-*parse*, `422` jika melanggar aturan, dan
`404` jika entitas tidak ada. Form memetakan `details` kembali ke field-nya
masing-masing.

## Alasan pemilihan library

### Backend

| Pilihan | Alasan |
| --- | --- |
| **Go `net/http` + [chi](https://github.com/go-chi/chi)** | chi menambahkan routing dan middleware tapi tetap 100% kompatibel dengan `net/http`, jadi tidak terikat ke framework tertentu. |
| **PostgreSQL + PostGIS** | Standar industri untuk data geospasial. Index GiST membuat query "entitas di dalam area peta ini" tetap cepat berapa pun jumlah datanya. |
| **[pgx](https://github.com/jackc/pgx)** | Driver PostgreSQL untuk Go yang paling lengkap dan cepat. SQL ditulis manual karena query-nya sedikit dan memakai fungsi PostGIS yang biasanya tersembunyi di balik ORM. |
| **[goose](https://github.com/pressly/goose)** | Migrasi berupa file SQL biasa yang di-*embed* ke binary dan dijalankan saat start, sehingga versi kode dan skema database tidak mungkin berbeda. |
| **Validasi ditulis manual** | Aturannya sedikit tapi spesifik (enum, koordinat NaN, format key atribut). Kode Go biasa lebih eksplisit, tanpa *reflection*, dan langsung menghasilkan error per field untuk API. |
| **`log/slog`, `google/uuid`** | Logging terstruktur dari standard library; ID dibuat oleh domain, bukan oleh database. |
| **golangci-lint** | Satu kumpulan linter terkurasi (errcheck, staticcheck, gosec, errorlint, ...) yang dijalankan di CI. |

### Frontend

| Pilihan | Alasan |
| --- | --- |
| **React + TypeScript + [Vite](https://vite.dev)** | Stack yang diminta; Vite memberi build cepat dan *hot reload*. TypeScript dalam mode strict. |
| **[MapLibre GL](https://maplibre.org) + [react-map-gl](https://visgl.github.io/react-map-gl/)** | Peta vektor open-source yang dirender dengan WebGL, sehingga ribuan titik yang di-*cluster* tetap lancar. react-map-gl memberi API React yang deklaratif. |
| **Tile [OpenFreeMap](https://openfreemap.org)** | Gratis dan tanpa API key, jadi proyek bisa langsung dijalankan tanpa perlu mendaftar. URL style bisa diganti lewat konfigurasi. |
| **[TanStack Query](https://tanstack.com/query)** | Hampir semua state di aplikasi ini berasal dari server. Caching, refetch di latar belakang, retry, dan invalidasi cache setelah perubahan data sudah tersedia, sehingga tidak perlu global store seperti Redux. |
| **[zod](https://zod.dev)** | Satu library schema untuk validasi form sekaligus untuk mem-*parse* response API saat runtime. |
| **[react-hook-form](https://react-hook-form.com)** | Form yang efisien, mendukung daftar field dinamis (atribut), dan terintegrasi dengan zod. |
| **[Tailwind CSS](https://tailwindcss.com)** | Styling berupa utility class di dekat markup, tanpa stylesheet global yang terus membengkak. |
| **Vitest + Testing Library** | Memakai konfigurasi Vite yang sama; test mencari elemen seperti pengguna mencarinya (berdasarkan role dan label). |
| **ESLint (typescript-eslint strict) + Prettier** | Lint yang memahami tipe menangkap bug nyata; Prettier menyeragamkan format kode. |

### Infrastruktur

**Docker Compose** menjalankan seluruh stack dengan satu perintah. Image API
berisi binary statis di atas base image **distroless** tanpa akses root. UI
disajikan oleh **nginx**, yang juga mem-proxy `/api`, sehingga browser hanya
berkomunikasi dengan satu origin dan tidak memerlukan CORS.

## Keputusan desain dan trade-off

- **Data dimuat per area peta.** Endpoint list menerima *bounding box*,
  sehingga client hanya memuat yang terlihat, dengan batas 500 entitas (UI
  meminta pengguna zoom in kalau batas itu tercapai). Area peta yang
  melintasi garis 180° (antimeridian) belum didukung.
- **Atribut fleksibel.** Detail khusus per tipe disimpan sebagai map string di
  kolom `jsonb`, bukan satu tabel atau kumpulan kolom per tipe. Sederhana dan
  mudah dikembangkan, tapi nilainya berupa teks tanpa tipe.
- **Update berupa penggantian penuh.** `PUT` mengganti semua field yang bisa
  diubah; form selalu mengirim entitas secara lengkap.
- **Di luar cakupan.** Autentikasi dan otorisasi, update real-time (misalnya
  posisi kendaraan lewat WebSocket/SSE), riwayat/audit perubahan, paginasi
  untuk hasil yang sangat besar, dan test end-to-end di browser (misalnya
  Playwright). Ini adalah langkah pengembangan berikutnya yang paling wajar.

## Konfigurasi

Environment variable backend (lihat `backend/.env.example`):

| Variable               | Default                 | Keterangan                                      |
| ---------------------- | ----------------------- | ----------------------------------------------- |
| `HTTP_ADDR`            | `:8080`                 | Alamat yang didengarkan server HTTP             |
| `DATABASE_URL`         | database compose lokal  | Connection string PostgreSQL                    |
| `LOG_LEVEL`            | `info`                  | `debug`, `info`, `warn`, atau `error`           |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Daftar origin yang diizinkan, dipisah koma      |
| `SHUTDOWN_TIMEOUT`     | `10s`                   | Waktu tunggu request yang sedang berjalan saat shutdown |
| `SEED_SAMPLE_DATA`     | `false`                 | Memuat entitas contoh ke database yang kosong   |

Variable build frontend (lihat `frontend/.env.example`): `VITE_API_BASE_URL`
(kosong = origin yang sama), `VITE_MAP_STYLE_URL`, dan untuk dev server,
`VITE_API_PROXY_TARGET`.

## Pengembangan dengan bantuan AI

Proyek ini dikerjakan dengan **[Claude Code](https://claude.com/claude-code)**,
sebuah *agentic coding tool*, sebagai rekan pemrograman (*pair programmer*).
Sesuai permintaan soal, bagian ini menjelaskan bagaimana dan sejauh mana AI
dipakai.

**Sejauh mana.** Agent menulis sebagian besar kode, test, dan draf
dokumentasi. Saya yang mengambil keputusan desain, me-review setiap perubahan,
menjalankannya di komputer saya, dan melakukan commit. Agent tidak pernah
melakukan commit atau push sendiri.

**Alur kerja.**

1. **Diskusi desain terlebih dahulu.** Agent mengusulkan arsitektur, model
   data, desain API, dan rencana kerja delapan fase. Pertanyaan yang masih
   terbuka saya putuskan sendiri: PostgreSQL + PostGIS atau SQLite, MapLibre
   atau Leaflet, bahasa Inggris untuk kode dan dokumentasi teknis, serta
   autentikasi dan update real-time di luar cakupan.
2. **Satu fase dalam satu waktu** (lihat riwayat git): scaffold → domain dan
   validasi → database → REST API → data layer frontend → peta → form →
   packaging. Di setiap fase agent mengimplementasikan perubahan beserta test
   dan memverifikasinya: `gofmt`/`vet`/test untuk Go; Prettier, ESLint,
   TypeScript, Vitest, dan build untuk frontend; request langsung ke API yang
   sedang berjalan; serta pengecekan di browser sungguhan. Setelah itu saya
   me-review perubahannya, menanyakan bagian yang belum jelas, lalu commit.
3. **[CLAUDE.md](CLAUDE.md)** berisi aturan yang diikuti agent di repo ini:
   batasan arsitektur, format error, konvensi testing, dan jebakan yang
   ditemukan selama pengerjaan. File ini diperbarui seiring proyek berkembang,
   sehingga sekaligus menjadi dokumentasi codebase untuk kontributor
   berikutnya.

**Di mana verifikasi berperan.** Menjalankan aplikasinya, bukan hanya test,
menemukan masalah yang tidak tertangkap oleh test:

- Web worker MapLibre gagal dimuat setelah di-*bundle*, sehingga peta tetap
  kosong. Sekarang worker dimuat secara eksplisit lewat `?worker&url` dari
  Vite.
- react-map-gl memakai ulang data fitur dari gerakan mouse terakhir saat klik,
  sehingga tap tanpa gerakan mouse sebelumnya tidak memilih apa pun. Sekarang
  klik ditangani dengan query langsung di titik yang diklik.
- Di laptop Windows saya, Smart App Control memblokir binary test Go yang
  di-build lokal. Karena itu seluruh test suite dijalankan di dalam container
  Docker, sama seperti cara CI menjalankannya.
