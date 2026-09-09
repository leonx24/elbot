# Security Fix Prompt for LeonX Bot

> Copy-paste isi di bawah ini ke Claude untuk memperbaiki semua masalah keamanan pada project ini.

---

## Konteks Project

Project: **LeonX Discord Bot** — Bot Discord untuk distribusi script Roblox dengan sistem license key, HWID binding, ticket support, dan AI chatbot.

**Stack:** Node.js (TypeScript ESM), discord.js v14, better-sqlite3, HTTP server bawaan Node (tidak pakai Express).

**Struktur file penting:**
- `src/index.ts` — Main entry, HTTP server, semua command handling
- `src/security.ts` — Security engine (rate limit, IP ban, malicious pattern detection)
- `src/database.ts` — SQLite database layer
- `src/config.ts` — Environment variable validation (zod)
- `lua/loader.lua` & `lua/main.lua` — Script yang diserve ke Roblox client
- `.env` — Environment variables (DISCORD_TOKEN, CLIENT_ID, dll)

## Task

Perbaiki SEMUA masalah keamanan berikut tanpa merubah fungsionalitas bot yang ada. Jangan menghapus fitur, hanya memperkuat keamanannya.

---

## 1. CRITICAL — HTTPS & CORS

**File:** `src/index.ts`

**Problems:**
- Line ~4318: HTTP server menggunakan `http.createServer` (plaintext).
- Line ~4320: `Access-Control-Allow-Origin: *` (wildcard CORS).

**Fix:**
- Ganti CORS header ke allowlist domain: `https://script.leonthings.my.id` dan `https://leonthings.my.id`. Jangan pakai `*`.
- Tambahkan proper CORS preflight handling yang validasi Origin.
- Jika memungkinkan, support HTTPS via `PORT` environment atau reverse proxy (Nginx/Caddy/Cloudflare). Tambahkan komentar bahwa server production harus di belakang reverse proxy TLS.

Tambahkan security headers pada SEMUA response:

```ts
res.setHeader("X-Content-Type-Options", "nosniff");
res.setHeader("X-Frame-Options", "DENY");
res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
res.setHeader("Cache-Control", "no-store");
```

---

## 2. CRITICAL — Error Message Leak

**File:** `src/index.ts` (HTTP handler)

**Problem:** Error messages expose internal details (stack trace, error.message) ke client:
- Line ~4351: `error.message` di `/loader.lua`
- Line ~4373: `error.message` di `/load.php`
- Line ~4443: `error.message` di `/load.php` catch block
- Line ~4487: `error.message` di `/api/validate-key`
- Line ~4562: `error.message` di `/api/my-key`
- Line ~4300+: cek juga endpoint lain yang expose `error.message`

**Fix:**
- Semua response error harus generic: `"Internal server error"` atau `warn("Internal server error occured")`.
- Log detail error ke console/server-side hanya (sudah ada `console.error`, tambahkan jika kurang).
- Jangan pernah kirim `error.message` atau stack trace ke client.

---

## 3. HIGH — IP Spoofing via Header

**File:** `src/security.ts` line 37-60 (`getClientIp`)

**Problem:** `x-forwarded-for` dan `x-real-ip` bisa di-spoof tanpa reverse proxy.

**Fix:**
- Hanya trust `cf-connecting-ip` jika env `APP_ENV=production` atau ada flag `TRUST_PROXY=true`.
- Untuk environemnt lain, gunakan `req.socket.remoteAddress`.
- Tambahkan konfigurasi di `src/config.ts`: `TRUST_PROXY: z.string().optional()`.

Contoh logic:
```ts
export function getClientIp(req: IncomingMessage): string {
  if (config.TRUST_PROXY === "true") {
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      const parts = forwarded.split(",");
      if (parts[0]) return parts[0].trim();
    }
  }
  const remoteAddress = req.socket?.remoteAddress;
  if (remoteAddress) return remoteAddress.replace(/^.*:/, "") || "127.0.0.1";
  return "Unknown IP";
}
```

---

## 4. HIGH — Rate Limit & Failure Tracking Bukan Persistent

**File:** `src/security.ts`

**Problem:**
- `rateLimitMap` dan `failedKeyMap` (line 17-18) in-memory, hilang saat restart.
- Attacker bisa bypass dengan restart server, atau dengan flood dari banyak request sebelum rate limit tercapai.

**Fix:**
- Pindahkan state rate limiting & failed key tracking ke SQLite (tables baru: `rate_limits`, `failed_key_attempts`).
- Rate limit: 40 request / 10 detik per IP (persistent).
- Failed key: reset counter setelah 2 menit tanpa aktivitas.
- Jangan lupa periodic cleanup: hapus row database yang sudah expired (setiap 30 menit via `setInterval`).

Tambahkan index pada kolom yang sering di-query.

---

## 5. HIGH — Key Brute-Force Protection

