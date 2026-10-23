// ระบบตรวจเขตพื้นที่ (SMART SPK · Zone Check)
// ใช้ Firebase โปรเจกต์ spk-score-system และบัญชีผู้ใช้ชุดเดียวกับ SMART SPK
// collection ใหม่: ss_zone_cfg, ss_zone_chk, ss_zone_photo, ss_zone_ded
// เปิด ?demo เพื่อทดลองด้วยข้อมูลจำลอง (ไม่แตะฐานข้อมูลจริง)

const FB_CONFIG = {
  apiKey: "AIzaSyCyjqbIFbG365X_O8w04Padi5eH6BITKTU",
  authDomain: "spk-score-system.firebaseapp.com",
  projectId: "spk-score-system",
  storageBucket: "spk-score-system.firebasestorage.app",
  messagingSenderId: "568980787667",
  appId: "1:568980787667:web:daa2a6906b128271151f26",
};
const FB_VER = "10.7.0";
const MAIL = "smartspk.app";
const COL = {
  cfg: "ss_zone_cfg", chk: "ss_zone_chk", photo: "ss_zone_photo", ded: "ss_zone_ded",
  users: "ss_users", usernames: "ss_usernames", config: "ss_config", roster: "ss_roster",
  area: "ss_area", behavior: "ss_behavior", stu: "ss_stu", legacy: "students",
};
const DEMO = new URLSearchParams(location.search).has("demo");
const DEFAULT_CFG = {
  zones: {},                    // { "2-1": { cls: "ม.2/1", area: "..." } }
  reasons: ["มีขยะ", "ไม่ได้กวาด / มีใบไม้", "ถังขยะล้น / ไม่ได้เทขยะ", "ไม่มีนักเรียนมาทำเวร", "อื่น ๆ"],
  roomReasons: ["พื้นห้องสกปรก / มีขยะ", "โต๊ะ-เก้าอี้ไม่เป็นระเบียบ", "กระดานไม่ได้ลบ", "ถังขยะล้น / ไม่ได้เทขยะ", "ไม่ปิดไฟ-พัดลม", "อื่น ๆ"],
  roomDeductDetail: "ไม่ดูแลความสะอาดห้องเรียน (ตรวจไม่ผ่านซ้ำ)",
  failLimit: 2,                 // ไม่ผ่านกี่ครั้ง
  windowDays: 7,                // ภายในกี่วัน
  deductPts: 5,
  deductDetail: "ไม่ดูแลเขตพื้นที่รับผิดชอบ (ตรวจไม่ผ่านซ้ำ)",
};
const KINDS = { zone: "เขตพื้นที่", room: "ห้องเรียน" };
const DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const H = (cls) => { const m = String(cls || "").match(/(\d)\s*\/\s*(\d{1,2})/); return m ? `${m[1]}-${+m[2]}` : ""; };
const clsOf = (ck) => { const [g, r] = ck.split("-"); return `ม.${g}/${r}`; };
const ckSort = (a, b) => { const [g1, r1] = a.split("-").map(Number), [g2, r2] = b.split("-").map(Number); return g1 - g2 || r1 - r2; };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const thDate = (s, withDay = true) => { const d = new Date(s + "T12:00:00"); return `${withDay ? "วัน" + DAYS[d.getDay()] + " " : ""}${d.getDate()} ${MONTHS[d.getMonth() + 1]} ${d.getFullYear() + 543}`; };
const thShort = (s) => { const d = new Date(s + "T12:00:00"); return `${d.getDate()} ${MONTHS[d.getMonth() + 1]} ${String(d.getFullYear() + 543).slice(2)}`; };
const uid36 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const vt = (date) => "m" + date.slice(0, 7).replace("-", "");
const INC = (n) => ({ __inc: n });
function toast(msg, ms = 2200) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function errText(e) {
  const c = (e && (e.code || e.message)) || String(e);
  if (/wrong-password|invalid-credential|invalid-login/.test(c)) return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
  if (/user-not-found|no-user/.test(c)) return "ไม่พบชื่อผู้ใช้นี้";
  if (/too-many-requests/.test(c)) return "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่";
  if (/permission/.test(c)) return "ไม่มีสิทธิ์ทำรายการนี้ (ตรวจกฎ Firestore ตามคู่มือ)";
  if (/network|unavailable|offline/.test(c)) return "เชื่อมต่ออินเทอร์เน็ตไม่ได้";
  if (/email-already-in-use/.test(c)) return "ชื่อผู้ใช้นี้มีอยู่แล้ว";
  return c;
}

// ---------------------------------------------------------------- backend: Firebase
async function firebaseBackend() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [A, U, F] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
  const app = A.initializeApp(FB_CONFIG);
  const auth = U.getAuth(app);
  const db = F.getFirestore(app);
  const ref = (p) => F.doc(db, ...p.split("/"));
  const conv = (v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("__inc" in v) return F.increment(v.__inc);
      if ("__now" in v) return F.serverTimestamp();
      const o = {}; for (const k in v) o[k] = conv(v[k]); return o;
    }
    return v;
  };
  return {
    demo: false,
    async login(email, pw) { return (await U.signInWithEmailAndPassword(auth, email, pw)).user.uid; },
    logout: () => U.signOut(auth),
    onAuth: (cb) => U.onAuthStateChanged(auth, (u) => cb(u ? u.uid : null)),
    async get(p) { const s = await F.getDoc(ref(p)); return s.exists() ? s.data() : null; },
    async query(col, wheres = []) {
      const q = F.query(F.collection(db, col), ...wheres.map(([a, op, b]) => F.where(a, op, b)));
      return (await F.getDocs(q)).docs.map((d) => ({ _id: d.id, ...d.data() }));
    },
    async write(ops) {
      for (let i = 0; i < ops.length; i += 450) {
        const b = F.writeBatch(db);
        ops.slice(i, i + 450).forEach((o) => o.del ? b.delete(ref(o.path)) : b.set(ref(o.path), conv(o.data), { merge: o.merge !== false }));
        await b.commit();
      }
    },
    async createUser(email, pw) {
      const name = "creator-" + uid36(), sec = A.initializeApp(FB_CONFIG, name), sa = U.getAuth(sec);
      try { return (await U.createUserWithEmailAndPassword(sa, email, pw)).user.uid; }
      finally { await U.signOut(sa).catch(() => {}); await A.deleteApp(sec).catch(() => {}); }
    },
  };
}

