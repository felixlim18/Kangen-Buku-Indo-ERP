#!/usr/bin/env bash
# Simpan Channel Secret & Channel Access Token LINE OA "Kangenbukuindo CS" (bot AI balas chat).
# Terpisah dari bot ERP (LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN).
# Disimpan ke Firebase Secret Manager (production) dan .env (server lokal).
# Input tidak tampil di layar dan tidak masuk history shell.
# Pakai: npm run line-cs:setup
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "Channel secret (Kangenbukuindo CS): " SECRET; echo
read -rsp "Channel access token (Kangenbukuindo CS): " TOKEN; echo
[ -n "$SECRET" ] && [ -n "$TOKEN" ] || { echo "❌ Secret dan token wajib diisi."; exit 1; }

printf %s "$SECRET" | firebase functions:secrets:set LINE_CS_CHANNEL_SECRET --data-file=-
printf %s "$TOKEN" | firebase functions:secrets:set LINE_CS_CHANNEL_ACCESS_TOKEN --data-file=-

# .env: ganti baris lama kalau ada, lalu tambahkan nilai baru.
touch .env
grep -vE '^LINE_CS_CHANNEL_(SECRET|ACCESS_TOKEN)=' .env > .env.tmp || true
printf 'LINE_CS_CHANNEL_SECRET="%s"\nLINE_CS_CHANNEL_ACCESS_TOKEN="%s"\n' "$SECRET" "$TOKEN" >> .env.tmp
mv .env.tmp .env

# Cek token ke LINE: tampilkan nama bot kalau valid.
curl -s -H "Authorization: Bearer $TOKEN" https://api.line.me/v2/bot/info | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s||"{}");
  console.log(j.displayName?`✅ Token valid: ${j.displayName} (${j.basicId})`:`⚠️ Token ditolak LINE: ${s}`);});'
