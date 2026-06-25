# (Sengaja tanpa model ORM)

Proyek **PT Sopiak Satria Saga** memakai **pola Repository** murni di atas
`pg` (PostgreSQL), **bukan ORM**. Akses data ada di:

- `backend/src/repositories/` — kueri SQL ter-parameter (mis. `user.repository.js`,
  `patroli.repository.js`, `operasional.repository.js`, `base.repository.js`).
- `backend/src/config/database.js` — helper `query`, `queryOne`, `queryAll`.

Folder `models/` dipertahankan **hanya** sebagai penanda arsitektur (residu pola
lama). Jangan menambahkan definisi model/ORM di sini; tambahkan repository baru di
`backend/src/repositories/` mengikuti `base.repository.js`.
