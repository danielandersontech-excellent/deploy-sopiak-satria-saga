/**
 * DIGITAL SIGNATURE PAD - Touch drawing canvas
 * Captures signature as base64 image string
 */
import React, { useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../constants';
import { useTheme } from '../lib/theme';

interface Props {
  onSign: (signatureBase64: string) => void;
  label?: string;
  height?: number;
}

export default function SignaturePad({ onSign, label, height = 180 }: Props) {
  const { theme, isDark } = useTheme();
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [signed, setSigned] = useState(false);
  const svgRef = useRef<any>(null);
  const padWidth = Dimensions.get('window').width - 48;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrentPath(`M${locationX},${locationY}`);
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrentPath(p => `${p} L${locationX},${locationY}`);
    },
    onPanResponderRelease: () => {
      if (currentPath) {
        setPaths(p => [...p, currentPath]);
        setCurrentPath('');
        setSigned(true);
      }
    },
  });

  const handleClear = () => {
    setPaths([]);
    setCurrentPath('');
    setSigned(false);
    onSign('');
  };

  const handleConfirm = () => {
    // Generate SVG data as a simple path string that backend can store
    const svgData = paths.join(' ');
    const base64 = btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${padWidth}" height="${height}">` +
      `<rect width="100%" height="100%" fill="white"/>` +
      paths.map(p => `<path d="${p}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join('') +
      `</svg>`
    );
    onSign(`data:image/svg+xml;base64,${base64}`);
  };

  const strokeColor = isDark ? '#e6edf3' : '#1a1a1a';
  const bgColor = isDark ? '#21262d' : '#ffffff';

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {label && <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>}
      <View
        style={[styles.canvas, { height, backgroundColor: bgColor, borderColor: theme.border }]}
        {...panResponder.panHandlers}
      >
        <Svg width={padWidth} height={height} style={StyleSheet.absoluteFill}>
          {paths.map((p, i) => (
            <Path key={i} d={p} stroke={strokeColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          ))}
          {currentPath ? (
            <Path d={currentPath} stroke={strokeColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          ) : null}
        </Svg>
        {!signed && (
          <View style={styles.placeholder}>
            <Ionicons name="pencil-outline" size={20} color={theme.textMuted} />
            <Text style={[styles.placeholderText, { color: theme.textMuted }]}>Tanda tangan di sini</Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btnClear, { borderColor: theme.border }]} onPress={handleClear}>
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          <Text style={{ color: Colors.danger, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Hapus</Text>
        </TouchableOpacity>
        {signed && (
          <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirm}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Konfirmasi</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  canvas: {
    borderWidth: 1.5, borderRadius: 10, borderStyle: 'dashed',
    overflow: 'hidden', position: 'relative',
  },
  placeholder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  placeholderText: { fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  btnClear: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
  },
  btnConfirm: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    backgroundColor: Colors.success,
  },
});
