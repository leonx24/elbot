# LeonX Discord Bot

Bot Discord berbasis TypeScript untuk verifikasi, pengiriman script, status,
changelog, ticket, bug report, FAQ, moderasi, dan statistik admin.

## Menjalankan

1. Salin `.env.example` menjadi `.env`.
2. Isi `DISCORD_TOKEN` dan ID role/channel yang diperlukan.
3. Jalankan `npm install`.
4. Daftarkan slash command dengan `npm run deploy`.
5. Jalankan bot dengan `npm run dev`.

Aktifkan **Server Members Intent** pada Discord Developer Portal agar fitur
verifikasi dan moderasi dapat mengakses member.

Jangan commit atau membagikan file `.env`.
