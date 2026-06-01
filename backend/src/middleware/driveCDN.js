const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const uploadDir = process.env.UPLOAD_DIR || './uploads';
function getFileUrl(filePath) {
  if (!filePath) return null;
  const rel = filePath.replace(/\\/g, '/').replace(/^\.?\/?uploads\//, '');
  return `${process.env.API_URL || 'http://localhost:3000'}/uploads/${rel}`;
}
async function getFileUrlWithCDN(p) { return getFileUrl(p); }
async function deleteFromDrive(fileUrl) {
  if (!fileUrl) return;
  try { const m = fileUrl.match(/\/uploads\/(.+)$/); if (m) { const p = path.join(uploadDir, m[1]); if (fs.existsSync(p)) fs.unlinkSync(p); } } catch {}
}
function getStorageStats() {
  try { let s=0,c=0; function w(d){if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())w(f);else{s+=fs.statSync(f).size;c++;}}} w(uploadDir); return{totalFiles:c,totalSizeMB:Math.round(s/1048576*100)/100,uploadDir:path.resolve(uploadDir)}; } catch(e){return{totalFiles:0,totalSizeMB:0,error:e.message};}
}
for(const sub of['general','absensi','patroli','laporan','kejadian','profile','backup','personil']){const d=path.join(uploadDir,sub);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});}
logger.info('[Storage] ✅ Local file storage enabled');
logger.info('[Storage]    Dir: '+path.resolve(uploadDir));
const st=getStorageStats();logger.info('[Storage]    Files: '+st.totalFiles+' | Size: '+st.totalSizeMB+' MB');
module.exports={initDriveClient:()=>null,uploadToDrive:async()=>null,deleteFromDrive,getFileUrlWithCDN,getFileUrl,getStorageStats,isDriveEnabled:()=>false};