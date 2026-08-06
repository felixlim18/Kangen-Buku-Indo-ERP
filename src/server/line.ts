import crypto from 'crypto';
import { Request, Response } from 'express';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Firebase setup for Node server
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = null;
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.warn('Failed reading firebase-applet-config.json');
  }
}

let db: any = null;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig || {}) : getApps()[0];
  db = getFirestore(app, firebaseConfig?.firestoreDatabaseId);
} catch (e) {
  console.warn('Firestore initialization skipped in server/line.ts:', e);
}

export interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
  ownerUserId: string;
  resellerUserId: string;
  notifyOwnerNewOrder: boolean;
  notifyResellerNewOrder: boolean;
  enabled: boolean;
}

// Helper to send push message to LINE
export async function sendLinePushMessage(
  channelAccessToken: string,
  toUserId: string,
  messages: Array<{ type: string; text?: string; [key: string]: any }>
) {
  if (!channelAccessToken || !toUserId) {
    throw new Error('Channel Access Token dan LINE User ID tujuan harus diisi.');
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken.trim()}`
    },
    body: JSON.stringify({
      to: toUserId.trim(),
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal mengirim pesan LINE (${response.status}): ${errorText}`);
  }

  return await response.json().catch(() => ({ success: true }));
}

// Helper to send reply message to LINE
export async function sendLineReplyMessage(
  channelAccessToken: string,
  replyToken: string,
  messages: Array<{ type: string; text: string }>
) {
  if (!channelAccessToken || !replyToken) return;

  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken.trim()}`
      },
      body: JSON.stringify({
        replyToken,
        messages
      })
    });
  } catch (err) {
    console.error('Error replying to LINE webhook:', err);
  }
}

// In-memory cache for recent LINE detected user IDs from Webhook
export const recentLineUsers: Array<{
  userId: string;
  timestamp: string;
  eventType: string;
  messageText?: string;
}> = [];

// Webhook Handler for LINE Messaging API
export async function lineWebhookHandler(req: Request, res: Response) {
  // Always return 200 OK for GET, HEAD, or OPTIONS verification requests
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return res.status(200).send('LINE Webhook Endpoint Ready');
  }

  try {
    const signature = req.headers['x-line-signature'] as string;
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

    // Validate signature if secret is available
    if (channelSecret && signature) {
      const hmac = crypto.createHmac('sha256', channelSecret).update(bodyStr).digest('base64');
      if (hmac !== signature) {
        console.warn('LINE Webhook Signature mismatch');
      }
    }

    const events = req.body?.events || [];
    let accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || (req.query?.token as string) || '';

    // If access token is not in env or query, fetch from Firestore settings/line
    if (!accessToken && db) {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'line'));
        if (settingsSnap.exists()) {
          accessToken = settingsSnap.data()?.channelAccessToken || '';
        }
      } catch (e) {
        console.warn('Could not fetch line settings from Firestore:', e);
      }
    }

    for (const event of events) {
      const userId = event.source?.userId;
      if (userId) {
        const messageText = event.message?.text || '';
        const nowIso = new Date().toISOString();

        // Save to in-memory array
        const existingIdx = recentLineUsers.findIndex(u => u.userId === userId);
        if (existingIdx >= 0) {
          recentLineUsers.splice(existingIdx, 1);
        }
        recentLineUsers.unshift({
          userId,
          timestamp: nowIso,
          eventType: event.type,
          messageText
        });
        if (recentLineUsers.length > 20) recentLineUsers.pop();

        // Persist to Firestore lineUsers collection
        if (db) {
          try {
            await setDoc(doc(db, 'lineUsers', userId), {
              userId,
              timestamp: nowIso,
              eventType: event.type,
              messageText: messageText || '',
              updatedAt: new Date()
            }, { merge: true });
          } catch (fsErr) {
            console.warn('Failed saving lineUser to Firestore:', fsErr);
          }
        }

        // Auto reply on follow or message
        if ((event.type === 'follow' || event.type === 'message') && event.replyToken && accessToken) {
          const autoReplyText = `📚 *KangenBukuIndo ERP Bot*\n\nHalo! Terima kasih telah terhubung.\n\n🆔 *ID LINE Anda:*\n\`${userId}\`\n\nSilakan salin ID LINE di atas dan tempel pada Pengaturan ERP KangenBukuIndo (Pengaturan -> Integrasi LINE) untuk mengaktifkan notifikasi orderan otomatis.`;
          await sendLineReplyMessage(accessToken, event.replyToken, [
            { type: 'text', text: autoReplyText }
          ]);
        }
      }
    }

    return res.status(200).json({ status: 'ok', processed: events.length });
  } catch (err: any) {
    console.error('Error in lineWebhookHandler:', err);
    // Always return 200 OK so LINE Developer console verification succeeds
    return res.status(200).json({ status: 'ok', warning: err.message });
  }
}

