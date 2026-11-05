// SMART SPK → Google Drive (v6) : รับไฟล์งานจากครู + รูปตรวจเขตพื้นที่ + คำสั่งโรงเรียน แล้วเก็บใน Google Drive ของโรงเรียน
//   ไฟล์งานครู : ปีการศึกษา › กลุ่มงาน › งานย่อย › ชื่องาน › กลุ่มสาระ › ชื่อครู
//   รูปตรวจเขต : ตรวจเขตพื้นที่ › ปีการศึกษา › เดือน (YYYY-MM) › วันที่_ห้อง_ประเภท.jpg
//   คำสั่ง     : คำสั่งโรงเรียน › ปีการศึกษา › กลุ่มงาน › คำสั่งที่ ... .pdf
// (แอปเวอร์ชันเก่าที่ไม่ส่ง year/dept/sub มา จะเก็บแบบเดิม ชื่องาน › กลุ่มสาระ › ชื่อครู)
// วิธีติดตั้ง (ทำครั้งเดียว ด้วยบัญชี Google ของโรงเรียน)
//   1. สร้างโฟลเดอร์ใน Google Drive สำหรับเก็บงาน (เช่น "งานวิชาการ 2569") แล้วคัดลอก ID จาก URL (ส่วนหลัง folders/)
//   2. ไปที่ script.google.com → โปรเจกต์ใหม่ → วางโค้ดนี้ทั้งหมด → แก้ ROOT_FOLDER_ID และ KEY ด้านล่าง
//   3. Deploy → New deployment → ประเภท Web app → Execute as: Me · Who has access: Anyone → Deploy (กดอนุญาตสิทธิ์)
//      (ถ้าเคย Deploy แล้ว ให้ Deploy → Manage deployments → ✏️ → Version: New version → Deploy  URL เดิมจะใช้ได้ต่อ)
//   4. คัดลอก URL ที่ลงท้ายด้วย /exec ไปใส่ใน SMART SPK: แอดมินระบบ → ที่เก็บไฟล์ Google Drive (ใส่ KEY เดียวกัน) แล้วกด "ทดสอบการเชื่อมต่อ"
const ROOT_FOLDER_ID = '1QAm_voQLqqAVMPmz5ENgaMMk9pKmbSH5';
const KEY = 'spk2569';
const ZONE_FOLDER = 'ตรวจเขตพื้นที่';
const ORDER_FOLDER = 'คำสั่งโรงเรียน';

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents || '{}');
    if (p.key !== KEY) return out({ ok: false, error: 'รหัสลับไม่ถูกต้อง' });
    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    if (p.ping) return out({ ok: true, root: root.getName(), rootUrl: root.getUrl(), version: 6 });
    if (p.rs) return rsStart(root, p);                          // v6: ไฟล์ใหญ่ (> 30 MB) — เปิดช่องรับไฟล์ใน Drive (resumable)
    if (p.rc) return rsChunk(p);                                // v6: รับไฟล์ทีละช่วง แล้วส่งต่อเข้า Drive
    if (p.del) return del(p.del);                               // ลบไฟล์ (ย้ายไปถังขยะ) — ใช้โดยแอดมินระบบเท่านั้น
    if (p.qb) return qbAdd(p);                                  // v5: สำรองรายการที่บันทึกค้างช่วงโควตา Firebase เต็ม
    if (p.qack) return qbSet(p.ids, 'self', '');                // เครื่องต้นทางส่งเองสำเร็จแล้ว
    if (p.qmark) return qbSet(p.ids, p.st || 'done', p.by || ''); // แอดมินนำเข้า/ข้าม
    if (p.qlist) return qbList();
    if (p.zone) return zonePhoto(root, p);                      // รูปตรวจเขตพื้นที่ / ห้องเรียน
    if (p.order) return orderFile(root, p);                     // คำสั่งโรงเรียน (แยกโฟลเดอร์ตามกลุ่มงาน)
    const folder = taskFolder(root, p);
    const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'application/octet-stream', p.name || 'file');
    const file = folder.createFile(blob);
    share(file);
    return out({ ok: true, id: file.getId(), url: file.getUrl(), name: file.getName(), folderUrl: folder.getUrl() });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}