**File:** `src/security.ts` (recordFailedKeyAttempt) dan `src/index.ts` (HTTP handler)

**Problem:** Attacker bisa brute-force key dari banyak IP berbeda, rate limit per-IP tidak cukup.

**Fix:**
- Tambahkan global rate limiting per key: jika key yang sama gagal validasi lebih dari 5 kali dalam 10 menit, BLOCK key tersebut untuk 30 menit (temporary lock) dalam tabel `key_locks`.
- Jika key terlock, semua request dengan key tersebut langsung return 429/403 tanpa melakukan validasi DB.
- Log lock event ke channel security log.

---

## 6. HIGH — Input Validation untuk HTTP Endpoint

**File:** `src/index.ts` (HTTP handler)

**Problem:** Parameter `/load.php` dan `/api/validate-key` tidak divalidasi:
- `roblox_id`, `hwid`, `username`, `executor`, `place_id` diterima apa adanya.

**Fix:**
- Validasi format:
  - `roblox_id`: hanya digit, max 20 karakter.
  - `hwid`: alphanumeric + dashes/underscores, max 64 karakter.
  - `executor`: alphanumeric + spasi, max 50 karakter.
  - `place_id`: hanya digit, max 20 karakter.
  - `username`: alphanumeric + underscore, max 30 karakter.
- Jika tidak valid, jangan taki input tsb, gunakan "Unknown" sebagai default.
- Tambahkan helper function `sanitizeString(input, maxLength, allowedChars)`.

---

## 7. MEDIUM — HWID Trust Issue

**File:** `src/database.ts` (`validateUserKey`) & `src/index.ts`

**Problem:** `hwid` dan `roblox_id` dikirim dari client Lua (executor). Attacker bisa submit HWID orang lain untuk mencoba me-bind key korban.

**Fix:**
- Jangan auto-bind HWID saat pertama kali. Simpan binding hanya jika user sudah terverifikasi via Discord member (cek `result.discordId` ada di guild).
- Tambahkan pengecekan: jika `roblox_id` atau `hwid` sudah terpakai oleh discord_id lain, return error `"Key/device sudah terdaftar"`.
- Alternatif: tambahkan field `verified_at` pada `user_keys`, dan hanya bind HWID jika keynya sudah ada.

Praktisnya:
- Cek `hwid` jika ada: jika `row.hwid && row.hwid !== hwid` → reject (sudah ada).
- Jika hwid belum bound, cek apakah hwid tersebut sudah dipakai discord_id lain di tabel (SELECT 1 FROM user_keys WHERE hwid = ? AND discord_id != ...). Jika sudah → reject.

---

## 8. HIGH — OAuth Token Handling untuk /api/my-key & /api/reset-my-hwid

**File:** `src/index.ts` (HTTP handler, line ~4490-4600)

**Problem:**
- Token diterima via query param `?token=` atau `Authorization: Bearer`.
- Tidak ada validasi token expiry / scope.
- Tidak ada rate limiting khusus.

**Fix:**
- Jangan terima token via query param (gampang ke-log). Hanya terima via `Authorization: Bearer` header.
- Validasi response `expires_in` dari Discord, dan reject jika token sudah masuk masa refresh.
- Check OAuth2 scope: token harus punya scope `identify`.
- Tambahkan rate limit khusus: 10 request / menit / IP untuk endpoint ini.
- Tambahkan rate limit berbasis user: 1x resethwid / 10 menit / discord_id (jangan hanya andalkan cooldown di DB).

---

## 9. MEDIUM — Memory Cleanup (Memory Leak)

**File:** `src/index.ts` & `src/security.ts`

**Problem:** Maps berikut tidak pernah di-cleanup, membesar tanpa batas:
- `cooldowns` (src/index.ts line 103)
- `ticketDeleteTimers` (line 104)
- `userSpamCache` (line 3272)
- `rateLimitMap` (src/security.ts line 17)
- `failedKeyMap` (line 18)

**Fix:**
- Tambahkan fungsi `setInterval` cleanup setiap 30 menit yang:
  - Hapus entry `cooldowns` yang expired (> 10 menit lalu).
  - Hapus entry `userSpamCache` yang tidak aktif > 1 menit.
  - Hapus entry `rateLimitMap` yang sudah melewati `resetAt`.
  - Hapus entry `failedKeyMap` yang `lastAttempt` > 2 menit.
