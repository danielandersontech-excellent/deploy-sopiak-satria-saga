const path = require('path');
const fs = require('fs');
let sharp; try { sharp = require('sharp'); } catch { sharp = null; }
async function applyWatermark(inputPath, info) {
  try {
    if (!sharp) return inputPath;
    if (!info || !fs.existsSync(inputPath)) return inputPath;
    const lines = info.lines || buildWatermarkLines(info);
    if (!lines.length) return inputPath;
    const meta = await sharp(inputPath).metadata();
    const W = meta.width || 640, H = meta.height || 480;
    const fs2 = Math.max(11, Math.min(18, Math.round(W / 45)));
    const lh = fs2 + 7, pad = 12;
    const bw = Math.min(W - 20, Math.max(300, Math.round(W * 0.75)));
    const bh = lines.length * lh + pad * 2 + 14, bx = 10, by = H - bh - 10;
    const bs = Math.max(7, Math.round(fs2 * 0.55));
    const ts = Math.floor(Date.now() / 1000);
    const txt = lines.map((l, i) => '<text x="'+(bx+pad)+'" y="'+(by+pad+(i+1)*lh)+'" font-family="monospace" font-size="'+fs2+'" font-weight="bold" fill="white" stroke="black" stroke-width="1" paint-order="stroke">'+esc(l)+'</text>').join('');
    const svg = Buffer.from('<svg width="'+W+'" height="'+H+'" xmlns="http://www.w3.org/2000/svg"><rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" rx="6" fill="rgba(0,0,0,0.6)"/>'+txt+'<text x="'+(bx+pad)+'" y="'+(by+bh-6)+'" font-family="monospace" font-size="'+bs+'" fill="rgba(255,255,255,0.45)">PT Sopiak Satria Saga | '+ts+' | Verified</text></svg>');
    const out = inputPath.replace(/(\.[^.]+)$/, '_wm$1');
    await sharp(inputPath).composite([{input:svg,top:0,left:0}]).jpeg({quality:85,mozjpeg:true}).toFile(out);
    fs.copyFileSync(out, inputPath); try{fs.unlinkSync(out);}catch{}
    console.log('[Watermark] ✅ '+path.basename(inputPath));
    return inputPath;
  } catch(e) { console.error('[Watermark] ❌ '+e.message); return inputPath; }
}
function buildWatermarkLines(i) {
  const l=[]; const n=new Date(); const w=new Date(n.getTime()+(7*60+n.getTimezoneOffset())*60000);
  const ms=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  if(i.customText) l.push('['+i.customText+']');
  if(i.nama&&i.nrp) l.push(i.nama+' ('+i.nrp+')'); else if(i.nama) l.push(i.nama);
  l.push(String(w.getDate()).padStart(2,'0')+' '+ms[w.getMonth()]+' '+w.getFullYear()+'  '+String(w.getHours()).padStart(2,'0')+':'+String(w.getMinutes()).padStart(2,'0')+':'+String(w.getSeconds()).padStart(2,'0')+' WIB');
  if(i.latitude&&i.longitude) l.push('GPS: '+Number(i.latitude).toFixed(6)+', '+Number(i.longitude).toFixed(6));
  if(i.lokasi) l.push('Lokasi: '+i.lokasi);
  return l;
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
module.exports={applyWatermark,buildWatermarkLines};
