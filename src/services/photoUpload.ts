import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { API_URL, getToken } from '../lib/apiClient';
export interface UploadResult { success: boolean; publicUrl: string | null; error: string | null; }
export async function compressImage(uri: string, maxW = 1024, maxH = 1024, quality = 0.7) {
  try {
    if (uri.startsWith('http')) return { uri, width: 0, height: 0 };
    // AUDIT-B1A (BUG-03): resize by WIDTH ONLY. Passing both width and height to
    // ImageManipulator forces the image into an exact box and stretches/squashes
    // any photo whose aspect ratio isn't square (selfies, evidence, patrol shots
    // were all distorted). With a single dimension the library scales the other
    // proportionally. `maxH` is kept in the signature for call-site compatibility.
    void maxH;
    const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxW } }], { compress: quality, format: ImageManipulator.SaveFormat.JPEG });
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
    if (response.ok) { const data = await response.json(); const url = fixUploadUrl(data.url); console.log('[Upload] ✅ '+url); return { success: true, publicUrl: url, error: null }; }
    else { let msg = 'HTTP '+response.status; try { const d = await response.json(); msg = d.error || msg; } catch {} return { success: false, publicUrl: null, error: msg }; }
  } catch (e: any) { console.log('[Upload] Error: '+e.message); return { success: false, publicUrl: null, error: e.message }; }
}
// [3-5] Pada KEGAGALAN upload, helper mengembalikan null (BUKAN URI lokal file://).
// Pemanggil WAJIB memeriksa null dan tidak menyimpan/menyubmit foto yang gagal.
export async function uploadAbsensiPhoto(uri: string, _userId: string, wm?: any): Promise<string | null> { const r = await uploadToBackend(uri, 'absensi', wm); return r.success ? r.publicUrl : null; }
export async function uploadProfilePhoto(uri: string, _userId: string): Promise<string | null> { const c = await compressImage(uri, 512, 512, 0.8); const r = await uploadToBackend(c.uri, 'profile'); return r.success ? r.publicUrl : null; }
export async function uploadEvidencePhotos(uris: string[], _userId: string, wm?: any): Promise<(string | null)[]> { return Promise.all(uris.map(async u => { const r = await uploadToBackend(u, 'laporan', wm); return r.success ? r.publicUrl : null; })); }
export async function uploadKejadianPhotos(uris: string[], _userId: string, wm?: any): Promise<(string | null)[]> { return Promise.all(uris.map(async u => { const r = await uploadToBackend(u, 'kejadian', wm); return r.success ? r.publicUrl : null; })); }
export async function uploadPatroliPhoto(uri: string, _userId: string, wm?: any): Promise<string | null> { const r = await uploadToBackend(uri, 'patroli', wm); return r.success ? r.publicUrl : null; }
export function formatFileSize(b: number) { if(b<1024)return b+'B';if(b<1048576)return Math.round(b/1024)+'KB';return(b/1048576).toFixed(1)+'MB'; }