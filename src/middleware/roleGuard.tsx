/**
 * ============================================
 * ROLE GUARD - Permission Middleware
 * ============================================
 * Defines which roles can access which screens and actions
 * Used in navigation guards and action validation
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../constants';
import { useAuthStore } from '../stores/authStore';

// ==================== ROLE DEFINITIONS ====================

export type AppRole = 'anggota' | 'komandan' | 'supervisor' | 'admin' | 'klien';

/**
 * Screen-level permissions
 * Maps screen names to allowed roles
 */
export const SCREEN_PERMISSIONS: Record<string, AppRole[]> = {
  // === Anggota screens (+ Komandan, Admin, Supervisor can access all) ===
  Absensi:          ['anggota', 'komandan', 'supervisor', 'admin'],
  Patroli:          ['anggota', 'komandan', 'supervisor', 'admin'],
  QRScanner:        ['anggota', 'komandan', 'supervisor', 'admin'],
  LaporanHarian:    ['anggota', 'komandan', 'supervisor', 'admin'],
  LaporanKejadian:  ['anggota', 'komandan', 'supervisor', 'admin'],
  PanicButton:      ['anggota', 'komandan', 'supervisor', 'admin'],
  SerahTerima:      ['anggota', 'komandan', 'supervisor', 'admin'],

  // === Komandan screens ===
  ValidasiLaporan:  ['komandan', 'supervisor', 'admin'],
  MonitorRealtime:  ['komandan', 'supervisor', 'admin'],
  BroadcastPesan:   ['komandan', 'supervisor', 'admin'],
  DetailAnggota:    ['komandan', 'supervisor', 'admin'],

  // === Supervisor/Admin screens ===
  ManajemenPengguna: ['supervisor', 'admin'],
  TambahEditUser:    ['supervisor', 'admin'],
  SetupCheckpoint:   ['supervisor', 'admin'],
  SetupRute:         ['supervisor', 'admin'],
  QRGenerator:       ['supervisor', 'admin'],
  Analytics:         ['supervisor', 'admin'],
  ManajemenLokasi:   ['supervisor', 'admin'],
  JadwalShift:       ['supervisor', 'admin'],
  PerusahaanList:    ['supervisor', 'admin'],
  DetailPerusahaan:  ['supervisor', 'admin'],

  // === Klien screens ===
  // Klien screens removed (now uses separate clients table)
  
  DownloadLaporan:  ['supervisor', 'admin'],

  // === Shared screens (all roles) ===
  // [Misi V3] klien ikut: Notifikasi, Profil, Edit Profil (PUT /api/auth/me), Ubah PIN, Tentang.
  Notifikasi:       ['anggota', 'komandan', 'supervisor', 'admin', 'klien'],
  ProfilDetail:     ['anggota', 'komandan', 'supervisor', 'admin', 'klien'],
  EditProfil:       ['anggota', 'komandan', 'supervisor', 'admin', 'klien'],
  UbahPIN:          ['anggota', 'komandan', 'supervisor', 'admin', 'klien'],
  RiwayatAbsensi:   ['anggota', 'komandan', 'supervisor', 'admin'],
  RiwayatLaporan:   ['anggota', 'komandan', 'supervisor', 'admin'],
  TentangAplikasi:  ['anggota', 'komandan', 'supervisor', 'admin', 'klien'],
};

/**
 * Action-level permissions
 * More granular than screen-level
 */
