---
name: claude-code-integration
description: Panduan dan petunjuk integrasi serta penggunaan Claude Code CLI / GitHub Action dalam workflow pengembangan project ini. Gunakan skill ini saat pengguna bertanya tentang Claude Code, integrasi GitHub Action Claude Code, atau eksekusi tugas coding via CLI Claude Code.
---

# Claude Code Integration Skill

Skill ini memberikan panduan mengenai penggunaan dan integrasi **Claude Code** (alat agentic coding dari Anthropic) ke dalam workflow proyek ini.

## Apa itu Claude Code?
Claude Code adalah alat AI agentic coding dari Anthropic yang bekerja langsung di terminal atau GitHub repository untuk membantu tugas-tugas software engineering seperti:
- Memahami struktur codebase.
- Menjalankan refactoring dan bug fixing.
- Mengelola Git workflow dan Pull Request (PR) review.

---

## 1. Instalasi & Setup Claude Code CLI

### Cara Instalasi (macOS / Linux)
Sesuai rekomendasi Anthropic, instalasi menggunakan package manager atau curl installer:

```bash
# Menggunakan Homebrew (Direkomendasikan)
brew install anthropic-ai/cli/claude-code

# Atau via cURL script
curl -fsSL https://claude.ai/install.sh | sh
```

### Autentikasi
Setelah terinstal, jalankan perintah berikut di terminal untuk login ke akun Anthropic/Claude:

```bash
claude login
```

---

## 2. Penggunaan CLI Dasar dalam Proyek

Jalankan perintah `claude` dari root direktori proyek ini (`Kangen-Buku-Indo-ERP`):

```bash
# Menjalankan sesi interaktif Claude Code
claude

# Menjalankan instruksi spesifik satu kali (non-interaktif)
claude -p "Perbaiki type error di src/components/BusinessPartnerTab.tsx"
```

---

## 3. Integrasi GitHub Actions (Claude Code Action)

Jika Anda ingin Claude merespons komentar di Issue atau Pull Request GitHub (misal merespons panggillan `@claude`):

1. Tambahkan **`ANTHROPIC_API_KEY`** ke GitHub Repository Secrets (`Settings > Secrets and variables > Actions`).
2. Buat file `.github/workflows/claude.yml` di proyek ini:

```yaml
name: Claude Code Agent

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  claude-code:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropic/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## 4. Best Practices Penggunaan bersama Antigravity Agent
- **Gunakan Antigravity IDE Agent** untuk penulisan kode real-time, UI preview, dan refactoring langsung di editor.
- **Gunakan Claude Code CLI / GitHub Action** untuk otomasi CI/CD, PR review otomatis di GitHub, atau eksekusi batch task via terminal terpisah.