// ---------------------------------------------------------------- backend: demo (memory)
function demoBackend() {
  const store = new Map();
  const put = (p, d) => store.set(p, JSON.parse(JSON.stringify(d)));
  const users = { admin: ["ครูศาสตราวุฒิ (แอดมิน)", "admin", ""], council01: ["นางสาวสุวรินทร์ ลาลู่", "council", ""], t21: ["ครูที่ปรึกษา ม.2/1", "teacher", "ม.2/1"] };
  const pw = {};
  Object.entries(users).forEach(([u, [name, role, homeroom]], i) => {
    const id = "u" + i; pw[`${u}@${MAIL}`] = ["1234", id];
    put(`${COL.users}/${id}`, { username: u, email: `${u}@${MAIL}`, name, role, homeroom, disabled: false });
    put(`${COL.usernames}/${u}`, { email: `${u}@${MAIL}`, uid: id });
  });
  put(`${COL.config}/settings`, { term: "2/2569", terms: [{ label: "2/2569", start: "2026-11-01" }], rooms: { 1: 11, 2: 11, 3: 11, 4: 7, 5: 8, 6: 8 },
    areaByClass: { "ม.2/1": "สนามฟุตบอล โค้งซ้ายบน", "ม.3/5": "รอบอาคารพุทธวิโมกข์" }, minusRules: [["หนีเรียน", 10]], syncLegacy: true });
  const fn = ["ด.ช.กิตติ", "ด.ญ.กมลชนก", "ด.ช.ธนกร", "ด.ญ.พิมพ์ชนก", "ด.ช.ภูมิ", "ด.ญ.อรอุมา"];
  const L2 = {};
  fn.forEach((n, i) => { const id = String(16001 + i); L2[id] = { id, no: i + 1, prefix: "", name: n + " ใจดี", cls: "ม.2/1", key: "k" + id, level: 2, status: "active" }; });
  put(`${COL.roster}/L2`, { s: L2 });
  const d0 = today();
  [[-1, true], [-2, false], [-4, false], [-6, true]].forEach(([dd, ok]) => {
    const date = addDays(d0, dd);
    put(`${COL.chk}/${date}_2-1_zone`, { t: "zone", date, cls: "ม.2/1", ck: "2-1", ok, reasons: ok ? [] : ["มีขยะ"], note: "", hasPhoto: false, by: "นางสาวสุวรินทร์ ลาลู่", byUid: "u1", at: Date.now() });
    if (!ok) put(`${COL.area}/${date}_2-1`, { e: { 16001: true, 16002: false, 16003: true, 16004: false } });
  });
  [["3-5", -1, false], ["1-1", -1, true], ["6-2", -1, true], ["4-3", -2, true]].forEach(([ck, dd, ok]) => {
    const date = addDays(d0, dd);
    put(`${COL.chk}/${date}_${ck}_zone`, { t: "zone", date, cls: clsOf(ck), ck, ok, reasons: ok ? [] : ["ไม่ได้กวาด / มีใบไม้"], note: "", hasPhoto: false, by: "นางสาวสุวรินทร์ ลาลู่", byUid: "u1", at: Date.now() });
  });
  [["2-1", -1, false], ["2-1", -3, false], ["1-1", -1, true]].forEach(([ck, dd, ok]) => {
    const date = addDays(d0, dd);
    put(`${COL.chk}/${date}_${ck}_room`, { t: "room", date, cls: clsOf(ck), ck, ok, reasons: ok ? [] : ["กระดานไม่ได้ลบ"], note: "", hasPhoto: false, by: "นายปัญญา รักษา", byUid: "u1", at: Date.now() });
  });
  let cur = null; const subs = [];
  const apply = (obj, data) => {
    for (const k in data) {
      const v = data[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if ("__inc" in v) obj[k] = (+obj[k] || 0) + v.__inc;
        else if ("__now" in v) obj[k] = Date.now();
        else { obj[k] = obj[k] && typeof obj[k] === "object" ? obj[k] : {}; apply(obj[k], v); }
      } else obj[k] = v;
    }
  };
  const B = {
    demo: true, store,
    async login(email, p) { const r = pw[email]; if (!r || r[0] !== p) { const e = new Error("auth/invalid-credential"); e.code = e.message; throw e; } cur = r[1]; subs.forEach((f) => f(cur)); return cur; },
    async logout() { cur = null; subs.forEach((f) => f(null)); },
    onAuth(cb) { subs.push(cb); setTimeout(() => cb(cur), 0); },
    async get(p) { const d = store.get(p); return d ? JSON.parse(JSON.stringify(d)) : null; },
    async query(col, wheres = []) {
      const out = [];
      for (const [p, d] of store) {
        const [c, id] = p.split("/"); if (c !== col) continue;
        if (wheres.every(([a, op, b]) => op === "==" ? d[a] === b : op === ">=" ? d[a] >= b : op === "<=" ? d[a] <= b : true)) out.push({ _id: id, ...JSON.parse(JSON.stringify(d)) });
      }
      return out;
    },
    async write(ops) {
      ops.forEach((o) => {
        if (o.del) return store.delete(o.path);
        const base = o.merge === false ? {} : (store.get(o.path) || {});
        apply(base, o.data); store.set(o.path, base);
      });
    },
    async createUser(email, p) { if (pw[email]) { const e = new Error("auth/email-already-in-use"); e.code = e.message; throw e; } const id = "u" + uid36(); pw[email] = [p, id]; return id; },
  };
  window.__demo = B;
  return B;
}

// ---------------------------------------------------------------- state
const S = { B: null, uid: null, me: null, settings: null, cfg: null, route: "", date: today(), checks: {}, kind: "zone" };
const kindOf = (x) => x.t || "zone";
const chkId = (date, ck, t) => `${date}_${ck}_${t}`;
const reasonsOf = (t) => (t === "room" ? S.cfg.roomReasons : S.cfg.reasons) || [];
const roomOf = (ck) => (S.cfg.zones[ck] && S.cfg.zones[ck].room) || "";
const placeOf = (ck, t) => t === "room" ? (roomOf(ck) ? "ห้อง " + roomOf(ck) : "ห้องเรียนประจำ") : (areaOf(ck) || "ดูแผนผัง");
const isAdmin = () => S.me && (S.me.role === "admin" || S.me.adminAff || S.me.affairs);
const isSuper = () => S.me && S.me.role === "admin";
const isCouncil = () => S.me && S.me.role === "council";
const isTeacher = () => S.me && !isCouncil() && S.me.role !== "parent";

function allClasses() {
  const rooms = (S.settings && S.settings.rooms) || { 1: 11, 2: 11, 3: 11, 4: 8, 5: 8, 6: 8 };
  const out = [];
  for (let g = 1; g <= 6; g++) for (let r = 1; r <= (+rooms[g] || 0); r++) out.push(`${g}-${r}`);
  return out;
}
const areaOf = (ck) => (S.cfg.zones[ck] && S.cfg.zones[ck].area) || (S.settings && S.settings.areaByClass && S.settings.areaByClass[clsOf(ck)]) || "";

async function loadCfg() {
  const c = await S.B.get(`${COL.cfg}/main`);
  S.cfg = { ...DEFAULT_CFG, ...(c || {}) };
  S.cfg.zones = S.cfg.zones || {};
}
async function loadSettings() {
  // นักเรียนสภาฯ อ่าน ss_config/settings ไม่ได้ (ตามกฎ) จึงใช้ข้อมูลที่แอดมินคัดลอกไว้ใน ss_zone_cfg/main
  try { S.settings = await S.B.get(`${COL.config}/settings`); } catch (e) { S.settings = null; }
  if (!S.settings) S.settings = { rooms: S.cfg.rooms || undefined, areaByClass: {} };
}
async function loadChecks(date) {
  const list = await S.B.query(COL.chk, [["date", "==", date]]);
  S.checks[date] = Object.fromEntries(list.map((x) => [`${x.ck}_${kindOf(x)}`, x]));
  return S.checks[date];
}

// ---------------------------------------------------------------- shell
function shell(inner) {
  const tabs = [];
  if (isCouncil() || isAdmin()) tabs.push(["check", "ตรวจเขต"]);
  if (isTeacher() && S.me.homeroom) tabs.push(["mine", "ห้องของฉัน"]);
  if (isAdmin() || isTeacher()) tabs.push(["report", "รายงาน"]);
  if (isAdmin()) tabs.push(["admin", "ตั้งค่า"]);
  tabs.push(["map", "แผนผัง"]);
  const roleName = isCouncil() ? "สภานักเรียน" : isSuper() ? "ผู้ดูแลระบบ" : isAdmin() ? "แอดมินกิจการ" : "ครู";
  $("#app").innerHTML = `
  <header class="top"><img src="../logo.png" alt="">
    <div><div class="t1">ตรวจเขตพื้นที่</div><div class="t2">${esc(S.me.name || S.me.username)} · ${roleName}${S.B.demo ? " · โหมดทดลอง" : ""}</div></div>
    <div class="sp"></div><a href="../" class="noprint" style="color:#fff;font-size:17px;margin-right:4px">SMART SPK</a><button id="logout">ออก</button></header>
  <nav class="tabs">${tabs.map(([k, t]) => `<a href="#${k}" class="${S.route === k ? "on" : ""}">${t}</a>`).join("")}</nav>
  <main id="main">${inner}</main>`;
  $("#logout").onclick = () => S.B.logout();
}

