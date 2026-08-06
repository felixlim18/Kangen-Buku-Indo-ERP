import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export async function categoryAiHandler(req: Request, res: Response) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY belum dikonfigurasi di server.' 
      });
    }

    const { message, categories, bookInfo } = req.body;

    if (!message && !bookInfo) {
      return res.status(400).json({ error: 'Pesan atau informasi buku diperlukan.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const categoryListStr = Array.isArray(categories) && categories.length > 0 
      ? categories.join(', ')
      : 'Belum ada kategori yang terdaftar.';

    const systemInstruction = `Anda adalah Asisten AI Spesialis Kategori Buku untuk toko e-commerce "KangenBukuIndo".
Tugas utama Anda:
1. Membantu pengguna menentukan kategori buku yang paling tepat berdasarkan judul, sinopsis, atau deskripsi buku.
2. Memberikan saran penambahan kategori baru jika buku tidak cocok dengan kategori yang ada saat ini.
3. Menjawab pertanyaan teknis/klasifikasi seputar genre dan pengelompokan buku.

Daftar Kategori Buku yang Tersedia Saat Ini di Sistem:
[ ${categoryListStr} ]

Aturan Respon:
- Berikan rekomendasi kategori yang paling relevan dari daftar di atas.
- Jika ada kategori yang mendekati, sebutkan alasannya dengan ringkas dan sopan.
- Format jawaban dengan rapi menggunakan Markdown (bullet points, bolding).
- Jawab dalam Bahasa Indonesia yang ramah dan profesional.`;

    let userPrompt = message || '';
    if (bookInfo) {
      userPrompt += `\n\nInformasi Buku yang ingin diklasifikasikan:\n- Judul: ${bookInfo.title || '-'}\n- Penulis: ${bookInfo.author || '-'}\n- Deskripsi/Sinopsis: ${bookInfo.description || '-'}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return res.json({ response: response.text });
  } catch (err: any) {
    console.error('Error in categoryAiHandler:', err);
    return res.status(500).json({ 
      error: err.message || 'Gagal memproses permintaan AI Assistant Kategori.' 
    });
  }
}
