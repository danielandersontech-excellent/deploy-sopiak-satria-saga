/**
 * QR GENERATOR - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  ✅ Dark mode support (was importing useTheme but using Colors directly).
 *  ✅ i18n support (was importing useI18n but using hardcoded Indonesian strings).
 *  ✅ Print/share errors no longer silently swallowed — proper alerts shown.
 *  ✅ HTML escape for cp.nama, cp.area, cp.lokasi, cp.qrCode (prevents XSS via
 *     names with HTML-like characters in printed output).
 *  ✅ Empty state when checkpoints list is empty.
 *  ✅ Generated count badge in action bar.
 *  ✅ Modal onRequestClose properly handles back button.
 *  ✅ Resilient default values when fields are missing.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

// HTML escape - prevents injection via user-controlled fields
function escapeHtml(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ======== Simple QR-like visual (checkerboard based on string hash) ========
function QRPreviewBox({ value, size = 120 }: { value: string; size?: number }) {
  const gridSize = 11;
  const cells: boolean[][] = [];

  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }

  for (let r = 0; r < gridSize; r++) {
    cells[r] = [];
    for (let c = 0; c < gridSize; c++) {
      const isFinderTL = r < 3 && c < 3;
      const isFinderTR = r < 3 && c >= gridSize - 3;
      const isFinderBL = r >= gridSize - 3 && c < 3;
      const isFinderBorder =
        (isFinderTL || isFinderTR || isFinderBL) &&
        (r === 0 ||
          c === 0 ||
          r === 2 ||
          c === 2 ||
          r === gridSize - 1 ||
          c === gridSize - 1 ||
          r === gridSize - 3 ||
          c === gridSize - 3);
      const isFinderCenter =
        (r === 1 && c === 1) ||
        (r === 1 && c === gridSize - 2) ||
        (r === gridSize - 2 && c === 1);

      if (isFinderBorder || isFinderCenter) {
        cells[r][c] = true;
      } else if (isFinderTL || isFinderTR || isFinderBL) {
        cells[r][c] = false;
      } else {
        const seed = (hash + r * 31 + c * 17 + r * c * 7) & 0xffff;
        cells[r][c] = seed % 3 !== 0;
      }
    }
  }

  const cellSize = size / gridSize;

  return (
    <View style={[qrSt.box, { width: size + 16, height: size + 16 }]}>
      <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.flat().map((filled, i) => (
          <View
            key={`c-${i}`}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: filled ? '#2c3e50' : '#fff',
            }}
          />
        ))}
      </View>
    </View>
  );
}

const qrSt = StyleSheet.create({
  box: {
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
});

// ======== Generate printable HTML with real QR codes via api.qrserver.com ========
function generateQRPrintHTML(checkpoints: any[]) {
  const cards = checkpoints
    .map((cp) => {
      const qrData = encodeURIComponent(cp.qrCode || '');
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;
      const nama = escapeHtml(cp.nama || '-');
      const area = escapeHtml(cp.area || '-');
      const lokasi = escapeHtml(cp.lokasi || '-');
      const qrCode = escapeHtml(cp.qrCode || '');

      return `
      <div class="qr-card">
        <div class="qr-image">
          <img src="${qrUrl}" alt="QR" width="180" height="180" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
          <div class="qr-fallback" style="display:none;">
            <div style="font-size:48px;color:#2980b9;">&#9633;</div>
            <div style="font-size:10px;color:#666;">QR: ${qrCode}</div>
          </div>
        </div>
        <div class="qr-info">
          <div class="qr-name">${nama}</div>
          <div class="qr-area">${area} &bull; ${lokasi}</div>
          <div class="qr-code">${qrCode}</div>
        </div>
      </div>
    `;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; }
    .header { text-align:center; margin-bottom:20px; padding-bottom:12px; border-bottom:2px solid #2980b9; }
    .header h1 { font-size:18px; color:#2980b9; } .header p { font-size:11px; color:#666; }
    .grid { display:flex; flex-wrap:wrap; gap:16px; justify-content:center; }
    .qr-card { width:220px; border:1px solid #ddd; border-radius:10px; padding:12px; text-align:center; page-break-inside:avoid; }
    .qr-image { display:flex; align-items:center; justify-content:center; min-height:190px; margin-bottom:8px; }
    .qr-fallback { align-items:center; justify-content:center; flex-direction:column; }
    .qr-name { font-size:12px; font-weight:700; color:#2c3e50; }
    .qr-area { font-size:10px; color:#888; margin-top:2px; }
    .qr-code { font-size:9px; color:#2980b9; font-weight:600; margin-top:4px; font-family:monospace; }
    .footer { margin-top:20px; text-align:center; font-size:9px; color:#aaa; border-top:1px solid #ddd; padding-top:8px; }
  </style></head><body>
    <div class="header">
      <h1>QR Code Checkpoint - PT Sopiak Satria Saga</h1>
      <p>Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} &bull; Total: ${checkpoints.length} QR</p>
    </div>
    <div class="grid">${cards}</div>
    <div class="footer">Tempel QR di setiap checkpoint. Pastikan QR terlihat jelas dan tidak tertutup.</div>
  </body></html>`;
}

function generateSingleQRHTML(cp: any) {
  const qrData = encodeURIComponent(cp.qrCode || '');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${qrData}`;
  const nama = escapeHtml(cp.nama || '-');
  const area = escapeHtml(cp.area || '-');
  const lokasi = escapeHtml(cp.lokasi || '-');
  const qrCode = escapeHtml(cp.qrCode || '');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Helvetica Neue', sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { text-align:center; border:2px solid #2980b9; border-radius:16px; padding:30px; max-width:350px; }
    .card h2 { color:#2980b9; font-size:16px; margin-bottom:4px; }
    .card .area { color:#888; font-size:12px; margin-bottom:16px; }
    .card img { margin:0 auto; display:block; }
    .card .code { font-family:monospace; font-size:14px; color:#2980b9; margin-top:12px; font-weight:700; letter-spacing:1px; }
    .card .footer { font-size:9px; color:#aaa; margin-top:12px; }
  </style></head><body>
    <div class="card">
      <h2>${nama}</h2>
      <div class="area">${area} &bull; ${lokasi}</div>
      <img src="${qrUrl}" alt="QR" width="280" height="280" />
      <div class="code">${qrCode}</div>
      <div class="footer">PT Sopiak Satria Saga - Scan saat patroli</div>
    </div>
  </body></html>`;
}

// ======== MAIN COMPONENT ========
export default function QRGeneratorScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const checkpoints = useDataStore((s) => s.checkpoints);
  const [generated, setGenerated] = useState<string[]>([]);
  const [previewCp, setPreviewCp] = useState<any>(null);
  const [printing, setPrinting] = useState(false);

  const handleGenerate = (cpId: string) => {
    if (!generated.includes(cpId)) {
      setGenerated((prev) => [...prev, cpId]);
    }
    const cp = checkpoints.find((c) => c.id === cpId);
    if (cp) setPreviewCp(cp);
  };

  const handleGenerateAll = () => {
    setGenerated(checkpoints.map((c) => c.id));
    Alert.alert(
      '✅ ' + (lang === 'en' ? 'Done' : 'Berhasil'),
      lang === 'en'
        ? `${checkpoints.length} QR Codes generated successfully`
        : `${checkpoints.length} QR Code berhasil digenerate`
    );
  };

  const handlePrintSingle = async (cp: any) => {
    if (!cp) return;
    if (printing) return;
    setPrinting(true);
    try {
      const html = generateSingleQRHTML(cp);
      await Print.printAsync({ html });
    } catch (e: any) {
      console.log('[QRGenerator] print single err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to print' : 'Gagal mencetak')
      );
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintAll = async () => {
    if (printing) return;
    if (checkpoints.length === 0) {
      Alert.alert('Info', lang === 'en' ? 'No checkpoints to print' : 'Tidak ada checkpoint untuk dicetak');
      return;
    }
    setPrinting(true);
    try {
      const html = generateQRPrintHTML(checkpoints);
      await Print.printAsync({ html });
    } catch (e: any) {
      console.log('[QRGenerator] print all err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to print' : 'Gagal mencetak')
      );
    } finally {
      setPrinting(false);
    }
  };

  const handleShareAll = async () => {
    if (printing) return;
    if (checkpoints.length === 0) {
      Alert.alert('Info', lang === 'en' ? 'No checkpoints to share' : 'Tidak ada checkpoint untuk dibagikan');
      return;
    }
    setPrinting(true);
    try {
      const html = generateQRPrintHTML(checkpoints);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'QR Checkpoints' });
      } else {
        Alert.alert(
          'Info',
          lang === 'en' ? 'Sharing not available on this device' : 'Fitur berbagi tidak tersedia'
        );
      }
    } catch (e: any) {
      console.log('[QRGenerator] share all err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to share PDF' : 'Gagal membagikan PDF')
      );
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      <View style={[st.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>QR Generator</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[st.actionBar, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <Button
          title={lang === 'en' ? 'Generate All' : 'Generate Semua'}
          variant="primary"
          size="small"
          icon="qr-code-outline"
          onPress={handleGenerateAll}
          disabled={checkpoints.length === 0}
        />
        <Button
          title={lang === 'en' ? 'Print All' : 'Print Semua'}
          variant="outline"
          size="small"
          icon="print-outline"
          onPress={handlePrintAll}
          disabled={printing || checkpoints.length === 0}
        />
        <Button
          title="Share PDF"
          variant="outline"
          size="small"
          icon="share-outline"
          onPress={handleShareAll}
          disabled={printing || checkpoints.length === 0}
        />
      </View>

      {checkpoints.length > 0 && (
        <Text style={[st.countText, { color: theme.textMuted }]}>
          {generated.length}/{checkpoints.length} {lang === 'en' ? 'generated' : 'ter-generate'}
        </Text>
      )}

      <ScrollView contentContainerStyle={st.content}>
        {checkpoints.length === 0 && (
          <View style={st.empty}>
            <Ionicons name="qr-code-outline" size={48} color={theme.textMuted} />
            <Text style={[st.emptyText, { color: theme.textMuted }]}>
              {lang === 'en' ? 'No checkpoints yet' : 'Belum ada checkpoint'}
            </Text>
            <Text style={[st.emptySubtext, { color: theme.textMuted }]}>
              {lang === 'en'
                ? 'Add checkpoints first to generate QR codes'
                : 'Tambahkan checkpoint terlebih dahulu untuk membuat QR'}
            </Text>
            <Button
              title={lang === 'en' ? 'Setup Checkpoints' : 'Setup Checkpoint'}
              variant="primary"
              size="small"
              icon="add"
              onPress={() => navigation.navigate('SetupCheckpoint')}
            />
          </View>
        )}

        {checkpoints.map((cp) => {
          const isGenerated = generated.includes(cp.id);
          return (
            <Card key={cp.id} style={st.card}>
              <View style={st.cardRow}>
                <TouchableOpacity onPress={() => handleGenerate(cp.id)}>
                  {isGenerated ? (
                    <QRPreviewBox value={cp.qrCode || cp.id} size={70} />
                  ) : (
                    <View
                      style={[
                        st.qrPlaceholder,
                        {
                          backgroundColor: isDark ? theme.bgInput : Colors.bgGray,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Ionicons name="qr-code-outline" size={32} color={theme.textMuted} />
                      <Text style={[st.qrPlaceholderText, { color: theme.textMuted }]}>
                        {lang === 'en' ? 'Generate' : 'Generate'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={[st.cpName, { color: theme.text }]}>{cp.nama}</Text>
                  <Text style={[st.cpMeta, { color: theme.textMuted }]}>
                    {cp.area || '-'} • {cp.lokasi || '-'}
                  </Text>
                  <Text style={[st.cpCode, { color: Colors.primary }]}>{cp.qrCode}</Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge
                    text={isGenerated ? (lang === 'en' ? 'Ready' : 'Siap') : (lang === 'en' ? 'Pending' : 'Pending')}
                    variant={isGenerated ? 'success' : 'default'}
                  />
                  {!isGenerated && (
                    <Button
                      title={lang === 'en' ? 'Generate' : 'Generate'}
                      variant="primary"
                      size="small"
                      onPress={() => handleGenerate(cp.id)}
                    />
                  )}
                  {isGenerated && (
                    <Button
                      title={lang === 'en' ? 'Print' : 'Print'}
                      variant="outline"
                      size="small"
                      icon="print-outline"
                      onPress={() => handlePrintSingle(cp)}
                      disabled={printing}
                    />
                  )}
                </View>
              </View>
            </Card>
          );
        })}
        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal
        visible={!!previewCp}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewCp(null)}
      >
        <View style={st.modalOverlay}>
          <View style={[st.modalContent, { backgroundColor: theme.bgCard }]}>
            <Text style={[st.modalTitle, { color: theme.text }]}>{previewCp?.nama}</Text>
            <Text style={[st.modalArea, { color: theme.textMuted }]}>
              {previewCp?.area || '-'} • {previewCp?.lokasi || '-'}
            </Text>

            <View style={{ marginVertical: 16, alignItems: 'center' }}>
              <QRPreviewBox value={previewCp?.qrCode || ''} size={180} />
            </View>

            <Text style={[st.modalCode, { color: Colors.primary }]}>{previewCp?.qrCode}</Text>
            <Text style={[st.modalNote, { color: theme.textMuted }]}>
              {lang === 'en'
                ? 'This QR Code will be printed and placed at the checkpoint'
                : 'QR Code ini akan dicetak dan ditempel di checkpoint'}
            </Text>

            <View style={st.modalActions}>
              <Button
                title={lang === 'en' ? 'Print QR' : 'Print QR'}
                variant="primary"
                size="medium"
                icon="print-outline"
                onPress={() => {
                  const cp = previewCp;
                  setPreviewCp(null);
                  if (cp) handlePrintSingle(cp);
                }}
                style={{ flex: 1 }}
                disabled={printing}
              />
              <Button
                title={lang === 'en' ? 'Close' : 'Tutup'}
                variant="outline"
                size="medium"
                onPress={() => setPreviewCp(null)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  countText: { ...Typography.caption, paddingHorizontal: Spacing.base, paddingTop: 8 },
  content: { padding: Spacing.base },
  card: { marginBottom: 10 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  qrPlaceholder: {
    width: 86,
    height: 86,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  qrPlaceholderText: { ...Typography.caption, marginTop: 2 },
  cpName: { ...Typography.bodyBold },
  cpMeta: { ...Typography.caption },
  cpCode: { ...Typography.caption, fontWeight: '600', marginTop: 2, fontFamily: 'monospace' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { ...Typography.body, fontWeight: '600' },
  emptySubtext: { ...Typography.caption, textAlign: 'center', paddingHorizontal: 32, marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
  modalTitle: { ...Typography.h3 },
  modalArea: { ...Typography.caption, marginTop: 2 },
  modalCode: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  modalNote: { ...Typography.caption, textAlign: 'center', marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
});
