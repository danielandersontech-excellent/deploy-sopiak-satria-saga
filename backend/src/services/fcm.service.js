/**
 * ============================================================
 * PUSH NOTIFICATION SERVICE - Expo Push + Firebase Admin
 * ============================================================
 *
 * FIX KRITIS: Service sebelumnya HANYA menggunakan Firebase Admin SDK,
 * tapi kolom expo_push_token di database berisi Expo Push Token
 * (format: "ExponentPushToken[xxx]"). Firebase Admin SDK TIDAK bisa
 * mengirim ke format ini → semua push notification GAGAL.
 *
 * SOLUSI: Service sekarang mendukung DUA jenis token:
 *
 *   1. Expo Push Token ("ExponentPushToken[xxx]")
 *      → Dikirim via Expo Push API (https://exp.host/--/api/v2/push/send)
 *      → Ini cara STANDAR untuk Expo apps
 *      → TIDAK butuh Firebase Admin SDK
 *
 *   2. Native FCM Token ("dGxxx:APA91bxxx...")
 *      → Dikirim via Firebase Admin SDK
 *      → Untuk production builds (non-Expo Go)
 *
 * Token type dideteksi otomatis berdasarkan format string.
 *
 * SETUP:
 *   - Expo Push: TIDAK perlu setup (gratis, built-in)
 *   - Firebase Admin: Opsional, hanya untuk native FCM tokens
 *     1. Download service account key dari Firebase Console
 *     2. Simpan sebagai: backend/firebase-service-account.json
 */

const path = require('path');
const { queryAll } = require('../config/database');
const { logger } = require('../utils/logger');

let admin = null;
let _initialized = false;
let _fcmAvailable = false;

// ===== TOKEN TYPE DETECTION =====
function isExpoPushToken(token) {
  return typeof token === 'string' && (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[')
  );
}

function isNativeFCMToken(token) {
  return typeof token === 'string' && !isExpoPushToken(token) && token.length > 20;
}

// ===== INITIALIZE FIREBASE ADMIN (for native FCM tokens) =====
// Three credential sources tried in order (first match wins):
//   1. JSON file at FIREBASE_SERVICE_ACCOUNT_PATH
//   2. Full JSON in env FIREBASE_SERVICE_ACCOUNT_JSON
//   3. Three split envs FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY +
//      FIREBASE_CLIENT_EMAIL  (recommended for Coolify)
function initFirebase() {
  if (_initialized) return _fcmAvailable;
  _initialized = true;

  try {
    admin = require('firebase-admin');
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      || path.join(__dirname, '../../firebase-service-account.json');
    let serviceAccount = null;

    try {
      const resolvedPath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath : path.resolve(serviceAccountPath);
      serviceAccount = JSON.parse(require('fs').readFileSync(resolvedPath, 'utf8'));
    } catch {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } catch (jsonErr) {
          logger.info(`[Push] ⚠️  FIREBASE_SERVICE_ACCOUNT_JSON invalid: ${jsonErr.message}`);
        }
      }
      if (!serviceAccount && process.env.FIREBASE_PROJECT_ID
          && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        serviceAccount = {
          project_id: process.env.FIREBASE_PROJECT_ID,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: privateKey,
        };
      }
      if (!serviceAccount) {
        logger.info('[Push] ⚠️  Firebase service account not found - native FCM disabled');
        logger.info('[Push]    Expo Push Token notifications still work!');
        _fcmAvailable = false;
        return false;
      }
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    _fcmAvailable = true;
    logger.info('[Push] ✅ Firebase Admin initialized - native FCM + Expo Push both ENABLED');
    return true;
  } catch (err) {
    logger.info(`[Push] ⚠️  Firebase Admin not available: ${err.message}`);
    logger.info('[Push]    Expo Push Token notifications still work!');
    _fcmAvailable = false;
    return false;
  }
}

