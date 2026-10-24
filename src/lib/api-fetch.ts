import { auth, USE_EMULATOR } from './firebase';

// fetch ke /api/* dengan Firebase ID token user yang sedang login. Server menolak
// request tanpa token (lihat requireErpUser di server.ts).
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // Mode emulator: jangan memanggil server sungguhan (LINE, AI, import) dari data uji.
  if (USE_EMULATOR) {
    console.warn('[emulator] apiFetch diblokir:', input);
    return new Response(JSON.stringify({ ok: true, emulator: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
