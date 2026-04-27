/**
 * PUSH NOTIFICATIONS - Backward-compatible re-exports from FCM Service
 * All screens that import from this file continue to work.
 */
export {
  registerForPushNotifications,
  saveFcmToken as savePushToken,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  sendLocalNotification,
  setupNotificationChannels,
  getNotificationNavigationTarget,
  retryPendingTokenSave,
} from './fcmService';
