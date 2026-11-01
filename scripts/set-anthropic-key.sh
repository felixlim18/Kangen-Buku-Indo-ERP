#!/usr/bin/env bash
# Simpan API key Claude (Anthropic) untuk agent AI CS (src/server/csAgent.ts).
# Disimpan ke Firebase Secret Manager (production) dan .env (server lokal).
# Input tidak tampil di layar dan tidak masuk history shell.
# Pakai: npm run anthropic:setup
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "Anthropic API key (sk-ant-...): " KEY; echo
[ -n "$KEY" ] || { echo "❌ API key wajib diisi."; exit 1; }

# Cek key ke Anthropic dulu, supaya key yang salah tidak sempat tersimpan.
CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.anthropic.com/v1/models/claude-sonnet-5-5 \
  -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01")
[ "$CODE" = "200" ] || { echo "❌ Key ditolak Anthropic (HTTP $CODE). Tidak ada yang disimpan."; exit 1; }
echo "✅ Key valid, Claude Sonnet 5.5 bisa dipakai."

printf %s "$KEY" | firebase functions:secrets:set ANTHROPIC_API_KEY --data-file=-

touch .env
grep -vE '^ANTHROPIC_API_KEY=' .env > .env.tmp || true
printf 'ANTHROPIC_API_KEY="%s"\n' "$KEY" >> .env.tmp
mv .env.tmp .env
echo "✅ Tersimpan di Firebase Secret & .env."
