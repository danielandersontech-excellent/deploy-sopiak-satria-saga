import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { API_URL, getToken } from '../lib/apiClient';
export interface UploadResult { success: boolean; publicUrl: string | null; error: string | null; }
export async function compressImage(uri: string, maxW = 1024, maxH = 1024, quality = 0.7) {
  try {
    if (uri.startsWith('http')) return { uri, width: 0, height: 0 };
    const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxW, height: maxH } }], { compress: quality, format: ImageManipulator.SaveFormat.JPEG });
    try { const o = await FileSystem.getInfoAsync(uri); const c = await FileSystem.getInfoAsync(r.uri); console.log('[Compress] '+(o.exists&&'size' in o?Math.round((o.size||0)/1024):'?')+'KB -> '+(c.exists&&'size' in c?Math.round((c.size||0)/1024):'?')+'KB ('+r.width+'x'+r.height+')'); } catch {}
    return r;
  } catch (e: any) { console.log('[Compress] Failed:', e.message); return { uri, width: 0, height: 0 }; }
}
function fixUploadUrl(url: string): string {
  if (!url) return url;
  if (url.includes('localhost:3000') || url.includes('127.0.0.1:3000')) {
    const h = API_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const f = url.replace('http://localhost:3000', 'http://'+h).replace('http://127.0.0.1:3000', 'http://'+h);
    if (f !== url) console.log('[Upload]   URL fixed: localhost -> '+f);
    return f;
  }
  return url;
}
async function uploadToBackend(localUri: string, folder: string, watermarkInfo?: any): Promise<UploadResult> {
  try {
    if (!localUri) return { success: false, publicUrl: null, error: 'No URI' };
    if (localUri.startsWith('http')) return { success: true, publicUrl: localUri, error: null };
    const compressed = await compressImage(localUri);
    const formData = new FormData();
    formData.append('file', { uri: compressed.uri, name: 'upload_'+Date.now()+'.jpg', type: 'image/jpeg' } as any);
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = 'Bearer '+token;
    if (watermarkInfo) headers['X-Watermark-Info'] = encodeURIComponent(JSON.stringify(watermarkInfo));
    const response = await fetch(API_URL+'/api/data/upload?folder='+folder, { method: 'POST', headers, body: formData });
    if (response.ok) { const data = await response.json(); const url = fixUploadUrl(data.url); console.log('[Upload] âœ… '+url); return { success: true, publicUrl: url, error: null }; }
    else { let msg = 'HTTP '+response.status; try { const d = await response.json(); msg = d.error || msg; } catch {} return { success: false, publicUrl: localUri, error: msg }; }
  } catch (e: any) { console.log('[Upload] Error: '+e.message); return { success: false, publicUrl: localUri, error: e.message }; }
}
export async function uploadAbsensiPhoto(uri: string, _userId: string, wm?: any) { return (await uploadToBackend(uri, 'absensi', wm)).publicUrl || uri; }
export async function uploadProfilePhoto(uri: string, _userId: string) { const c = await compressImage(uri, 512, 512, 0.8); return (await uploadToBackend(c.uri, 'profile')).publicUrl || uri; }
export async function uploadEvidencePhotos(uris: string[], _userId: string, wm?: any) { return Promise.all(uris.map(async u => (await uploadToBackend(u, 'laporan', wm)).publicUrl || u)); }
export async function uploadKejadianPhotos(uris: string[], _userId: string, wm?: any) { return Promise.all(uris.map(async u => (await uploadToBackend(u, 'kejadian', wm)).publicUrl || u)); }
export async function uploadPatroliPhoto(uri: string, _userId: string, wm?: any) { return (await uploadToBackend(uri, 'patroli', wm)).publicUrl || uri; }
export function formatFileSize(b: number) { if(b<1024)return b+'B';if(b<1048576)return Math.round(b/1024)+'KB';return(b/1048576).toFixed(1)+'MB'; }
