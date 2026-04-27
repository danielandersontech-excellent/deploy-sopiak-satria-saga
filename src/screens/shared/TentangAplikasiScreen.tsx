import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge } from '../../components';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function TentangAplikasiScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.headerTitle}>Tentang Aplikasi</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.logoWrap}>
          <View style={st.logo}><Ionicons name="shield-checkmark" size={48} color="#fff" /></View>
          <Text style={st.appName}>PT Sopiak Satria Saga</Text>
          <Badge text="v3.0.0" variant="info" size="medium" />
          <Text style={st.tagline}>Sistem Manajemen Keamanan Terpadu</Text>
        </View>
        <Card style={st.descCard}>
          <Text style={st.descText}>Aplikasi manajemen operasional keamanan PT Sopiak Satria Saga untuk mengelola absensi, patroli, laporan, dan pemantauan tim security secara real-time.</Text>
        </Card>
        <Text style={st.sectionTitle}>Kontak</Text>
        <Card>
          {[
            { icon: 'globe-outline', label: 'Website', value: 'www.sopiaksatriasaga.co.id' },
            { icon: 'mail-outline', label: 'Email', value: 'info@sopiaksatriasaga.co.id' },
            { icon: 'call-outline', label: 'Telepon', value: '021-5567890' },
            { icon: 'location-outline', label: 'Alamat', value: 'Jl. Riau No. 1, Pekanbaru 28111' },
          ].map((c, i) => (
            <View key={i} style={[st.contactRow, i < 3 && st.contactBorder]}>
              <Ionicons name={c.icon as any} size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}><Text style={st.contactLabel}>{c.label}</Text><Text style={st.contactValue}>{c.value}</Text></View>
            </View>
          ))}
        </Card>
        <Text style={st.sectionTitle}>Fitur Utama</Text>
        <Card>
          {['Absensi GPS + Selfie', 'Patroli & Scan QR', 'Laporan Harian & Kejadian', 'Panic Button Darurat', 'Monitor Tim Real-time', 'Validasi Laporan Komandan', 'Analytics & Dashboard', 'Manajemen Multi-lokasi'].map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={{ ...Typography.small, color: Colors.textPrimary }}>{f}</Text>
            </View>
          ))}
        </Card>
        <Text style={st.copyright}>© 2026 PT Sopiak Satria Saga{'\n'}All rights reserved.</Text>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 80, height: 80, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  appName: { ...Typography.h2, color: Colors.textPrimary },
  tagline: { ...Typography.small, color: Colors.textMuted, marginTop: 4 },
  descCard: { marginBottom: 16 },
  descText: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  sectionTitle: { ...Typography.bodyBold, color: Colors.textPrimary, marginBottom: 8, marginTop: 12 },
  contactRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12 },
  contactBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  contactLabel: { ...Typography.caption, color: Colors.textMuted },
  contactValue: { ...Typography.smallBold, color: Colors.textPrimary },
  copyright: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: 24 },
});
