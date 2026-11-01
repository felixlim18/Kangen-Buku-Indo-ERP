#!/bin/sh
# Predeploy functions (firebase.json): bundle src/server/line.ts ke functions/lineWebhook.js.
# Lewat skrip ini, bukan perintah esbuild langsung (tanda '=' di predeploy membuat Firebase CLI
# tidak menjalankannya) atau npm run (npm gagal membaca stdin di dalam firebase deploy).
cd "$(dirname "$0")/.." && exec ./node_modules/.bin/esbuild src/server/line.ts --bundle --platform=node --target=node22 --format=cjs --external:firebase-admin --external:@google/genai --outfile=functions/lineWebhook.js