// Endpoint to send LINE order notification
export async function lineNotifyOrderEndpoint(req: Request, res: Response) {
  try {
    const {
      channelAccessToken,
      ownerUserId,
      resellerUserId,
      notifyOwnerNewOrder = true,
      notifyResellerNewOrder = true,
      orderData
    } = req.body;

    const token = channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return res.status(400).json({ error: 'LINE Channel Access Token belum dikonfigurasi.' });
    }

    if (!orderData) {
      return res.status(400).json({ error: 'Data orderan (orderData) tidak ditemukan.' });
    }

    const {
      orderCode = 'SO-000',
      customerName = 'Pelanggan',
      buyerType = 'Retail',
      partnerName = '',
      totalPrice = 0,
      items = [],
      platformChannel = 'Direct',
      paymentMethod = '-',
      status = 'draft'
    } = orderData;

    // Check if this order is for a Reseller
    const isResellerOrder = buyerType?.toLowerCase() === 'reseller' || 
                            buyerType?.toLowerCase().includes('reseller') || 
                            partnerName !== '';

    // Format item list
    const itemListStr = items.slice(0, 8).map((it: any) => {
      const name = it.bookTitle || it.title || it.name || 'Buku';
      const qty = it.quantity || it.qty || 1;
      const price = it.priceNTD || it.unitPrice || it.price || 0;
      return `• ${name} (${qty}x) @ NT$ ${price.toLocaleString('id-ID')}`;
    }).join('\n');

    const moreItems = items.length > 8 ? `\n...dan ${items.length - 8} buku lainnya` : '';

    const formattedDate = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const statusBadge = status === 'shipped' ? '🚚 Dikirim' : status === 'completed' ? '✅ Selesai' : '📝 Draft / Diproses';

    const messageText = 
`📦 *SALES ORDER BARU - KANGENBUKUINDO*
----------------------------------------
📌 *No. Order:* #${orderCode}
📅 *Waktu:* ${formattedDate}
👤 *Pembeli:* ${customerName} ${partnerName ? `(${partnerName})` : ''}
🏷️ *Kategori:* ${buyerType || 'Retail'}
🛒 *Channel:* ${platformChannel || 'Direct'}
💳 *Pembayaran:* ${paymentMethod || '-'}
📍 *Status:* ${statusBadge}
----------------------------------------
📚 *Daftar Pesanan:*
${itemListStr}${moreItems}
----------------------------------------
💰 *TOTAL:* NT$ ${totalPrice.toLocaleString('id-ID')}

_Sistem ERP KangenBukuIndo Taiwan_`;

    const sendResults: Array<{ recipient: string; userId: string; success: boolean; error?: string }> = [];

    // Send to Owner if enabled
    if (notifyOwnerNewOrder && ownerUserId) {
      try {
        await sendLinePushMessage(token, ownerUserId, [{ type: 'text', text: messageText }]);
        sendResults.push({ recipient: 'Owner', userId: ownerUserId, success: true });
      } catch (err: any) {
        console.error('Error sending LINE message to Owner:', err);
        sendResults.push({ recipient: 'Owner', userId: ownerUserId, success: false, error: err.message });
      }
    }

    // Send to Reseller if enabled and this is a Reseller order
    if (notifyResellerNewOrder && resellerUserId && isResellerOrder) {
      const resellerMessageText = 
`🛍️ *NOTIFIKASI PESANAN RESELLER BARU*
----------------------------------------
📌 *No. Order:* #${orderCode}
📅 *Waktu:* ${formattedDate}
👤 *Pelanggan:* ${customerName}
📍 *Status:* ${statusBadge}
----------------------------------------
📚 *Daftar Pesanan:*
${itemListStr}${moreItems}
----------------------------------------
💰 *TOTAL:* NT$ ${totalPrice.toLocaleString('id-ID')}

Terima kasih atas pesanan Anda! Pesanan sedang diproses oleh KangenBukuIndo.`;

      try {
        await sendLinePushMessage(token, resellerUserId, [{ type: 'text', text: resellerMessageText }]);
        sendResults.push({ recipient: 'Reseller', userId: resellerUserId, success: true });
      } catch (err: any) {
        console.error('Error sending LINE message to Reseller:', err);
        sendResults.push({ recipient: 'Reseller', userId: resellerUserId, success: false, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      messageText,
      sendResults
    });
  } catch (err: any) {
    console.error('Error in lineNotifyOrderEndpoint:', err);
    res.status(500).json({ error: err.message });
  }
}

// Endpoint to send a test message to a specific User ID
export async function lineSendTestEndpoint(req: Request, res: Response) {
  try {
    const { channelAccessToken, targetUserId, recipientName = 'User' } = req.body;

    const token = channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return res.status(400).json({ error: 'LINE Channel Access Token belum diisi.' });
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'LINE User ID tujuan tidak boleh kosong.' });
    }

    const testText = 
`🔔 *TES NOTIFIKASI LINE - KANGENBUKUINDO ERP*

Halo ${recipientName}! 
Koneksi LINE Messaging API ERP KangenBukuIndo telah BERHASIL terhubung.

Koneksi ini aktif dan siap menerima notifikasi otomatis saat Sales Order baru dicatat di sistem! 🎉

Waktu Tes: ${new Date().toLocaleString('id-ID')}`;

    await sendLinePushMessage(token, targetUserId, [{ type: 'text', text: testText }]);

    res.status(200).json({
      success: true,
      message: `Pesan tes berhasil dikirim ke ${recipientName} (${targetUserId})!`
    });
  } catch (err: any) {
    console.error('Error in lineSendTestEndpoint:', err);
    res.status(500).json({ error: err.message });
  }
}

// Endpoint to fetch recent webhook detected users
export async function lineGetRecentUsersEndpoint(_req: Request, res: Response) {
  try {
    const userMap = new Map<string, { userId: string; timestamp: string; eventType: string; messageText?: string }>();

    // Put memory users first
    recentLineUsers.forEach(u => userMap.set(u.userId, u));

    // Fetch from Firestore
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'lineUsers'));
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.userId && !userMap.has(d.userId)) {
            userMap.set(d.userId, {
              userId: d.userId,
              timestamp: d.timestamp || new Date().toISOString(),
              eventType: d.eventType || 'message',
              messageText: d.messageText || ''
            });
          }
        });
      } catch (e) {
        console.warn('Error reading lineUsers from Firestore:', e);
      }
    }

    const list = Array.from(userMap.values());
    res.status(200).json({ recentUsers: list });
  } catch (err: any) {
    res.status(200).json({ recentUsers: recentLineUsers });
  }
}