// ===== SEND VIA EXPO PUSH API =====
async function sendViaExpo(expoPushToken, title, body, data = {}, channelId = 'default') {
  try {
    const message = {
      to: expoPushToken,
      sound: channelId === 'panic' ? 'default' : 'default',
      title: title,
      body: body,
      data: {
        ...data,
        channelId,
      },
      priority: channelId === 'panic' ? 'high' : 'default',
      channelId: channelId,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data) {
      const ticket = result.data;
      if (ticket.status === 'ok') {
        logger.info(`[Push] ✅ Expo sent: ${title}`);
        return { success: true, messageId: ticket.id };
      }
      if (ticket.status === 'error') {
        logger.error(`[Push] ❌ Expo error: ${ticket.message} (${ticket.details?.error})`);
        const shouldRemove = ticket.details?.error === 'DeviceNotRegistered';
        return { success: false, reason: ticket.message, shouldRemoveToken: shouldRemove };
      }
    }

    logger.info(`[Push] ✅ Expo sent (batch): ${title}`);
    return { success: true, messageId: 'expo-batch' };
  } catch (err) {
    logger.error(`[Push] ❌ Expo send failed: ${err.message}`);
    return { success: false, reason: err.message };
  }
}

// ===== SEND VIA EXPO PUSH API (BATCH) =====
async function sendViaExpoBatch(tokens, title, body, data = {}, channelId = 'default') {
  if (!tokens.length) return { success: true, sent: 0 };

  try {
    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: { ...data, channelId },
      priority: channelId === 'panic' ? 'high' : 'default',
      channelId: channelId,
    }));

    // Expo supports batches up to 100 messages
    let sent = 0;
    const invalidUserIds = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      const tickets = result.data || [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          sent++;
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          // Mark token for removal
          invalidUserIds.push(batch[idx]?.to);
        }
      });
    }

    return { success: true, sent, total: tokens.length, invalidTokens: invalidUserIds };
  } catch (err) {
    logger.error(`[Push] Expo batch error: ${err.message}`);
    return { success: false, reason: err.message };
  }
}

// ===== SEND VIA FIREBASE ADMIN SDK (native FCM tokens only) =====
async function sendViaFCM(fcmToken, title, body, data = {}, channelId = 'default') {
  if (!initFirebase() || !admin) {
    // Firebase not available → try Expo Push API as universal fallback
    logger.info(`[Push] Firebase not available, trying Expo Push API for FCM token`);
    return sendViaExpo(fcmToken, title, body, data, channelId);
  }

  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: {
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        channelId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: channelId === 'panic' ? 'high' : 'normal',
        notification: {
          channelId,
          priority: channelId === 'panic' ? 'max' : 'high',
          sound: 'default',
          defaultVibrateTimings: true,
          defaultLightSettings: true,
          visibility: 'public',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: channelId === 'panic' ? 'alarm.caf' : 'default',
            badge: 1,
            'content-available': 1,
            'mutable-content': 1,
            ...(channelId === 'panic' ? { 'interruption-level': 'critical' } : {}),
          },
        },
        headers: {
          'apns-priority': channelId === 'panic' ? '10' : '5',
        },
      },
    };

    const result = await admin.messaging().send(message);
    logger.info(`[Push] ✅ FCM sent: ${title}`);
    return { success: true, messageId: result };
  } catch (err) {
    logger.info(`[Push] ⚠️ FCM send failed: ${err.message}`);

    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      return { success: false, reason: 'invalid_token', shouldRemoveToken: true };
    }

    // ===== SENDER ID MISMATCH FALLBACK =====
    // Ini terjadi saat token FCM berasal dari Expo Go (project Firebase Expo, bukan milik kamu)
    // Solusi: kirim via Expo Push API sebagai fallback - Expo Push API bisa handle FCM token Expo Go
    if (err.code === 'messaging/mismatched-credential' || 
        (err.message && err.message.includes('SenderId mismatch'))) {
      logger.info(`[Push] ↩️ SenderId mismatch - token dari Expo Go. Fallback ke Expo Push API...`);
      return sendViaExpo(fcmToken, title, body, data, channelId);
    }

    return { success: false, reason: err.message };
  }
}