async function route() {
  const def = isCouncil() ? "check" : isAdmin() ? "report" : S.me.homeroom ? "mine" : "report";
  let r = (location.hash || "").slice(1) || def;
  const allowed = { check: isCouncil() || isAdmin(), mine: isTeacher() && !!S.me.homeroom, report: isAdmin() || isTeacher(), admin: isAdmin(), map: true };
  if (!allowed[r]) r = def;
  S.route = r;
  shell(`<div class="card muted">กำลังโหลด…</div>`);
  try { await PAGES[r](); } catch (e) { console.error(e); $("#main").innerHTML = `<div class="card"><h2>เกิดข้อผิดพลาด</h2><p>${esc(errText(e))}</p></div>`; }
}
window.addEventListener("hashchange", () => S.me && route());

// ---------------------------------------------------------------- login
function loginView(msg = "") {
  $("#app").innerHTML = `
  <div class="login card">
    <div class="logo"><img src="../logo.png" alt=""><h2 style="margin:4px 0 0">ระบบตรวจเขตพื้นที่</h2>
    <div class="muted">SMART SPK · โรงเรียนโซ่พิสัยพิทยาคม</div></div>
    ${S.B.demo ? `<div class="banner small">โหมดทดลอง: admin / council01 / t21 · รหัส 1234</div>` : ""}
    <form id="lf">
      <label class="f"><span>ชื่อผู้ใช้ (เหมือน SMART SPK)</span><input type="text" name="u" autocomplete="username" autocapitalize="none" required></label>
      <label class="f"><span>รหัสผ่าน</span><input type="password" name="p" autocomplete="current-password" required></label>
      <p id="lmsg" style="color:var(--bad);min-height:1.2em;margin:4px 0">${esc(msg)}</p>
      <button class="btn block">เข้าสู่ระบบ</button>
    </form>
  </div>`;
  $("#lf").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target), u = String(f.get("u")).trim().toLowerCase(), p = String(f.get("p"));
    const btn = $("#lf button"); btn.disabled = true; $("#lmsg").textContent = "";
    try {
      let email = u.includes("@") ? u : null;
      if (!email) { const m = await S.B.get(`${COL.usernames}/${u}`); email = m && m.email ? m.email : `${u}@${MAIL}`; }
      await S.B.login(email, p);
    } catch (e) { $("#lmsg").textContent = errText(e); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- page: ตรวจเขต (สภานักเรียน)
async function pageCheck() {
  const date = S.date;
  const all = await loadChecks(date), K = S.kind;
  const checks = Object.fromEntries(Object.entries(all).filter(([k]) => k.endsWith("_" + K)).map(([k, v]) => [v.ck, v]));
  const cls = allClasses();
  const done = cls.filter((c) => checks[c]).length, fails = cls.filter((c) => checks[c] && !checks[c].ok).length;
  const doneOther = cls.filter((c) => all[`${c}_${K === "zone" ? "room" : "zone"}`]).length;
  const isToday = date === today();
  const grades = [1, 2, 3, 4, 5, 6].map((g) => {
    const list = cls.filter((c) => c.startsWith(g + "-"));
    if (!list.length) return "";
    return `<div class="grade"><div class="gh">ม.${g}</div><div class="zones">${list.map((c) => {
      const x = checks[c]; const st = x ? (x.ok ? "ok" : "bad") : "";
      return `<div class="zone ${st}" data-z="${c}"><b>${g}/${c.split("-")[1]}</b><span>${x ? (x.ok ? "✓ ผ่าน" : "✗ ไม่ผ่าน") : esc((K === "zone" ? areaOf(c) : roomOf(c) && "ห้อง " + roomOf(c)) || "ยังไม่ตรวจ")}</span></div>`;
    }).join("")}</div></div>`;
  }).join("");
  $("#main").innerHTML = `
  <div class="card">
    <div class="row"><h2 class="grow" style="margin:0">ตรวจ${KINDS[K]}</h2>
      <input type="date" id="dt" value="${date}" max="${today()}"></div>
    <div class="row" style="margin:6px 0">${Object.entries(KINDS).map(([k, t]) => `<button class="btn ${k === K ? "" : "gray"}" data-kind="${k}">${k === "zone" ? "🧹" : "🏫"} ${t}${k === K ? "" : ` <span class="small">(${doneOther}/${cls.length})</span>`}</button>`).join("")}</div>
    <div class="muted">${thDate(date)}${isToday ? "" : " · <b style='color:var(--bad)'>ไม่ใช่วันนี้</b>"}</div>
    <div class="stat" style="margin-top:8px">
      <div><b>${done}<span class="small muted">/${cls.length}</span></b><span class="small">ตรวจแล้ว</span></div>
      <div><b style="color:var(--ok)">${done - fails}</b><span class="small">ผ่าน</span></div>
      <div><b style="color:var(--bad)">${fails}</b><span class="small">ไม่ผ่าน</span></div>
      <div><b style="color:var(--none)">${cls.length - done}</b><span class="small">ยังไม่ตรวจ</span></div>
    </div>
    <div class="bar" style="margin-top:8px"><i style="width:${cls.length ? (done / cls.length) * 100 : 0}%"></i></div>
    <p class="small muted" style="margin:6px 0 0">แตะที่ห้องเพื่อบันทึกผล${KINDS[K]} · ถ้าไม่ผ่านต้องถ่ายรูปเป็นหลักฐาน · ผลเขตพื้นที่และห้องเรียนบันทึกแยกกัน</p>
    ${grades}
  </div>`;
  $("#dt").onchange = (e) => { S.date = e.target.value || today(); pageCheck(); };
  $$("[data-kind]").forEach((b) => b.onclick = () => { S.kind = b.dataset.kind; pageCheck(); });
  $$("[data-z]").forEach((el) => el.onclick = () => openCheck(el.dataset.z, date));
}

async function openCheck(ck, date) {
  const K = S.kind, id = chkId(date, ck, K);
  const cur = (S.checks[date] || {})[`${ck}_${K}`] || null;
  let photo = null;
  if (cur && cur.hasPhoto) { try { const p = await S.B.get(`${COL.photo}/${id}`); photo = p && p.img; } catch (e) {} }
  let ok = cur ? cur.ok : null;
  const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet">
    <div class="row"><h2 class="grow">${K === "zone" ? "🧹" : "🏫"} ${esc(clsOf(ck))} · ${KINDS[K]}</h2><button class="btn gray" data-x>ปิด</button></div>
    <div class="muted">${K === "zone" ? "เขต" : "สถานที่"}: ${esc(placeOf(ck, K))} · ${thDate(date)}</div>
    ${cur ? `<div class="small muted">บันทึกล่าสุดโดย ${esc(cur.by || "-")}</div>` : ""}
    <div class="choice"><button class="ok ${ok === true ? "on" : ""}" data-ok="1">✓ ผ่าน</button><button class="bad ${ok === false ? "on" : ""}" data-ok="0">✗ ไม่ผ่าน</button></div>
    <div id="failBox" class="${ok === false ? "" : "hidden"}">
      <div class="small muted">สาเหตุ (เลือกได้หลายข้อ)</div>
      <div class="chips">${reasonsOf(K).map((r) => `<label><input type="checkbox" value="${esc(r)}" ${cur && (cur.reasons || []).includes(r) ? "checked" : ""}>${esc(r)}</label>`).join("")}</div>
      <label class="f"><span>หมายเหตุ</span><textarea id="note" rows="2">${esc(cur ? cur.note : "")}</textarea></label>
      <div class="photo-box"><label class="btn light" style="display:inline-block">📷 ถ่ายรูป / เลือกรูป<input type="file" accept="image/*" capture="environment" id="ph" hidden></label>
        <div id="phInfo" class="small muted">${photo ? "มีรูปแล้ว (ถ่ายใหม่เพื่อแทนที่)" : "ต้องมีรูปหลักฐาน"}</div>${photo ? `<img src="${photo}" alt="">` : ""}</div>
    </div>
    <button class="btn block" id="save" style="margin-top:12px" ${ok === null ? "disabled" : ""}>บันทึกผลตรวจ</button>
    ${cur && isAdmin() ? `<button class="btn gray block" id="del" style="margin-top:8px">ลบผลตรวจนี้</button>` : ""}
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  $("[data-x]", bg).onclick = close;
  $$("[data-ok]", bg).forEach((b) => b.onclick = () => {
    ok = b.dataset.ok === "1";
    $$("[data-ok]", bg).forEach((x) => x.classList.toggle("on", x === b));
    $("#failBox", bg).classList.toggle("hidden", ok);
    $("#save", bg).disabled = false;
  });
  let newPhoto = null;
  $("#ph", bg).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#phInfo", bg).textContent = "กำลังย่อรูป…";
    try {
      newPhoto = await shrinkImage(f);
      const box = $(".photo-box", bg); $("img", box) && $("img", box).remove();
      const im = document.createElement("img"); im.src = newPhoto; box.appendChild(im);
      $("#phInfo", bg).textContent = `ได้รูปแล้ว (${Math.round(newPhoto.length * 0.75 / 1024)} KB)`;
    } catch (err) { $("#phInfo", bg).textContent = "อ่านรูปไม่ได้ ลองใหม่อีกครั้ง"; }
  };
  $("#save", bg).onclick = async () => {
    const reasons = $$(".chips input:checked", bg).map((i) => i.value);
    const note = $("#note", bg) ? $("#note", bg).value.trim() : "";
    if (ok === false && !newPhoto && !photo) return toast("กรุณาถ่ายรูปหลักฐานเขตที่ไม่ผ่าน");
    if (ok === false && !reasons.length && !note) return toast("กรุณาเลือกสาเหตุอย่างน้อย 1 ข้อ");
    const rec = { t: K, date, cls: clsOf(ck), ck, area: K === "zone" ? areaOf(ck) : roomOf(ck), ok, reasons: ok ? [] : reasons, note: ok ? "" : note,
      hasPhoto: !ok && !!(newPhoto || photo), by: S.me.name || S.me.username, byUid: S.uid, at: { __now: 1 } };
    const ops = [{ path: `${COL.chk}/${id}`, data: rec, merge: false }];
    if (!ok && newPhoto) ops.push({ path: `${COL.photo}/${id}`, data: { img: newPhoto, date, ck, byUid: S.uid }, merge: false });
    if (ok && photo) ops.push({ path: `${COL.photo}/${id}`, del: true });
    $("#save", bg).disabled = true; $("#save", bg).textContent = "กำลังบันทึก…";
    try { await S.B.write(ops); toast(`บันทึก${KINDS[K]} ${clsOf(ck)} : ${ok ? "ผ่าน" : "ไม่ผ่าน"}`); close(); pageCheck(); }
    catch (e) { toast(errText(e), 3500); $("#save", bg).disabled = false; $("#save", bg).textContent = "บันทึกผลตรวจ"; }
  };
  const del = $("#del", bg);
  if (del) del.onclick = async () => {
    if (!confirm(`ลบผลตรวจ${KINDS[K]} ${clsOf(ck)} วันที่ ${thShort(date)} ?`)) return;
    await S.B.write([{ path: `${COL.chk}/${id}`, del: true }, { path: `${COL.photo}/${id}`, del: true }]);
    toast("ลบแล้ว"); close(); pageCheck();
  };
}