- Atau pindahkan ke SQLite (jika langkah #4 sudah pakai SQLite, cukup cleanup satu sumber).

---

## 10. LOW — Hardcoded Channel ID / Role ID

**File:** `src/index.ts`

**Problem:** Beberapa channel ID di-hardcode:
- Line ~110: `OWNER_ROLE_ID` fallback `"1515320851656872066"`
- Line ~722: `TICKET_CHANNEL_ID` fallback `"1519681008834842724"`
- Line ~797: `monitoredChannelId = "1519980835116286053"`
- Line ~1930: `ticketChannelId` fallback `"1519681008834842724"`
- Line ~2618: `channelId = "1515261709147705537"`
- Line ~4405: `logChannelId = "1521734378877616289"`

**Fix:**
- Pindahkan semua ke environment variables di `src/config.ts` (zod schema).
- Di `.env`, tambahkan keys baru. Jangan isi value yang hardcode tadi — biarkan kosong, dan handler harus handle jika kosong (fallback ke logic tanpa channel target / skip).

---

## 11. MEDIUM — Whitelist Role Check (Bukan Name Matching)

**File:** `src/index.ts` line 107-118 (`isUserOwnerOrAdmin`)

**Problem:** Role name matching (`.includes("owner")`, `"admin"`, `"staff"`) bisa di-exploit: siapa pun yang punya role bernama "admin" mendapat akses owner.

**Fix:**
- Hapus semua name-based role checks.
- Gunakan whitelist: `config.OWNER_ID` + `config.OWNER_ROLE_ID` + `PermissionFlagsBits.Administrator` + `PermissionFlagsBits.ManageGuild`.
- Jika `OWNER_ROLE_ID` kosong, hanya `OWNER_ID` yang punya akses.

---

## 12. LOW — Debug Logging Berlebihan

**File:** `src/index.ts` line ~3515

**Problem:** Log semua pesan user ke console: `[DEBUG] Message received from...` — privacy concern & log bombing.

**Fix:**
- Hapus log debug ini, atau bungkus dengan env flag `DEBUG` (default off).
- Tambahkan `DEBUG: z.string().optional()` di config.

---

## 13. MEDIUM — Loader.lua Path Traversal Protection

**File:** `src/index.ts` (HTTP handler)

**Problem:** `/loader.lua` membaca path absolut; meskipun hardcoded, perlu dipastikan tidak ada path traversal.

**Fix:**
- Gunakan `path.resolve` + validasi bahwa path result ada di dalam `process.cwd()/lua/`.
- Ikuti best practice: resolved path harus mulai dengan `luaDir` yang sudah di-resolve.

---

## 14. Security — Tambahkan Rate Limit Body & Total Request Size

**File:** `src/index.ts` (HTTP handler)

**Problem:** Tidak ada batas request body / total request size.

**Fix:**
- Tambahkan helper untuk membaca body dengan limit. Contoh: `collectBody(req, maxBytes = 100_000)`, abort jika melebihi.
- Untuk endpoint GET tidak perlu body. Endpoint POST (`/api/reset-my-hwid`) body harus dibatasi.

---

## 15. Update .env.example

**File:** buat file baru `.env.example` (jika belum ada)

**Isi:**
```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
OWNER_ID=
VERIFY_CHANNEL_ID=
VERIFIED_ROLE_ID=
PREMIUM_ROLE_ID=
OWNER_ROLE_ID=
TICKET_CATEGORY_ID=
SUPPORT_ROLE_ID=
BUG_REPORT_CHANNEL_ID=
CHANGELOG_CHANNEL_ID=
LOG_CHANNEL_ID=
STATUS_VOICE_CHANNEL_ID=
TICKET_CHANNEL_ID=
TICKET_REVIEW_CHANNEL_ID=
GROQ_API_KEY=
AI_CHANNEL_ID=
SECURITY_LOG_CHANNEL_ID=
# Security
TRUST_PROXY=false
DEBUG=false
# Optional: channel IDs untuk log yang sebelumnya hardcoded
EXECUTION_LOG_CHANNEL_ID=
MONITORED_UPDATE_CHANNEL_ID=
RULES_CHANNEL_ID=
```

---

## Instruksi Eksekusi

1. **Jangan hapus fitur apa pun.** Semua fix harus backward-compatible.
2. **Ikuti code style yang ada** — TypeScript ESM, `import` with `.js` suffix, 2-space indent.
3. **Jangan tambahkan dependencies baru** kecuali benar-benar diperlukan (usahakan zero new dependency).
4. Jika ada migration database baru, handle dengan pola yang sama seperti yang sudah ada (`PRAGMA table_info` + `ALTER TABLE`).
5. Setelah selesai, **jalankan `npm run check`** (tsc --noEmit) dan perbaiki semua error TypeScript sampai lulus.
6. Berikan ringkasan semua perubahan yang kamu buat, dengan format:
   - File yang diubah
   - Perubahan spesifik per file
   - Status pengujian

## Catatan Tambahan

- `.env` saat ini mengandung **Discord bot token asli yang sudah terekspos**. Jangan edit `.env`, tapi buat `.env.example`. Token harus di-rotate oleh user (instruksi ke user di akhir: "rotate token di Discord Developer Portal").
- Semua command Discord (slash commands) TIDAK boleh diubah signature-nya.
- Periksa `dist/` — setelah kompilasi, pastikan hasilnya sama-sama aman.