// ===== SMART SEND - Auto-detect token type =====
async function sendToDevice(pushToken, title, body, data = {}, channelId = 'default') {
  if (!pushToken) return { success: false, reason: 'No token' };

  if (isExpoPushToken(pushToken)) {
    return sendViaExpo(pushToken, title, body, data, channelId);
  }

  if (isNativeFCMToken(pushToken)) {
    return sendViaFCM(pushToken, title, body, data, channelId);
  }

  logger.info(`[Push] ⚠️  Unknown token format: ${pushToken.substring(0, 30)}...`);
  return { success: false, reason: 'Unknown token format' };
}

// ===== SEND TO USER BY ID =====
async function sendToUser(userId, title, body, data = {}, channelId = 'default') {
  try {
    const rows = await queryAll(
      'SELECT expo_push_token FROM users WHERE id = $1 AND expo_push_token IS NOT NULL',
      [userId]
    );
    if (!rows.length || !rows[0].expo_push_token) {
      logger.info(`[Push] No token for user ${userId}`);
      return { success: false, reason: 'no_token' };
    }

    return sendToDevice(rows[0].expo_push_token, title, body, data, channelId);
  } catch (err) {
    logger.error(`[Push] sendToUser error: ${err && err.message ? err.message : err}`, { stack: err && err.stack });
    return { success: false, reason: err.message };
  }
}

// ===== SEND TO USERS BY ROLE =====
async function sendToRole(roles, title, body, data = {}, channelId = 'default') {
  try {
    const roleArray = Array.isArray(roles) ? roles : [roles];
    const rows = await queryAll(
      `SELECT id, expo_push_token FROM users WHERE role = ANY($1) AND expo_push_token IS NOT NULL`,
      [roleArray]
    );

    if (!rows.length) {
      logger.info(`[Push] No tokens for roles: ${roleArray.join(', ')} (log-only: ${title} - ${body})`);
      return { success: true, sent: 0, total: 0 };
    }

    // Separate by token type for efficient batch sending
    const expoTokens = [];
    const fcmRows = [];

    for (const row of rows) {
      if (!row.expo_push_token) continue;
      if (isExpoPushToken(row.expo_push_token)) {
        expoTokens.push(row.expo_push_token);
      } else if (isNativeFCMToken(row.expo_push_token)) {
        fcmRows.push(row);
      }
    }

    let totalSent = 0;
    const invalidTokenUserIds = [];

    // Batch send Expo tokens (efficient - one HTTP call per 100 tokens)
    if (expoTokens.length > 0) {
      const expoResult = await sendViaExpoBatch(expoTokens, title, body, data, channelId);
      totalSent += expoResult.sent || 0;

      // Cleanup invalid Expo tokens
      if (expoResult.invalidTokens?.length) {
        for (const invalidToken of expoResult.invalidTokens) {
          const userRow = rows.find(r => r.expo_push_token === invalidToken);
          if (userRow) invalidTokenUserIds.push(userRow.id);
        }
      }
    }

    // Send FCM tokens one by one (Firebase Admin SDK doesn't batch well)
    for (const row of fcmRows) {
      const result = await sendViaFCM(row.expo_push_token, title, body, data, channelId);
      if (result.success) totalSent++;
      if (result.shouldRemoveToken) invalidTokenUserIds.push(row.id);
    }

    // Cleanup invalid tokens from database
    if (invalidTokenUserIds.length > 0) {
      for (const uid of invalidTokenUserIds) {
        await queryAll('UPDATE users SET expo_push_token = NULL WHERE id = $1', [uid]);
      }
      logger.info(`[Push] Cleaned ${invalidTokenUserIds.length} invalid tokens`);
    }

    const total = expoTokens.length + fcmRows.length;
    logger.info(`[Push] ✅ Sent to ${totalSent}/${total} devices (roles: ${roleArray.join(', ')}) [Expo: ${expoTokens.length}, FCM: ${fcmRows.length}]`);
    return { success: true, sent: totalSent, total };
  } catch (err) {
    logger.error(`[Push] sendToRole error: ${err && err.message ? err.message : err}`, { stack: err && err.stack });
    return { success: false, reason: err.message };
  }
}