function shrinkImage(file, maxBytes = 90 * 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight, side = 1000, q = 0.72, out = "";
      for (let i = 0; i < 8; i++) {
        const k = Math.min(1, side / Math.max(w, h)), c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", q);
        if (out.length * 0.75 <= maxBytes) break;
        if (q > 0.45) q -= 0.1; else side = Math.round(side * 0.8);
      }
      URL.revokeObjectURL(url); resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

// ---------------------------------------------------------------- page: ห้องของฉัน (ครูที่ปรึกษา)
async function pageMine() {
  const ck = H(S.me.homeroom);
  const list = (await S.B.query(COL.chk, [["ck", "==", ck]])).sort((a, b) => b.date.localeCompare(a.date));
  const start = termStart();
  const inTerm = list.filter((x) => x.date >= start);
  const statBox = (t) => {
    const xs = inTerm.filter((x) => kindOf(x) === t), f = xs.filter((x) => !x.ok).length;
    return `<h3>${t === "zone" ? "🧹" : "🏫"} ${KINDS[t]} <span class="small muted">· ${esc(placeOf(ck, t))}</span></h3><div class="stat">
      <div><b>${xs.length}</b><span class="small">ครั้งที่ตรวจ</span></div>
      <div><b style="color:var(--ok)">${xs.length - f}</b><span class="small">ผ่าน</span></div>
      <div><b style="color:var(--bad)">${f}</b><span class="small">ไม่ผ่าน</span></div>
      <div><b>${xs.length ? Math.round(((xs.length - f) / xs.length) * 100) : 0}%</b><span class="small">อัตราผ่าน</span></div></div>`;
  };
  $("#main").innerHTML = `
  <div class="card"><h2>ผลตรวจความสะอาด ห้อง ${esc(clsOf(ck))}</h2>
    <div class="muted">ภาคเรียน ${esc((S.settings && S.settings.term) || "")} (ตั้งแต่ ${thShort(start)})</div>
    ${statBox("zone")}${statBox("room")}
  </div>
  <div class="card"><h3 style="margin-top:0">ประวัติการตรวจ</h3>
    ${list.length ? `<div class="tbl"><table><tr><th>วันที่</th><th>ประเภท</th><th class="c">ผล</th><th>สาเหตุ / หมายเหตุ</th><th>ผู้ตรวจ</th><th></th></tr>
    ${list.map((x) => `<tr><td style="white-space:nowrap">${thShort(x.date)}</td><td style="white-space:nowrap">${KINDS[kindOf(x)]}</td><td class="c"><span class="pill ${x.ok ? "ok" : "bad"}">${x.ok ? "ผ่าน" : "ไม่ผ่าน"}</span></td>
      <td>${esc([...(x.reasons || []), x.note].filter(Boolean).join(", "))}</td><td class="small">${esc(x.by || "")}</td>
      <td>${x.hasPhoto ? `<button class="btn light" data-ph="${x._id}">รูป</button>` : ""}</td></tr>`).join("")}</table></div>`
    : `<p class="muted">ยังไม่มีผลการตรวจ</p>`}
  </div>`;
  bindPhotoButtons();
}
function bindPhotoButtons() {
  $$("[data-ph]").forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const p = await S.B.get(`${COL.photo}/${b.dataset.ph}`).catch(() => null);
    b.disabled = false;
    if (!p) return toast("ไม่พบรูป");
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    const [d, ck, t] = b.dataset.ph.split("_");
    bg.innerHTML = `<div class="sheet"><div class="row"><h2 class="grow">${esc(clsOf(ck))} · ${KINDS[t || "zone"]} · ${thShort(d)}</h2><button class="btn gray">ปิด</button></div><img class="thumb" src="${p.img}" alt=""></div>`;
    bg.onclick = (e) => { if (e.target === bg || e.target.tagName === "BUTTON") bg.remove(); };
    document.body.appendChild(bg);
  });
}
function termStart() {
  const s = S.settings || {};
  const t = (s.terms || []).find((x) => x.label === s.term);
  const st = t && t.start;
  return st && st <= today() ? st : addDays(today(), -120);
}

