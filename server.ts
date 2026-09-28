import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { importPoHandler } from './src/server/importPo';
import { categoryAiHandler } from './src/server/categoryAi';
import { 
  lineWebhookHandler, 
  lineNotifyOrderEndpoint, 
  lineSendTestEndpoint, 
  lineGetRecentUsersEndpoint 
} from './src/server/line';
import { adminAuth, getDb, isAdminConfigured } from './src/server/firestore-admin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Increase payload limit for CSV uploads
  // rawBody dipakai untuk verifikasi signature webhook LINE.
  app.use(express.json({ limit: '50mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Setiap /api/* (kecuali webhook LINE yang diverifikasi lewat signature) wajib
  // membawa Firebase ID token milik anggota aktif di Manajemen User
  // (/authorizedUsers). Dulu semua endpoint terbuka untuk siapa saja.
  const requireErpUser: express.RequestHandler = async (req, res, next) => {
    if (!isAdminConfigured()) {
      return res.status(503).json({ error: 'Server belum dikonfigurasi (GOOGLE_APPLICATION_CREDENTIALS).' });
    }
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    try {
      const decoded = await adminAuth().verifyIdToken(match[1], true);
      const email = (decoded.email || '').toLowerCase();
      if (!email || !decoded.email_verified) return res.status(403).json({ error: 'Email belum terverifikasi.' });
      const snap = await getDb().doc(`authorizedUsers/${email}`).get();
      const data = snap.data();
      if (!snap.exists || !data || data.status === 'nonaktif' || !['owner', 'staff'].includes(data.role)) {
        return res.status(403).json({ error: 'Akun tidak memiliki akses ERP.' });
      }
      (req as any).erpUser = { uid: decoded.uid, email, role: data.role, permissions: data.permissions || {} };
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Sesi login tidak valid, silakan login ulang.' });
    }
  };
  const requireOwner: express.RequestHandler = (req, res, next) =>
    (req as any).erpUser?.role === 'owner' ? next() : res.status(403).json({ error: 'Khusus owner.' });

  // LINE Messaging API Webhook Route (handles POST, GET, OPTIONS, HEAD with/without trailing slash)
  app.use('/api/line/webhook', lineWebhookHandler);

  app.use('/api', requireErpUser);
  app.post('/api/import-po', importPoHandler);
  app.post('/api/category-ai', categoryAiHandler);
  app.post('/api/line/notify-order', lineNotifyOrderEndpoint);
  app.post('/api/line/send-test', requireOwner, lineSendTestEndpoint);
  app.get('/api/line/recent-users', requireOwner, lineGetRecentUsersEndpoint);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      configFile: false,
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: [
          { find: /^@\/(.*)/, replacement: path.resolve(process.cwd(), './src/$1') }
        ],
      },
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
