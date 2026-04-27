/**
 * OFFLINE BANNER v2 - Shows network status + sync queue info
 * Supports dark mode via isDark prop or useTheme
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isOnline, getPendingCount, addSyncListener, processQueue, SyncStatus } from '../services/offlineSync';

interface Props {
  isDark?: boolean;
}

export default function OfflineBanner({ isDark = false }: Props) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{ synced: number; failed: number } | null>(null);

  useEffect(() => {
    isOnline().then(setOnline);
    getPendingCount().then(setPending);

    const unsub = addSyncListener((status: SyncStatus) => {
      setOnline(status.isOnline);
      setPending(status.pendingCount);
      setSyncing(status.isSyncing);
      if (status.lastSyncResult) {
        setLastResult({ synced: status.lastSyncResult.synced, failed: status.lastSyncResult.failed });
        // Clear result after 5s
        setTimeout(() => setLastResult(null), 5000);
      }
    });

    const interval = setInterval(() => {
      isOnline().then(setOnline);
      getPendingCount().then(setPending);
    }, 15000);

    return () => { unsub(); clearInterval(interval); };
  }, []);

  const handleSyncPress = useCallback(async () => {
    if (syncing || !online) return;
    await processQueue();
  }, [syncing, online]);

  // Nothing to show
  if (online && pending === 0 && !lastResult) return null;

  // Show success briefly
  if (online && pending === 0 && lastResult && lastResult.synced > 0) {
    return (
      <View style={[styles.banner, styles.successBanner, isDark && styles.successBannerDark]}>
        <Ionicons name="checkmark-circle" size={15} color="#166534" />
        <Text style={[styles.text, styles.successText]}>
          ✅ {lastResult.synced} data berhasil disinkronkan
        </Text>
      </View>
    );
  }

  const isOffline = !online;

  return (
    <TouchableOpacity
      style={[
        styles.banner,
        isOffline ? styles.offlineBanner : styles.pendingBanner,
        isDark && (isOffline ? styles.offlineBannerDark : styles.pendingBannerDark),
      ]}
      onPress={handleSyncPress}
      activeOpacity={syncing ? 1 : 0.7}
      disabled={!online || syncing}
    >
      <Ionicons
        name={isOffline ? 'cloud-offline-outline' : syncing ? 'sync' : 'cloud-upload-outline'}
        size={15}
        color={isOffline ? (isDark ? '#fca5a5' : '#991b1b') : (isDark ? '#fcd34d' : '#92400e')}
      />
      <Text style={[
        styles.text,
        isOffline
          ? [styles.offlineText, isDark && styles.offlineTextDark]
          : [styles.pendingText, isDark && styles.pendingTextDark],
      ]} numberOfLines={1}>
        {isOffline
          ? `Offline - ${pending > 0 ? `${pending} aksi tersimpan lokal` : 'data dari cache SQLite'}`
          : syncing
            ? 'Menyinkronkan data...'
            : `${pending} aksi menunggu sinkronisasi${online ? ' • Tap untuk sync' : ''}`
        }
      </Text>
      {syncing && <ActivityIndicator size="small" color={isDark ? '#fcd34d' : '#92400e'} />}
      {!syncing && online && pending > 0 && (
        <Ionicons name="arrow-up-circle" size={16} color={isDark ? '#fcd34d' : '#92400e'} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  offlineBanner: {
    backgroundColor: '#FEE2E2',
    borderBottomColor: '#FECACA',
  },
  offlineBannerDark: {
    backgroundColor: '#450a0a',
    borderBottomColor: '#7f1d1d',
  },
  pendingBanner: {
    backgroundColor: '#FEF3C7',
    borderBottomColor: '#FDE68A',
  },
  pendingBannerDark: {
    backgroundColor: '#451a03',
    borderBottomColor: '#78350f',
  },
  successBanner: {
    backgroundColor: '#DCFCE7',
    borderBottomColor: '#BBF7D0',
  },
  successBannerDark: {
    backgroundColor: '#052e16',
    borderBottomColor: '#166534',
  },
  text: {
    fontSize: 11,
    flex: 1,
    fontWeight: '600',
  },
  offlineText: { color: '#991b1b' },
  offlineTextDark: { color: '#fca5a5' },
  pendingText: { color: '#92400e' },
  pendingTextDark: { color: '#fcd34d' },
  successText: { color: '#166534' },
});