// ---------------------------------------------------------------- page: รายงาน
const R = { from: null, to: null, kind: "zone" };
async function pageReport() {
  if (!R.from) { R.to = today(); R.from = addDays(R.to, -6); }
  const K = R.kind;
  const listAll = await S.B.query(COL.chk, [["date", ">=", R.from], ["date", "<=", R.to]]);
  const list = listAll.filter((x) => kindOf(x) === K);
  const ded = isAdmin() ? await S.B.query(COL.ded, []).catch(() => []) : [];
  const dedIds = new Set(ded.flatMap((d) => d.failIds || []));
  const cls = allClasses();
  const myCk = S.me.homeroom ? H(S.me.homeroom) : "";
  const byCls = Object.fromEntries(cls.map((c) => [c, []]));
  list.forEach((x) => byCls[x.ck] && byCls[x.ck].push(x));
  const rows = cls.map((c) => {
    const xs = byCls[c].sort((a, b) => a.date.localeCompare(b.date)), n = xs.length, f = xs.filter((x) => !x.ok).length;
    // ไม่ผ่านซ้ำ: ไม่ผ่าน >= failLimit ครั้ง ภายใน windowDays วัน (ที่ยังไม่ได้หักคะแนน)
    const openFails = xs.filter((x) => !x.ok && !dedIds.has(x._id));
    let flag = null;
    for (let i = 0; i < openFails.length; i++) {
      const win = openFails.filter((y) => y.date <= openFails[i].date && y.date > addDays(openFails[i].date, -S.cfg.windowDays));
      if (win.length >= S.cfg.failLimit) flag = win;
    }
    return { ck: c, n, f, p: n - f, rate: n ? (n - f) / n : null, flag, xs };
  });
  const ranked = rows.filter((r) => r.n).sort((a, b) => b.rate - a.rate || b.p - a.p || ckSort(a.ck, b.ck));
  const rank = Object.fromEntries(ranked.map((r, i) => [r.ck, i + 1]));
  const flagged = rows.filter((r) => r.flag);
  const days = Math.round((new Date(R.to) - new Date(R.from)) / 864e5) + 1;
  let schoolDays = 0; for (let d = R.from; d <= R.to; d = addDays(d, 1)) { const w = new Date(d + "T12:00:00").getDay(); if (w > 0 && w < 6) schoolDays++; }
  const total = list.length, totalF = list.filter((x) => !x.ok).length;
  const presets = [["วันนี้", 0], ["7 วัน", 6], ["30 วัน", 29], ["ภาคเรียนนี้", -1]];
  $("#main").innerHTML = `
  <div class="card">
    <div class="row"><h2 class="grow" style="margin:0">รายงานผลตรวจ${KINDS[K]}</h2>
      <button class="btn light noprint" id="xls">⬇ Excel</button><button class="btn light noprint" id="pdf">🖨 PDF</button></div>
    <div class="row noprint" style="margin-top:6px">${Object.entries(KINDS).map(([k, t]) => `<button class="btn ${k === K ? "" : "gray"}" data-kind="${k}">${k === "zone" ? "🧹" : "🏫"} ${t}</button>`).join("")}</div>
    <div class="row noprint" style="margin-top:6px">
      <input type="date" id="rf" value="${R.from}"> ถึง <input type="date" id="rt" value="${R.to}" max="${today()}">
      ${presets.map(([t, n]) => `<button class="btn gray" data-pre="${n}">${t}</button>`).join("")}</div>
    <div class="muted" style="margin-top:4px">ช่วง ${thDate(R.from, false)} – ${thDate(R.to, false)} (${days} วัน · วันเรียน ${schoolDays} วัน)</div>
    <div class="stat" style="margin-top:8px">
      <div><b>${total}</b><span class="small">ครั้งที่ตรวจ</span></div>
      <div><b style="color:var(--ok)">${total - totalF}</b><span class="small">ผ่าน</span></div>
      <div><b style="color:var(--bad)">${totalF}</b><span class="small">ไม่ผ่าน</span></div>
      <div><b style="color:#c2410c">${flagged.length}</b><span class="small">ห้องไม่ผ่านซ้ำ</span></div>
    </div>
  </div>
  ${isAdmin() && flagged.length ? `<div class="card" style="border-color:#fdba74"><h2>⚠ ไม่ผ่านซ้ำ (${S.cfg.failLimit} ครั้งขึ้นไปใน ${S.cfg.windowDays} วัน)</h2>
    <div class="tbl"><table><tr><th>ห้อง</th><th>วันที่ไม่ผ่าน</th><th class="noprint"></th></tr>
    ${flagged.map((r) => `<tr class="flag"><td><b>${esc(clsOf(r.ck))}</b></td><td>${r.flag.map((x) => thShort(x.date)).join(", ")}</td>
      <td class="noprint"><button class="btn bad" data-ded="${r.ck}">หักคะแนน</button></td></tr>`).join("")}</table></div></div>` : ""}
  <div class="card"><h2>สรุปรายห้อง + อันดับ</h2>
    <div class="tbl"><table id="rtab"><tr><th class="c">อันดับ</th><th>ห้อง</th><th>${K === "zone" ? "เขตพื้นที่" : "ห้องเรียน"}</th><th class="c">ตรวจ</th><th class="c">ผ่าน</th><th class="c">ไม่ผ่าน</th><th class="c">อัตราผ่าน</th><th class="c" title="วันจันทร์–ศุกร์ที่ยังไม่มีผลตรวจ">ไม่ได้ตรวจ</th></tr>
    ${rows.filter((r) => isAdmin() || !myCk || true).map((r) => `<tr class="${r.flag ? "flag" : ""}" ${r.ck === myCk ? 'style="outline:2px solid var(--primary)"' : ""}>
      <td class="c">${rank[r.ck] || "-"}</td><td><b>${esc(clsOf(r.ck))}</b></td><td class="small">${esc(K === "zone" ? areaOf(r.ck) : roomOf(r.ck))}</td>
      <td class="c">${r.n}</td><td class="c" style="color:var(--ok)">${r.p}</td><td class="c" style="color:var(--bad)">${r.f || ""}</td>
      <td class="c">${r.rate == null ? "-" : Math.round(r.rate * 100) + "%"}</td><td class="c muted">${Math.max(0, schoolDays - r.n)}</td></tr>`).join("")}
    </table></div></div>
  <div class="card"><h2>รายการที่ไม่ผ่าน</h2>
    ${list.filter((x) => !x.ok).length ? `<div class="tbl"><table><tr><th>วันที่</th><th>ห้อง</th><th>สาเหตุ / หมายเหตุ</th><th>ผู้ตรวจ</th><th class="noprint"></th></tr>
    ${list.filter((x) => !x.ok).sort((a, b) => b.date.localeCompare(a.date) || ckSort(a.ck, b.ck)).map((x) => `<tr><td>${thShort(x.date)}</td><td>${esc(x.cls)}</td>
      <td>${esc([...(x.reasons || []), x.note].filter(Boolean).join(", "))}${dedIds.has(x._id) ? ' <span class="pill none">ดำเนินการแล้ว</span>' : ""}</td>
      <td class="small">${esc(x.by || "")}</td><td class="noprint">${x.hasPhoto ? `<button class="btn light" data-ph="${x._id}">รูป</button>` : ""}</td></tr>`).join("")}</table></div>`
    : `<p class="muted">ไม่มี</p>`}</div>`;
  $("#rf").onchange = (e) => { R.from = e.target.value; pageReport(); };
  $$("[data-kind]").forEach((b) => b.onclick = () => { R.kind = b.dataset.kind; pageReport(); });
  $("#rt").onchange = (e) => { R.to = e.target.value; pageReport(); };
  $$("[data-pre]").forEach((b) => b.onclick = () => { const n = +b.dataset.pre; R.to = today(); R.from = n < 0 ? termStart() : addDays(R.to, -n); pageReport(); });
  $("#pdf").onclick = () => window.print();
  $("#xls").onclick = () => exportExcel(listAll);
  bindPhotoButtons();
  $$("[data-ded]").forEach((b) => b.onclick = () => openDeduct(rows.find((r) => r.ck === b.dataset.ded), K));
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.XLSX;
}
async function exportExcel(listAll) {
  try {
    const X = await loadXLSX(), wb = X.utils.book_new(), cls = allClasses();
    for (const t of Object.keys(KINDS)) {
      const xs = listAll.filter((x) => kindOf(x) === t);
      const rows = cls.map((c) => { const a = xs.filter((x) => x.ck === c), f = a.filter((x) => !x.ok).length; return { c, n: a.length, f, rate: a.length ? (a.length - f) / a.length : null }; });
      const rk = rows.filter((r) => r.n).sort((p, q) => q.rate - p.rate || (q.n - q.f) - (p.n - p.f) || ckSort(p.c, q.c)), rank = Object.fromEntries(rk.map((r, i) => [r.c, i + 1]));
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["อันดับ", "ห้อง", t === "zone" ? "เขตพื้นที่" : "ห้องเรียน", "ตรวจ", "ผ่าน", "ไม่ผ่าน", "อัตราผ่าน(%)"],
        ...rows.map((r) => [rank[r.c] || "", clsOf(r.c), t === "zone" ? areaOf(r.c) : roomOf(r.c), r.n, r.n - r.f, r.f, r.rate == null ? "" : Math.round(r.rate * 100)])]), "สรุป" + KINDS[t]);
    }
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["วันที่", "ประเภท", "ห้อง", "ผล", "สาเหตุ", "หมายเหตุ", "ผู้ตรวจ"],
      ...listAll.sort((a, b) => a.date.localeCompare(b.date) || ckSort(a.ck, b.ck)).map((x) => [x.date, KINDS[kindOf(x)], x.cls, x.ok ? "ผ่าน" : "ไม่ผ่าน", (x.reasons || []).join(", "), x.note || "", x.by || ""])]), "รายละเอียด");
    X.writeFile(wb, `ตรวจความสะอาด_${R.from}_ถึง_${R.to}.xlsx`);
  } catch (e) { toast("ส่งออก Excel ไม่สำเร็จ: " + errText(e), 3500); }
}

