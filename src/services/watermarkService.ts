interface WatermarkInfo { nama: string; nrp: string; latitude?: number; longitude?: number; lokasi?: string; customText?: string; }
export async function addWatermark(photoUri: string, _info: WatermarkInfo): Promise<string> { return photoUri; }
export function buildWatermarkInfo(user: { nama: string; nrp: string }, location?: { latitude: number; longitude: number }, posJaga?: string, type?: string): WatermarkInfo {
  return { nama: user.nama, nrp: user.nrp, latitude: location?.latitude, longitude: location?.longitude, lokasi: posJaga, customText: type ? type.toUpperCase() : undefined };
}
