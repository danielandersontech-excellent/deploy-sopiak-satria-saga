const router = require('express').Router();
const dataCtrl = require('../controllers/data.controller');
const opCtrl = require('../controllers/operasional.controller');
const dashCtrl = require('../controllers/dashboard.controller');
const { auth, requireRole } = require('../middleware/auth');
const { upload, setFolder, getFileUrl } = require('../middleware/upload');
function crudRoutes(ctrl, adminOnly = false) {
  const r = require('express').Router();
  const wg = adminOnly ? [auth, requireRole('admin','supervisor','komandan')] : [auth];
  r.get('/', auth, ctrl.getAll); r.get('/:id', auth, ctrl.getById);
  r.post('/', ...wg, ctrl.create); r.put('/:id', ...wg, ctrl.update); r.delete('/:id', ...wg, ctrl.remove);
  return r;
}
router.use('/lokasi', crudRoutes(dataCtrl.lokasi, true));
router.use('/pos-jaga', crudRoutes(dataCtrl.posJaga, true));
router.use('/checkpoints', crudRoutes(dataCtrl.checkpoints, true));
router.use('/routes', crudRoutes(dataCtrl.routes, true));
router.use('/jadwal-shift', crudRoutes(dataCtrl.jadwalShift, true));
router.use('/shift-assignments', crudRoutes(dataCtrl.shiftAssignments, true));
router.use('/report-exports', crudRoutes(dataCtrl.reportExports, true));
router.use('/clients', crudRoutes(dataCtrl.clients, true));
const bcR = require('express').Router();
bcR.get('/', auth, opCtrl.getBroadcasts); bcR.post('/', auth, requireRole('komandan','supervisor','admin'), opCtrl.createBroadcast);
router.use('/broadcasts', bcR);
const stR = require('express').Router();
stR.get('/', auth, opCtrl.getSerahTerima); stR.post('/', auth, opCtrl.createSerahTerima);
router.use('/serah-terima', stR);
const paR = require('express').Router();
paR.get('/', auth, opCtrl.getPanics); paR.post('/', auth, opCtrl.createPanic); paR.put('/:id/resolve', auth, opCtrl.resolvePanic);
router.use('/panic', paR);
const noR = require('express').Router();
noR.get('/', auth, opCtrl.getNotifikasi); noR.post('/', auth, opCtrl.createNotifikasi);
noR.put('/read-all', auth, opCtrl.markAllRead); noR.put('/:id/read', auth, opCtrl.markRead);
router.use('/notifikasi', noR);
router.get('/dashboard/stats', auth, dashCtrl.getStats);
// File upload with watermark
router.post('/upload', auth, (req,res,next)=>{req.uploadFolder=req.query.folder||'general';next();}, upload.single('file'), async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'No file'});
  try{let fp=req.file.path;const wm=req.headers['x-watermark-info']||req.body.watermark;
  if(wm&&req.file.mimetype&&req.file.mimetype.startsWith('image/')){try{const{applyWatermark}=require('../services/watermark.service');const info=JSON.parse(typeof wm==='string'?decodeURIComponent(wm):wm);fp=await applyWatermark(fp,info);}catch(e){console.log('[Upload] WM skip:',e.message);}}
  res.json({url:getFileUrl(fp)});}catch(e){res.json({url:getFileUrl(req.file.path)});}
});
router.post('/upload/multiple', auth, (req,res,next)=>{req.uploadFolder=req.query.folder||'general';next();}, upload.array('files',10), async(req,res)=>{
  if(!req.files||!req.files.length)return res.status(400).json({error:'No files'});
  try{const wm=req.headers['x-watermark-info']||req.body.watermark;let wi=null;if(wm)try{wi=JSON.parse(typeof wm==='string'?decodeURIComponent(wm):wm);}catch{}
  const urls=await Promise.all(req.files.map(async f=>{if(wi&&f.mimetype&&f.mimetype.startsWith('image/')){try{const{applyWatermark}=require('../services/watermark.service');await applyWatermark(f.path,wi);}catch{}}return getFileUrl(f.path);}));
  res.json({urls});}catch{res.json({urls:req.files.map(f=>getFileUrl(f.path))});}
});
module.exports = router;