// หักคะแนนนักเรียนเวร: เขียนข้อมูลแบบเดียวกับเมนูตัดคะแนนของ SMART SPK
async function openDeduct(row, K = "zone") {
  const ck = row.ck, cls = clsOf(ck), lv = ck.split("-")[0];
  const roster = await S.B.get(`${COL.roster}/L${lv}`);
  const studs = Object.values((roster && roster.s) || {}).filter((s) => H(s.cls) === ck && s.status !== "left" && s.status !== "inactive").sort((a, b) => (+a.no || 0) - (+b.no || 0));
  const dates = row.flag.map((x) => x.date);
  // ใช้ข้อมูล "ลงเขตพื้นที่" ของ SMART SPK (มีเฉพาะการตรวจเขตพื้นที่)
  const areas = K === "zone" ? await Promise.all(dates.map((d) => S.B.get(`${COL.area}/${d}_${ck}`).catch(() => null))) : dates.map(() => null);
  const st = (sid, i) => { const e = areas[i] && areas[i].e; return e ? e[sid] : undefined; };
  const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet">
    <div class="row"><h2 class="grow">หักคะแนน ${esc(cls)} · ${KINDS[K]}</h2><button class="btn gray" data-x>ปิด</button></div>
    <div class="small muted">ไม่ผ่าน: ${dates.map(thShort).join(", ")} · ${K === "zone" ? 'เลือกไว้ให้แล้ว = นักเรียนที่ครูบันทึก "ไม่ลงเขต" ในวันที่ไม่ผ่าน' : "เลือกนักเรียนเวรห้องเรียนของวันที่ไม่ผ่าน"}</div>
    <div class="row" style="margin:6px 0"><label class="f grow" style="margin:0"><span>รายการ</span><input type="text" id="dd" value="${esc(K === "room" ? S.cfg.roomDeductDetail : S.cfg.deductDetail)}"></label>
      <label class="f" style="margin:0;width:90px"><span>คะแนน</span><input type="number" id="dp" min="1" value="${S.cfg.deductPts}"></label></div>
    ${studs.length ? `<div class="row small" style="margin-bottom:4px"><button class="btn gray" id="sa">เลือกทั้งห้อง</button><button class="btn gray" id="sn">ไม่เลือก</button></div>
    <div class="tbl"><table><tr><th></th><th>ที่</th><th>ชื่อ</th>${K === "zone" ? dates.map((d) => `<th class="c">${thShort(d)}</th>`).join("") : ""}</tr>
    ${studs.map((s) => { const absent = dates.some((_, i) => st(s.id, i) === false);
      return `<tr><td><input type="checkbox" value="${esc(s.id)}" ${absent ? "checked" : ""}></td><td>${esc(s.no)}</td><td>${esc((s.prefix || "") + s.name)}</td>
      ${K !== "zone" ? "" : dates.map((_, i) => { const v = st(s.id, i); return `<td class="c">${v === true ? '<span class="pill ok">ลงเขต</span>' : v === false ? '<span class="pill bad">ไม่ลงเขต</span>' : '<span class="muted">-</span>'}</td>`; }).join("")}</tr>`; }).join("")}
    </table></div>` : `<p class="muted">ไม่พบรายชื่อนักเรียนห้องนี้ใน SMART SPK</p>`}
    <button class="btn bad block" id="go" style="margin-top:10px">หักคะแนนนักเรียนที่เลือก</button>
    <button class="btn gray block" id="skip" style="margin-top:6px">ไม่หักคะแนน (บันทึกว่าดำเนินการแล้ว)</button>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  $("[data-x]", bg).onclick = close;
  if ($("#sa", bg)) { $("#sa", bg).onclick = () => $$("tbody input, table input", bg).forEach((i) => i.checked = true); $("#sn", bg).onclick = () => $$("table input", bg).forEach((i) => i.checked = false); }
  const markDone = (sids, pts, detail) => ({ path: `${COL.ded}/${ck}_${K}_${dates[dates.length - 1]}`, merge: false,
    data: { t: K, ck, cls, failIds: row.flag.map((x) => x._id), sids, pts, detail, by: S.me.name || S.me.username, byUid: S.uid, at: { __now: 1 } } });
  $("#skip", bg).onclick = async () => { await S.B.write([markDone([], 0, "ไม่หักคะแนน")]); toast("บันทึกแล้ว"); close(); pageReport(); };
  $("#go", bg).onclick = async () => {
    const sids = $$("table input:checked", bg).map((i) => i.value);
    const pts = Math.max(1, +$("#dp", bg).value || 1), detail = $("#dd", bg).value.trim() || (K === "room" ? DEFAULT_CFG.roomDeductDetail : DEFAULT_CFG.deductDetail);
    if (!sids.length) return toast("ยังไม่ได้เลือกนักเรียน");
    if (!confirm(`หักคะแนน ${pts} คะแนน จำนวน ${sids.length} คน ห้อง ${cls} ?`)) return;
    const date = today(), other = !((S.settings && S.settings.minusRules) || []).some((r) => r[0] === detail);
    const sync = !S.settings || S.settings.syncLegacy !== false;
    const ops = [];
    sids.forEach((sid) => {
      const s = studs.find((x) => x.id === sid);
      const inc = { minus: INC(pts), ...(other ? { minusOther: INC(pts) } : {}) };
      ops.push({ path: `${COL.behavior}/${uid36()}`, merge: false, data: { k: "minus", sid, detail, pts, date, by: S.me.name || S.me.username, byUid: S.uid, ck, src: "zone-" + K } });
      if (s && s.key) ops.push({ path: `${COL.stu}/${s.key}`, data: { c: inc, m: { [vt(date)]: { minus: INC(pts), ...(other ? { minusOther: INC(pts) } : {}) } } } });
      if (sync) ops.push({ path: `${COL.legacy}/${sid}`, data: { khun: INC(pts) } });
    });
    ops.push(markDone(sids, pts, detail));
    $("#go", bg).disabled = true;
    try { await S.B.write(ops); toast(`หักคะแนน ${sids.length} คนแล้ว`); close(); pageReport(); }
    catch (e) { toast(errText(e), 3500); $("#go", bg).disabled = false; }
  };
}

