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

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Increase payload limit for CSV uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.post('/api/import-po', (req, res) => { console.log('Called handler'); importPoHandler(req, res); });
  app.post('/api/category-ai', categoryAiHandler);

  // LINE Messaging API Webhook Route (handles POST, GET, OPTIONS, HEAD with/without trailing slash)
  app.use('/api/line/webhook', lineWebhookHandler);
  app.post('/api/line/notify-order', lineNotifyOrderEndpoint);
  app.post('/api/line/send-test', lineSendTestEndpoint);
  app.get('/api/line/recent-users', lineGetRecentUsersEndpoint);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