export const ACTION_PERMISSIONS: Record<string, AppRole[]> = {
  // Absensi
  'absensi:submit':           ['anggota', 'komandan', 'supervisor', 'admin'],
  'absensi:view_all':         ['komandan', 'supervisor', 'admin'],
  'absensi:export':           ['supervisor', 'admin'],

  // Patroli
  'patroli:start':            ['anggota', 'komandan', 'supervisor', 'admin'],
  'patroli:scan':             ['anggota', 'komandan', 'supervisor', 'admin'],
  'patroli:monitor':          ['komandan', 'supervisor', 'admin'],

  // Laporan
  'laporan:submit':           ['anggota', 'komandan', 'supervisor', 'admin'],
  'laporan:validate':         ['komandan', 'supervisor', 'admin'],
  'laporan:approve':          ['komandan', 'supervisor', 'admin'],
  'laporan:reject':           ['komandan', 'supervisor', 'admin'],
  'laporan:export':           ['supervisor', 'admin'],

  // User Management
  'user:create':              ['supervisor', 'admin'],
  'user:update':              ['supervisor', 'admin'],
  'user:delete':              ['admin'],
  'user:assign_role':         ['admin'],
  'user:assign_lokasi':       ['supervisor', 'admin'],

  // Panic
  'panic:activate':           ['anggota', 'komandan', 'supervisor', 'admin'],
  'panic:resolve':            ['komandan', 'supervisor', 'admin'],

  // Broadcast
  'broadcast:send':           ['komandan', 'supervisor', 'admin'],
  'broadcast:send_urgent':    ['komandan', 'supervisor', 'admin'],

  // Settings
  'checkpoint:manage':        ['supervisor', 'admin'],
  'route:manage':             ['supervisor', 'admin'],
  'lokasi:manage':            ['supervisor', 'admin'],
  'shift:manage':             ['supervisor', 'admin'],
  'system:settings':          ['admin'],
};

// ==================== PERMISSION CHECKS ====================

/**
 * Check if role can access a screen
 */
export function canAccessScreen(role: AppRole, screenName: string): boolean {
  const allowed = SCREEN_PERMISSIONS[screenName];
  if (!allowed) return true; // If not defined, allow (fail-open for safety)
  return allowed.includes(role);
}

/**
 * Check if role can perform an action
 */
export function canPerformAction(role: AppRole, action: string): boolean {
  const allowed = ACTION_PERMISSIONS[action];
  if (!allowed) return false; // If not defined, deny (fail-closed)
  return allowed.includes(role);
}

/**
 * Get role hierarchy level (higher = more permissions)
 */
export function getRoleLevel(role: AppRole): number {
  const levels: Record<AppRole, number> = {
    // klien is an external customer role, outside the staff hierarchy.
    klien: 0,
    anggota: 1,
    komandan: 2,
    supervisor: 3,
    admin: 4,
  };
  return levels[role] ?? 0;
}

/**
 * Check if roleA has higher or equal level than roleB
 */
export function isRoleAtLeast(currentRole: AppRole, requiredRole: AppRole): boolean {
  return getRoleLevel(currentRole) >= getRoleLevel(requiredRole);
}

// ==================== REACT COMPONENTS ====================

/**
 * HOC: Wrap screen with role guard
 * Shows "Access Denied" if user role not allowed
 */
export function withRoleGuard(
  WrappedComponent: React.ComponentType<any>,
  allowedRoles: AppRole[]
) {
  return function RoleGuardedScreen(props: any) {
    // AUDIT-B1A (BUG-06): read the role from the auth store, NOT from
    // route params. The previous version read props.route?.params?.userRole
    // (which navigation never populates) and defaulted to 'anggota', so the
    // guard would have denied every legitimate komandan/supervisor/admin while
    // letting anyone reach the anggota screens. It was also never imported
    // anywhere, so no screen had any role enforcement at all.
    const userRole = useAuthStore((s) => s.user?.role) as AppRole | undefined;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return (
        <View style={styles.denied}>
          <View style={styles.deniedIcon}>
            <Ionicons name="lock-closed" size={40} color={Colors.danger} />
          </View>
          <Text style={styles.deniedTitle}>Akses Ditolak</Text>
          <Text style={styles.deniedSub}>
            Anda tidak memiliki izin untuk mengakses halaman ini.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => props.navigation?.goBack?.()}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backBtnText}>Kembali</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return <WrappedComponent {...props} />;
  };
}

/**
 * Component: Conditionally render children based on role
 */
export function RoleVisible({
  role,
  allowedRoles,
  children,
}: {
  role: AppRole;
  allowedRoles: AppRole[];
  children: React.ReactNode;
}) {
  if (!allowedRoles.includes(role)) return null;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: Colors.bgLight },
  deniedIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.dangerSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  deniedTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  deniedSub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Radius.lg },
  backBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