function taskFolder(root, p) {
  let folder = root;
  if (p.year) folder = sub(folder, p.year);                 // ปีการศึกษา 2569
  if (p.dept) folder = sub(folder, p.dept);                 // กลุ่มบริหารวิชาการ
  if (p.sub)  folder = sub(folder, p.sub);                  // งานย่อย เช่น งานวัดผลและประเมินผล
  folder = sub(folder, p.task || 'งานอื่น ๆ');              // ชื่องาน เช่น ปพ.5 ครั้งที่ 1
  folder = sub(folder, p.group || 'ไม่ระบุกลุ่มสาระ');       // กลุ่มสาระ
  folder = sub(folder, p.teacher || 'ไม่ระบุชื่อ');          // ชื่อครู
  return folder;
}
function orderFolder(root, p) { let folder = sub(root, ORDER_FOLDER); if (p.year) folder = sub(folder, p.year); folder = sub(folder, p.dept || 'คำสั่งอื่น ๆ'); share(folder); return folder; }
// ---------------- v6: ไฟล์ใหญ่ (resumable upload) ----------------
// 1) rsStart: สร้างช่องรับไฟล์ใน Drive (โฟลเดอร์เดียวกับแบบปกติ) → คืน s = URL ของช่องรับไฟล์
// 2) rsChunk: แอปส่งไฟล์มาทีละช่วง (8 MB) สคริปต์ส่งต่อเข้า Drive · ช่วงสุดท้าย → แชร์ไฟล์ แล้วคืน id/url เหมือนแบบปกติ
function rsStart(root, p) {
  const folder = p.order ? orderFolder(root, p) : taskFolder(root, p), mime = p.mime || 'application/octet-stream';
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    payload: JSON.stringify({ name: p.name || ('file_' + Date.now()), parents: [folder.getId()], mimeType: mime }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(p.size || '') } });
  if (r.getResponseCode() !== 200) return out({ ok: false, error: 'เปิดช่องรับไฟล์ใน Drive ไม่สำเร็จ (' + r.getResponseCode() + ') ' + r.getContentText().slice(0, 200) });
  const h = r.getHeaders(), loc = h['Location'] || h['location'];
  return loc ? out({ ok: true, s: loc, folderUrl: folder.getUrl() }) : out({ ok: false, error: 'Drive ไม่ส่ง URL ช่องรับไฟล์กลับมา' });
}
function rsChunk(p) {
  if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(String(p.s || ''))) return out({ ok: false, error: 'ช่องรับไฟล์ไม่ถูกต้อง' });
  const bytes = Utilities.base64Decode(p.data || ''), start = Number(p.start) || 0, total = Number(p.total) || 0, end = start + bytes.length - 1;
  const r = UrlFetchApp.fetch(p.s, { method: 'put', payload: bytes, contentType: 'application/octet-stream', muteHttpExceptions: true, followRedirects: false,
    headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total } });
  const c = r.getResponseCode();
  if (c === 308) { const h = r.getHeaders(), rg = String(h['Range'] || h['range'] || ''), m = rg.match(/-(\d+)$/); return out({ ok: true, next: m ? Number(m[1]) + 1 : 0 }); }
  if (c === 200 || c === 201) { const meta = JSON.parse(r.getContentText() || '{}'), f = DriveApp.getFileById(meta.id); share(f);
    return out({ ok: true, done: true, id: meta.id, url: f.getUrl(), name: f.getName() }); }
  return out({ ok: false, error: 'Drive ตอบกลับ ' + c + ' ' + r.getContentText().slice(0, 200) });
}
// เรียกครั้งเดียวในหน้าแก้ไขสคริปต์ (เลือกฟังก์ชันนี้ → Run) เพื่ออนุญาตสิทธิ์ใหม่ของ v6 (เชื่อมต่อบริการภายนอก = Google Drive API)
function authorizeV6() { UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }); DriveApp.getRootFolder(); return 'ok'; }
// รูปตรวจเขต: p = { zone: 1, year: 'ปีการศึกษา 2569', month: '2569-10', name: '2026-10-20_ม.1-1_zone.jpg', data: base64 (ไม่มี data: นำหน้า), mime }
function zonePhoto(root, p) {
  let folder = sub(root, ZONE_FOLDER);
  if (p.year) folder = sub(folder, p.year);
  if (p.month) folder = sub(folder, p.month);
  const name = p.name || ('photo_' + Date.now() + '.jpg');
  // ถ้ามีไฟล์ชื่อเดิมอยู่แล้ว (ส่งซ้ำ) ให้ย้ายของเก่าไปถังขยะก่อน
  const old = folder.getFilesByName(name); while (old.hasNext()) old.next().setTrashed(true);
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg', name));
  share(file);
  const id = file.getId();
  // img = ลิงก์ที่ใส่ใน <img src> ได้โดยตรง · url = ลิงก์เปิดดูใน Drive
  return out({ ok: true, id, img: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200', url: file.getUrl(), name, folderUrl: folder.getUrl() });
}
// คำสั่งโรงเรียน: p = { order: 1, year: 'ปีการศึกษา 2569', dept: 'กลุ่มบริหารวิชาการ', name: 'คำสั่งที่ 319-2569 ....pdf', data: base64, mime }
function orderFile(root, p) {
  const folder = orderFolder(root, p);   // ให้ครูเปิดโฟลเดอร์ของกลุ่มงานดูคำสั่งย้อนหลังได้
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'application/pdf', p.name || ('คำสั่ง_' + Date.now() + '.pdf')));
  share(file);
  return out({ ok: true, id: file.getId(), url: file.getUrl(), name: file.getName(), folderUrl: folder.getUrl() });
}
function del(id) {
  try { const f = DriveApp.getFileById(id); f.setTrashed(true); return out({ ok: true, id }); }
  catch (e) { return out({ ok: false, error: 'ไม่พบไฟล์ ' + id }); }
}
// แชร์ให้เปิดดูได้: ลองแบบทุกคนที่มีลิงก์ → ถ้าโดเมนห้าม ลองเฉพาะคนในโรงเรียน → ถ้ายังไม่ได้ก็ข้าม (ไฟล์ยังอยู่ใน Drive แอดมินเปิดได้)
function share(file) {
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e1) { try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {} }
}
function doGet() { return out({ ok: true, service: 'SMART SPK upload v6' }); }
// ---------------- v5: คิวสำรอง (Google Sheet "SMART SPK คิวสำรอง" ในโฟลเดอร์หลัก) ----------------
// คอลัมน์: id | เวลา | ผู้บันทึก | uid | ข้อมูลที่บันทึก | ops (JSON) | สถานะ wait/self/done/skip | โดย | อัปเดต
function qbSheet() {
  const props = PropertiesService.getScriptProperties(); let id = props.getProperty('QB_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('SMART SPK คิวสำรอง (ช่วงโควตาเต็ม)'); props.setProperty('QB_ID', ss.getId());
    try { DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(ROOT_FOLDER_ID)); } catch (e) {}
    const sh0 = ss.getSheets()[0]; sh0.setName('คิว'); sh0.appendRow(['id', 'เวลา', 'ผู้บันทึก', 'uid', 'ข้อมูลที่บันทึก', 'ops', 'สถานะ', 'โดย', 'อัปเดต']); sh0.setFrozenRows(1); }
  return ss.getSheetByName('คิว') || ss.getSheets()[0];
}
function qbAdd(p) { const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const sh = qbSheet(); sh.appendRow([String(p.id || ''), String(p.at || new Date().toISOString()), String(p.user || ''), String(p.uid || ''), String(p.paths || '').slice(0, 2000), String(p.ops || '').slice(0, 49000), 'wait', '', new Date().toISOString()]); return out({ ok: true }); }
  finally { lock.releaseLock(); } }
function qbSet(ids, st, by) { ids = (ids || []).map(String); if (!ids.length) return out({ ok: true, n: 0 }); const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const sh = qbSheet(), n = sh.getLastRow(); if (n < 2) return out({ ok: true, n: 0 }); const col = sh.getRange(2, 1, n - 1, 1).getValues(); let k = 0;
    col.forEach((r, i) => { if (ids.indexOf(String(r[0])) >= 0) { const cur = sh.getRange(i + 2, 7).getValue(); if (st === 'self' && cur !== 'wait') return; sh.getRange(i + 2, 7, 1, 3).setValues([[st, by, new Date().toISOString()]]); k++; } });
    return out({ ok: true, n: k }); } finally { lock.releaseLock(); } }
function qbList() { const sh = qbSheet(), n = sh.getLastRow(); if (n < 2) return out({ ok: true, rows: [] });
  const v = sh.getRange(2, 1, n - 1, 9).getValues().slice(-1500);
  return out({ ok: true, rows: v.map(r => ({ id: String(r[0]), at: String(r[1]), user: String(r[2]), uid: String(r[3]), paths: String(r[4]), ops: String(r[5]), st: String(r[6] || 'wait'), by: String(r[7] || '') })).reverse() }); }
function sub(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function out(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
