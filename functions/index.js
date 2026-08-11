const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const META_CAPI_ACCESS_TOKEN = defineSecret("META_CAPI_ACCESS_TOKEN");

exports.sendMetaPurchaseEvent = onDocumentCreated(
  {
    document: "salesOrders/{orderId}",
    database: "ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7",
    secrets: [META_CAPI_ACCESS_TOKEN]
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.info("No data associated with the event.");
      return;
    }

    const orderData = snap.data();
    const orderId = event.params.orderId;

    // 1. ERROR HANDLING & IDEMPOTENCY: Cek apakah sudah pernah dikirim
    if (orderData.sudahDikirimKeMeta === true) {
      logger.info(`Skipped - order [${orderId}] sudah dikirim ke Meta sebelumnya.`);
      return;
    }

    // 2. FILTER LOGIC: Hanya proses untuk Meta Ads
    const rawOrderType = orderData.orderType || "";
    if (rawOrderType.trim() !== "Meta Ads") {
      logger.info(`Skipped - bukan Meta Ads. OrderType: "${rawOrderType}"`);
      return;
    }

    // 3. NORMALISASI NOMOR TELEPON
    let phHash = null;
    let rawPhone = orderData.phoneNumber || "";
    // Hapus semua karakter non-digit
    let cleanPhone = rawPhone.replace(/\D/g, "");
    
    if (cleanPhone) {
      // Kalau diawali "09" dan panjang 10 digit, ubah ke format E.164 Taiwan
      if (cleanPhone.startsWith("09") && cleanPhone.length === 10) {
        cleanPhone = "886" + cleanPhone.substring(1);
        
        // HASHING dengan SHA-256
        phHash = crypto.createHash("sha256").update(cleanPhone).digest("hex");
      } else {
        logger.warn(`Nomor telepon tidak standar untuk di-hash: ${rawPhone}`);
        // Tetap lanjutkan proses tanpa field ph
      }
    }

    // 4. KONVERSI NILAI
    const totalPriceCents = orderData.totalPrice || 0;
    const valueTWD = totalPriceCents / 100;

    // 5. ORDER ID
    const metaOrderId = orderData.orderNumber || orderData.orderCode || orderId;

    // 6. EVENT TIME
    // Cari orderDate atau createdAt. Firestore Timestamp punya properti _seconds atau method toDate()
    let eventTimeSeconds = Math.floor(Date.now() / 1000); // fallback
    const rawDate = orderData.orderDate || orderData.createdAt;
    
    if (rawDate) {
      if (typeof rawDate.toDate === 'function') {
        eventTimeSeconds = Math.floor(rawDate.toDate().getTime() / 1000);
      } else if (rawDate._seconds) {
        eventTimeSeconds = rawDate._seconds;
      } else if (rawDate.seconds) {
        eventTimeSeconds = rawDate.seconds;
      }
    }

    // 7. SUSUN PAYLOAD
    const userData = {};
    if (phHash) {
      userData.ph = [phHash];
    }

    // Generate unique event_id untuk deduplication
    const eventId = `purchase_${metaOrderId}_${Date.now()}`;

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: eventTimeSeconds,
          event_id: eventId,
          action_source: "website",
          event_source_url: "https://kangenbukuindo.com",
          user_data: userData,
          custom_data: {
            currency: "TWD",
            value: valueTWD,
            order_id: metaOrderId
          }
        }
      ]
    };

    // 8. KIRIM via HTTPS POST
    const pixelId = "685632207744047";
    const accessToken = META_CAPI_ACCESS_TOKEN.value();
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        logger.error(`Gagal kirim ke Meta untuk order [${orderId}]:`, {
          status: response.status,
          statusText: response.statusText,
          result: JSON.stringify(result)
        });
        return; // Jangan throw error supaya tidak retry berulang
      }

      logger.info(`Berhasil kirim Purchase untuk order [${orderId}]`, result);

      // 9. UPDATE DOKUMEN (Idempotency)
      await snap.ref.update({
        sudahDikirimKeMeta: true,
        dikirimKeMetaAt: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      logger.error(`Error saat proses kirim ke Meta untuk order [${orderId}]:`, error);
    }
  }
);