// ---------------------------------------------------------------- page: แผนผัง
async function pageMap() {
  $("#main").innerHTML = `<div class="card"><h2>แผนผังเขตพื้นที่รับผิดชอบ</h2><p class="small muted">แตะรูปเพื่อขยาย</p>
    <a href="map.jpg" target="_blank"><img class="mapimg" src="map.jpg" alt="แผนผังเขตพื้นที่"></a></div>`;
}

// ---------------------------------------------------------------- page: ตั้งค่า (แอดมิน)
const A = { tab: "zones" };
async function pageAdmin() {
  const tabs = [["zones", "เขตพื้นที่ / ห้องเรียน"], ["rules", "เกณฑ์ตรวจ / หักคะแนน"], ["council", "บัญชีสภานักเรียน"]];
  $("#main").innerHTML = `<div class="card noprint"><div class="row">${tabs.map(([k, t]) => `<button class="btn ${A.tab === k ? "" : "gray"}" data-tab="${k}">${t}</button>`).join("")}</div></div><div id="adm"></div>`;
  $$("[data-tab]").forEach((b) => b.onclick = () => { A.tab = b.dataset.tab; pageAdmin(); });
  await ({ zones: admZones, rules: admRules, council: admCouncil })[A.tab]();
}
async function saveCfg(patch) {
  Object.assign(S.cfg, patch);
  await S.B.write([{ path: `${COL.cfg}/main`, data: { ...patch, rooms: (S.settings && S.settings.rooms) || null, updatedBy: S.me.name || "" } }]);
}
async function admZones() {
  const cls = allClasses(), abc = (S.settings && S.settings.areaByClass) || {};
  $("#adm").innerHTML = `<div class="card"><h2>เขตพื้นที่และห้องเรียนของแต่ละห้อง</h2>
    <p class="small muted">ดึงจาก SMART SPK (ตั้งค่า → เขตพื้นที่ของแต่ละห้อง) ถ้าแก้ที่นี่${isSuper() ? " ระบบจะบันทึกกลับไปที่ SMART SPK ด้วย" : " (บันทึกกลับ SMART SPK ได้เฉพาะผู้ดูแลระบบ)"}</p>
    <div class="row noprint" style="margin-bottom:6px"><button class="btn light" id="pull">ดึงจาก SMART SPK ทั้งหมด</button></div>
    <div class="tbl"><table><tr><th>ห้อง</th><th>เขตพื้นที่</th><th>ห้องเรียนประจำ (เลขห้อง)</th></tr>
    ${cls.map((c) => `<tr><td style="width:80px"><b>${esc(clsOf(c))}</b></td><td><input type="text" style="width:100%" data-area="${c}" value="${esc(areaOf(c))}" placeholder="${esc(abc[clsOf(c)] || "")}"></td>
      <td style="width:170px"><input type="text" style="width:100%" data-room="${c}" value="${esc(roomOf(c))}" placeholder="เช่น 534"></td></tr>`).join("")}
    </table></div><button class="btn block" id="sv" style="margin-top:10px">บันทึก</button></div>`;
  $("#pull").onclick = () => { $$("[data-area]").forEach((i) => { const v = abc[clsOf(i.dataset.area)]; if (v) i.value = v; }); toast("ดึงข้อมูลแล้ว กดบันทึกเพื่อยืนยัน"); };
  $("#sv").onclick = async () => {
    const zones = {}, areaByClass = { ...abc };
    $$("[data-area]").forEach((i) => { const v = i.value.trim(), rm = $(`[data-room="${i.dataset.area}"]`).value.trim(); zones[i.dataset.area] = { cls: clsOf(i.dataset.area), area: v, room: rm }; if (v) areaByClass[clsOf(i.dataset.area)] = v; else delete areaByClass[clsOf(i.dataset.area)]; });
    try {
      await saveCfg({ zones });
      if (isSuper() && S.settings) { await S.B.write([{ path: `${COL.config}/settings`, data: { areaByClass } }]); S.settings.areaByClass = areaByClass; }
      toast("บันทึกแล้ว");
    } catch (e) { toast(errText(e), 3500); }
  };
}
async function admRules() {
  const c = S.cfg;
  $("#adm").innerHTML = `<div class="card"><h2>เกณฑ์ตรวจ / หักคะแนน</h2>
    <div class="row" style="align-items:flex-start">
    <label class="f grow"><span>สาเหตุที่ไม่ผ่าน · เขตพื้นที่ (บรรทัดละ 1 ข้อ)</span><textarea id="rs" rows="6">${esc(c.reasons.join("\n"))}</textarea></label>
    <label class="f grow"><span>สาเหตุที่ไม่ผ่าน · ห้องเรียน</span><textarea id="rr" rows="6">${esc((c.roomReasons || []).join("\n"))}</textarea></label></div>
    <div class="row">
      <label class="f"><span>ไม่ผ่านกี่ครั้ง</span><input type="number" id="fl" min="1" value="${c.failLimit}" style="width:110px"></label>
      <label class="f"><span>ภายในกี่วัน</span><input type="number" id="wd" min="1" value="${c.windowDays}" style="width:110px"></label>
      <label class="f"><span>หักคนละ (คะแนน)</span><input type="number" id="dp" min="1" value="${c.deductPts}" style="width:110px"></label></div>
    <label class="f"><span>ข้อความหักคะแนน · เขตพื้นที่ (แสดงใน SMART SPK)</span><input type="text" id="dd" value="${esc(c.deductDetail)}"></label>
    <label class="f"><span>ข้อความหักคะแนน · ห้องเรียน</span><input type="text" id="rd" value="${esc(c.roomDeductDetail)}"></label>
    <p class="small muted">นับไม่ผ่านซ้ำแยกกันระหว่างเขตพื้นที่กับห้องเรียน เมื่อห้องใดครบเกณฑ์ จะขึ้นในหน้ารายงานให้กิจการฯ กด "หักคะแนน" เอง (ระบบไม่หักอัตโนมัติ)</p>
    <button class="btn block" id="sv">บันทึก</button></div>`;
  $("#sv").onclick = async () => {
    try {
      await saveCfg({ reasons: $("#rs").value.split("\n").map((s) => s.trim()).filter(Boolean), roomReasons: $("#rr").value.split("\n").map((s) => s.trim()).filter(Boolean),
        roomDeductDetail: $("#rd").value.trim() || DEFAULT_CFG.roomDeductDetail, failLimit: Math.max(1, +$("#fl").value || 2),
        windowDays: Math.max(1, +$("#wd").value || 7), deductPts: Math.max(1, +$("#dp").value || 5), deductDetail: $("#dd").value.trim() || DEFAULT_CFG.deductDetail });
      toast("บันทึกแล้ว");
    } catch (e) { toast(errText(e), 3500); }
  };
}
const COUNCIL_SEED = `จันทร์,นางสาวนภิสรา บุตตนนท์
จันทร์,นางสาวกรกนก ถามูลแสน
จันทร์,นายกิตติศักดิ์ คำลิ้ม
จันทร์,นายวรวิทย์ แย้มเรณ
จันทร์,นางสาวอารยา หล้าทุม
จันทร์,นางสาวนุชนาถ รัตนาวัฒน์
จันทร์,นายจักรินทร์ ภิเพก
จันทร์,นายปัญญา รักษา
อังคาร,นางสาวรพินท์นิภา สุนทร
อังคาร,นายศตวรรษ พิมพ์มา
อังคาร,นายนัฐทวุฒิ เสมานู
อังคาร,นายณัฐชพล ทุมรินทร์
อังคาร,นายวิทยา ทองชุม
อังคาร,นางสาวอัญชิษฐา มีฤทธ์
อังคาร,นางสาวชนิภรณ์ เพ็ชรจันทึก
อังคาร,นายปุญญาพัตต์ ทองกรอบ
พุธ,นายสุรพัศ พลศึกษา
พุธ,นายเกษมสันต์ สิงห์แก้ว
พุธ,นายธีระภัทร มงคลซู
พุธ,นายธนัชนันตร์ ล้อประเสริฐกูล
พุธ,นางสาวนิธิวดี ดวงจันทร์
พุธ,นางสาวสุชาดา อามาตรมนตรี
พุธ,นางสาวเบญญาภา ไชยวงค์
พุธ,นายเมทะนี คุณชัยภูมิ
พฤหัสบดี,นางสาวกนกพร พันธ์ทอง
พฤหัสบดี,นายจักริน บรรดาศักดิ์
พฤหัสบดี,นายไตรภูมิ จักร์พิมพ์
พฤหัสบดี,นางสาวพิชญาภา ศรีลาชัย
พฤหัสบดี,นายกัณฑ์อเนก โคตรแซก
พฤหัสบดี,นายภัทรนันท์ ศรีบุญเรื่อง
พฤหัสบดี,นายพุฒิพงศ์ พิซี
พฤหัสบดี,นายกายสิทธิ์ เกตุพันธ์
ศุกร์,นางสาวสุวรินทร์ ลาลู่
ศุกร์,นางสาวนภัสสร สาโพธิ์
ศุกร์,นายธัญธร จันทร์สวัสดิ์
ศุกร์,นายปรัชญา ผาบสิมมา
ศุกร์,นายอริยะ สุวรรณศรี
ศุกร์,นายธีราชาติ สมบัติดี
ศุกร์,นายปวีกรณ์ พงศ์พันเลิศ
ศุกร์,นายพสิษฐ์ คำปาน
ศุกร์,นางสาววชิราภรณ์ พิมพ์พันธ์`;
async function admCouncil() {
  const list = (await S.B.query(COL.users, [["role", "==", "council"]])).sort((a, b) => String(a.username).localeCompare(String(b.username)));
  $("#adm").innerHTML = `<div class="card"><h2>บัญชีสภานักเรียน (${list.length})</h2>
    ${list.length ? `<div class="tbl"><table><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>วันเวร</th><th class="c">สถานะ</th><th></th></tr>
    ${list.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(u.dutyDay || "")}</td>
      <td class="c">${u.disabled ? '<span class="pill bad">ปิด</span>' : '<span class="pill ok">ใช้งาน</span>'}</td>
      <td>${isSuper() ? `<button class="btn gray" data-tg="${u._id}" data-v="${u.disabled ? 0 : 1}">${u.disabled ? "เปิดใช้" : "ปิดใช้"}</button>` : ""}</td></tr>`).join("")}</table></div>`
    : `<p class="muted">ยังไม่มีบัญชีสภานักเรียน</p>`}</div>
  <div class="card"><h2>สร้างบัญชีหลายคนพร้อมกัน</h2>
    ${isSuper() ? `<p class="small muted">บรรทัดละ 1 คน: <b>วันเวร,ชื่อ-สกุล</b> · ระบบตั้งชื่อผู้ใช้ council01, council02 … และสุ่มรหัสผ่าน 6 หลักให้ · ใส่รายชื่อสภาฯ ตามตารางลงเวลาไว้ให้แล้ว</p>
    <textarea id="bulk" rows="10">${list.length ? "" : COUNCIL_SEED}</textarea>
    <div class="row" style="margin-top:6px"><label>ขึ้นต้นด้วย <input type="text" id="pre" value="council" style="width:120px"></label>
    <label>เริ่มเลขที่ <input type="number" id="st" value="${list.length + 1}" style="width:80px"></label></div>
    <button class="btn block" id="mk" style="margin-top:8px">สร้างบัญชี</button><div id="mkOut"></div>`
    : `<p class="muted">การสร้างบัญชีทำได้เฉพาะผู้ดูแลระบบ (role admin) ของ SMART SPK</p>`}</div>`;
  $$("[data-tg]").forEach((b) => b.onclick = async () => { await S.B.write([{ path: `${COL.users}/${b.dataset.tg}`, data: { disabled: b.dataset.v === "1" } }]); admCouncil(); });
  const mk = $("#mk"); if (!mk) return;
  mk.onclick = async () => {
    const lines = $("#bulk").value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return toast("ยังไม่มีรายชื่อ");
    if (!confirm(`สร้างบัญชี ${lines.length} บัญชี?`)) return;
    mk.disabled = true;
    const pre = $("#pre").value.trim().toLowerCase() || "council"; let n = +$("#st").value || 1;
    const made = [], fail = [];
    for (const line of lines) {
      const [a, b] = line.includes(",") ? line.split(",").map((s) => s.trim()) : ["", line];
      const day = b ? a.replace(/^วัน/, "") : "", name = b || a;
      const username = `${pre}${pad(n++)}`, email = `${username}@${MAIL}`, pw = String(100000 + Math.floor(Math.random() * 900000));
      $("#mkOut").innerHTML = `<p class="muted">กำลังสร้าง ${made.length + fail.length + 1}/${lines.length} …</p>`;
      try {
        const uid = await S.B.createUser(email, pw);
        await S.B.write([
          { path: `${COL.users}/${uid}`, merge: false, data: { username, email, name, role: "council", position: "สภานักเรียน", dutyDay: day, homeroom: "", disabled: false } },
          { path: `${COL.usernames}/${username}`, merge: false, data: { email, uid } },
        ]);
        made.push([username, pw, name, day]);
      } catch (e) { fail.push([username, name, errText(e)]); }
    }
    mk.disabled = false;
    $("#mkOut").innerHTML = `<h3>สร้างแล้ว ${made.length} บัญชี${fail.length ? ` · ไม่สำเร็จ ${fail.length}` : ""}</h3>
      <p class="small" style="color:var(--bad)">จดหรือดาวน์โหลดรหัสผ่านไว้ตอนนี้ ระบบจะไม่แสดงซ้ำ</p>
      <button class="btn light" id="dl">⬇ ดาวน์โหลด Excel รหัสผ่าน</button>
      <div class="tbl"><table><tr><th>ชื่อผู้ใช้</th><th>รหัสผ่าน</th><th>ชื่อ</th><th>วันเวร</th></tr>${made.map((m) => `<tr><td>${m[0]}</td><td><b>${m[1]}</b></td><td>${esc(m[2])}</td><td>${esc(m[3])}</td></tr>`).join("")}</table></div>
      ${fail.map((f) => `<p class="small" style="color:var(--bad)">${esc(f[0])} ${esc(f[1])}: ${esc(f[2])}</p>`).join("")}`;
    $("#dl").onclick = async () => { const X = await loadXLSX(); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["ชื่อผู้ใช้", "รหัสผ่าน", "ชื่อ-สกุล", "วันเวร"], ...made]), "บัญชีสภานักเรียน"); X.writeFile(wb, "บัญชีสภานักเรียน.xlsx"); };
  };
}

const PAGES = { check: pageCheck, mine: pageMine, report: pageReport, admin: pageAdmin, map: pageMap };

// ---------------------------------------------------------------- boot
(async function boot() {
  try { S.B = DEMO ? demoBackend() : await firebaseBackend(); }
  catch (e) { $("#app").innerHTML = `<div class="login card"><h2>เปิดระบบไม่สำเร็จ</h2><p>${esc(errText(e))}</p><button class="btn block" onclick="location.reload()">ลองใหม่</button></div>`; return; }
  S.B.onAuth(async (uid) => {
    S.uid = uid;
    if (!uid) { S.me = null; return loginView(); }
    try {
      S.me = await S.B.get(`${COL.users}/${uid}`);
      if (!S.me) { await S.B.logout(); return loginView("บัญชีนี้ยังไม่ได้ลงทะเบียนใน SMART SPK"); }
      if (S.me.disabled) { await S.B.logout(); return loginView("บัญชีนี้ถูกปิดการใช้งาน"); }
      if (S.me.role === "parent" || S.me.role === "student") { await S.B.logout(); return loginView("บัญชีนี้ไม่มีสิทธิ์ใช้ระบบตรวจเขต"); }
      await loadCfg();
      await loadSettings();
      if (!S.settings.rooms && S.cfg.rooms) S.settings.rooms = S.cfg.rooms;
      route();
    } catch (e) { console.error(e); loginView(errText(e)); }
  });
})();
