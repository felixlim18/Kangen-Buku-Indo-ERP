#!/bin/zsh
# Nyalakan Firebase Emulator (Firestore/Auth/Storage) dengan Java lokal di ~/.local/jdk dan memori 3 GB (edisi standard: Mac 8 GB tidak cukup untuk edisi enterprise).
# Data uji tidak disimpan: mematikan emulator = semua transaksi uji hilang.
JH=$(ls -d ~/.local/jdk/jdk-21*/Contents/Home | head -1)
export JAVA_HOME=$JH PATH="$JH/bin:$PATH" JAVA_TOOL_OPTIONS="-Xmx3g"
cd "$(dirname "$0")/../.." && exec firebase emulators:start --config firebase.emulator.json --only firestore,auth,storage --project gen-lang-client-0501656267
