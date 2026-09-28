import { auth } from './firebase';

// fetch ke /api/* dengan Firebase ID token user yang sedang login. Server menolak
// request tanpa token (lihat requireErpUser di server.ts).
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