// ===== SEND TO ALL USERS =====
async function sendToAll(title, body, data = {}, channelId = 'default') {
  return sendToRole(['anggota', 'komandan', 'supervisor', 'admin'], title, body, data, channelId);
}

// ===== CONVENIENCE METHODS =====

// Panic alert - critical priority, all komandan + supervisor
async function sendPanicAlert(userName, lokasi, latitude, longitude) {
  return sendToRole(
    ['komandan', 'supervisor'],
    '🚨 PANIC ALERT!',
    `${userName} mengaktifkan tombol darurat${lokasi ? ' di ' + lokasi : ''}! Segera kirim bantuan!`,
    { type: 'panic', latitude: String(latitude || 0), longitude: String(longitude || 0) },
    'panic'
  );
}

// Absensi notification - to komandan
async function sendAbsensiNotif(userName, tipe, posJaga, status) {
  const statusLabel = status === 'terlambat' ? ' (TERLAMBAT)' : '';
  return sendToRole(
    ['komandan'],
    `Absensi ${tipe === 'masuk' ? 'Masuk' : 'Keluar'}${statusLabel}`,
    `${userName} absensi ${tipe} di ${posJaga}`,
    { type: 'absensi' },
    'absensi'
  );
}

// Laporan notification - to komandan
async function sendLaporanNotif(userName, jenis, prioritas) {
  const isUrgent = prioritas === 'tinggi' || prioritas === 'kritis';
  return sendToRole(
    ['komandan', 'supervisor'],
    isUrgent ? `⚠️ Laporan ${jenis} (${prioritas.toUpperCase()})` : `Laporan Baru: ${jenis}`,
    `${userName} mengirim laporan ${jenis}`,
    { type: 'laporan' },
    isUrgent ? 'panic' : 'laporan'
  );
}

// Laporan validation result - to specific user
async function sendLaporanValidation(userId, isApproved, laporanType, catatan) {
  return sendToUser(
    userId,
    isApproved ? `✅ ${laporanType} Disetujui` : `⚠️ ${laporanType} Perlu Revisi`,
    isApproved
      ? `${laporanType} Anda telah disetujui.`
      : `${laporanType} Anda perlu direvisi: ${catatan || 'Silakan periksa.'}`,
    { type: 'laporan' },
    'laporan'
  );
}

// Broadcast notification - to target roles
async function sendBroadcast(title, message, target, prioritas) {
  const roles = target === 'all'
    ? ['anggota', 'komandan', 'supervisor']
    : target === 'komandan'
      ? ['komandan']
      : [target];

  return sendToRole(
    roles,
    title,
    message,
    { type: 'broadcast' },
    prioritas === 'urgent' ? 'panic' : 'default'
  );
}

// Patrol reminder
async function sendPatrolReminder(userId, routeName) {
  return sendToUser(
    userId,
    '🚶 Patroli Menunggu',
    `Jadwal patroli rute "${routeName}" sudah waktunya. Silakan mulai patroli.`,
    { type: 'patrol' },
    'patrol'
  );
}

module.exports = {
  initFirebase,
  sendToDevice,
  sendToUser,
  sendToRole,
  sendToAll,
  sendPanicAlert,
  sendAbsensiNotif,
  sendLaporanNotif,
  sendLaporanValidation,
  sendBroadcast,
  sendPatrolReminder,
};