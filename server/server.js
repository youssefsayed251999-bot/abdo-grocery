/* ============================================================
   سيرفر بقالة عم عبده — Node.js بدون أي مكتبات خارجية
   ------------------------------------------------------------
   - يخدم الموقع (ملفات ثابتة) + واجهة API في نفس المنفذ
   - رسائل ومحادثات حقيقية لحظية (Server-Sent Events)
   - طلبات وإشعارات مشتركة بين كل الأجهزة
   - البيانات تُحفظ في Supabase (لو المفاتيح موجودة في server/.env) أو محليًا في server/data.json
   التشغيل:  node server/server.js  [--port 8080] [--root dist\user]
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SERVER_DIR = __dirname;
const PROJECT_DIR = path.resolve(__dirname, "..");

/* ---------- إعدادات من سطر الأوامر ---------- */
const argv = process.argv.slice(2);
function argVal(name) { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null; }
const PORT = parseInt(argVal("--port") || process.env.PORT || "8080", 10);
let ROOT = path.resolve(PROJECT_DIR, argVal("--root") || "");
// لو مفيش --root، نستخدم dist/user لو موجود وإلا مجلد المشروع
if (!argVal("--root")) {
  const candidate = path.join(PROJECT_DIR, "dist", "user");
  ROOT = fs.existsSync(path.join(candidate, "index.html")) ? candidate : PROJECT_DIR;
}
const DATA_FILE = argVal("--data") ? path.resolve(argVal("--data")) : path.join(SERVER_DIR, "data.json");

/* ---------- إعدادات Supabase (اختيارية) — من server/.env أو متغيرات البيئة ---------- */
function loadDotEnv() {
  const out = {};
  try {
    const f = path.join(SERVER_DIR, ".env");
    if (fs.existsSync(f)) {
      fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (!m) return;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        out[m[1]] = v;
      });
    }
  } catch (e) { }
  return out;
}
const DOTENV = loadDotEnv();
const SB_URL = argVal("--supabase-url") || process.env.SUPABASE_URL || DOTENV.SUPABASE_URL || "";
const SB_KEY = argVal("--supabase-key") || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || DOTENV.SUPABASE_SERVICE_KEY || DOTENV.SUPABASE_SERVICE_ROLE_KEY || DOTENV.SUPABASE_SECRET_KEY || "";
const SB = require("./supabase");
SB.configure(SB_URL, SB_KEY);

/* ---------- تحميل البيانات الافتراضية من seed.js ---------- */
let _seed = null;
function loadSeed() {
  if (_seed) return _seed;
  global.window = global.window || {};
  try { require(path.join(PROJECT_DIR, "js", "seed.js")); } catch (e) { }
  try { require(path.join(PROJECT_DIR, "js", "product-images.js")); } catch (e) { }
  const imgs = global.window.PRODUCT_IMAGES || {};
  const s = global.window.SEED || {};
  const products = (s.DEFAULT_PRODUCTS || []).map((p) => {
    const q = Object.assign({}, p);
    if (!q.image && imgs[q.id]) q.image = imgs[q.id];
    return q;
  });
  _seed = { categories: s.CATEGORIES || [], products, settings: s.DEFAULT_SETTINGS || {}, templates: s.NOTIF_TEMPLATES || [] };
  return _seed;
}

function freshData() {
  const seed = loadSeed();
  return {
    rev: Date.now(),
    categories: seed.categories,
    products: seed.products,
    settings: seed.settings,
    orders: [],
    threads: [],
    notifications: [],
    visits: 0
  };
}

/* ---------- قراءة/كتابة قاعدة البيانات ---------- */
let DB = freshData();

function loadLocal() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      DB = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (!Array.isArray(DB.products) || !DB.products.length) DB = freshData();
    } else {
      DB = freshData();
    }
  } catch (e) { console.error("تحذير: تعذّر قراءة data.json — هنبدأ من جديد.", e.message); DB = freshData(); }
}

let saveTimer = null;
function save() {
  DB.rev = Date.now();
  if (SB.enabled) return; // في وضع Supabase بنحفظ مباشرة مع كل عملية
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(DB, null, 1), "utf8", (e) => { if (e) console.error("فشل الحفظ:", e.message); });
  }, 150);
}

/* ---------- المصادقة ---------- */
const TOKENS = new Set();
function adminPassword() { return (DB.settings && DB.settings.adminPassword) || "admin123"; }
function isAdmin(req) {
  const t = req.headers["x-token"];
  return !!(t && TOKENS.has(t));
}

/* ---------- أدوات مساعدة ---------- */
function uid(prefix) { return (prefix || "x") + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); }
function nowMs() { return Date.now(); }
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error("JSON غير صالح")); } });
    req.on("error", reject);
  });
}
function nextOrderCode() {
  const n = 10240 + DB.orders.length + 1;
  return "#AM" + n;
}
function findThread(phone) {
  return DB.threads.find((t) => t.phone === phone);
}

/* ---------- البث اللحظي (SSE) ---------- */
const CLIENTS = new Set();
function broadcast(type, payload) {
  const frame = "event: " + type + "\ndata: " + JSON.stringify(payload) + "\n\n";
  for (const c of CLIENTS) {
    try { c.res.write(frame); } catch (e) { /* ignore */ }
  }
}
setInterval(() => { for (const c of CLIENTS) { try { c.res.write(": ping\n\n"); } catch (e) { } } }, 25000);

/* ---------- معالجة الـ API ---------- */
async function api(req, res, url) {
  const p = url.pathname.replace(/\/+$/, "") || "/api";
  const q = url.searchParams;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Token", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" });
    return res.end();
  }

  // تشخيص
  if (p === "/api/ping") return json(res, 200, { ok: true, name: "بقالة عم عبده", rev: DB.rev, time: nowMs() });

  // تسجيل دخول المالك
  if (p === "/api/login" && req.method === "POST") {
    const b = await readBody(req);
    if (String(b.password) === String(adminPassword())) {
      const token = crypto.randomBytes(24).toString("hex");
      TOKENS.add(token);
      return json(res, 200, { ok: true, token });
    }
    return json(res, 401, { ok: false, msg: "كلمة المرور غير صحيحة" });
  }

  // كل البيانات الأولية
  if (p === "/api/bootstrap" && req.method === "GET") {
    const admin = isAdmin(req);
    const phone = q.get("phone") || "";
    const out = {
      ok: true, rev: DB.rev, serverTime: nowMs(), admin: admin,
      categories: DB.categories, products: DB.products, settings: DB.settings,
      notifications: DB.notifications.slice(-60)
    };
    if (admin) {
      out.orders = DB.orders;
      out.threads = DB.threads;
      out.visits = DB.visits;
    } else {
      out.orders = phone ? DB.orders.filter((o) => o.customer && o.customer.phone === phone) : [];
      out.thread = phone ? (findThread(phone) || null) : null;
    }
    return json(res, 200, out);
  }

  // إنشاء طلب (العميل)
  if (p === "/api/orders" && req.method === "POST") {
    const b = await readBody(req);
    const o = b.order || b;
    o.id = o.id || uid("o");
    o.code = o.code || nextOrderCode();
    o.createdAt = o.createdAt || nowMs();
    o.status = o.status || "pending";
    o.payment = o.payment || "cod";
    o.paid = !!o.paid;
    o.history = o.history || [{ status: o.status, at: o.createdAt }];
    o.read = false;
    DB.orders.unshift(o);
    SB.upsertOrder(o).catch((e) => console.error("SB:", e.message));
    save(); broadcast("order:new", o);
    return json(res, 200, { ok: true, order: o });
  }

  // قائمة الطلبات
  if (p === "/api/orders" && req.method === "GET") {
    if (isAdmin(req)) return json(res, 200, { ok: true, orders: DB.orders });
    const phone = q.get("phone") || "";
    return json(res, 200, { ok: true, orders: phone ? DB.orders.filter((o) => o.customer && o.customer.phone === phone) : [] });
  }

  // تحديث حالة/دفع طلب (المالك)
  if (p === "/api/orders/status" && req.method === "POST") {
    if (!isAdmin(req)) return json(res, 403, { ok: false, msg: "غير مصرّح" });
    const b = await readBody(req);
    const o = DB.orders.find((x) => x.id === b.id);
    if (!o) return json(res, 404, { ok: false, msg: "الطلب غير موجود" });
    if (b.status) { o.status = b.status; o.history = o.history || []; o.history.push({ status: b.status, at: nowMs() }); }
    if (typeof b.paid === "boolean") o.paid = b.paid;
    o.read = true;
    SB.upsertOrder(o).catch((e) => console.error("SB:", e.message));
    save(); broadcast("order:update", o);
    return json(res, 200, { ok: true, order: o });
  }

  // خيط محادثة عميل
  if (p === "/api/thread" && req.method === "GET") {
    const phone = q.get("phone") || "";
    return json(res, 200, { ok: true, thread: phone ? (findThread(phone) || null) : null });
  }

  // كل المحادثات (المالك)
  if (p === "/api/threads" && req.method === "GET") {
    if (!isAdmin(req)) return json(res, 403, { ok: false, msg: "غير مصرّح" });
    return json(res, 200, { ok: true, threads: DB.threads });
  }

  // إرسال رسالة
  if (p === "/api/message" && req.method === "POST") {
    const b = await readBody(req);
    const phone = String(b.phone || "").trim();
    const text = String(b.text || "").trim();
    if (!phone || !text) return json(res, 400, { ok: false, msg: "بيانات ناقصة" });
    let t = findThread(phone);
    if (!t) {
      t = { id: uid("t"), name: b.name || "عميل", phone, email: b.email || "", unread: false, orderCode: "", createdAt: nowMs(), messages: [] };
      DB.threads.unshift(t);
    }
    if (b.name) t.name = b.name;
    const from = b.from === "store" ? "store" : "customer";
    const msg = { id: uid("m"), from, text, at: nowMs() };
    t.messages.push(msg);
    if (from === "customer") t.unread = true;
    t.updatedAt = msg.at;
    SB.upsertThread(t).catch((e) => console.error("SB:", e.message));
    save();
    broadcast("message:new", { thread: t, message: msg });
    return json(res, 200, { ok: true, thread: t, message: msg });
  }

  // تعليم محادثة كمقروءة
  if (p === "/api/thread-read" && req.method === "POST") {
    const b = await readBody(req);
    const t = findThread(String(b.phone || ""));
    if (t) { if (b.unread === false) t.unread = false; else t.unread = !!b.unread; SB.upsertThread(t).catch((e) => console.error("SB:", e.message)); save(); broadcast("thread:update", t); }
    return json(res, 200, { ok: true, thread: t || null });
  }

  // الإشعارات
  if (p === "/api/notifications" && req.method === "GET") {
    return json(res, 200, { ok: true, notifications: DB.notifications.slice(-60) });
  }
  if (p === "/api/notify" && req.method === "POST") {
    if (!isAdmin(req)) return json(res, 403, { ok: false, msg: "غير مصرّح" });
    const b = await readBody(req);
    const n = { id: uid("n"), title: b.title || "", body: b.body || "", audience: b.audience || "all", at: nowMs() };
    DB.notifications.push(n);
    if (DB.notifications.length > 200) DB.notifications = DB.notifications.slice(-200);
    SB.insertNotification(n).catch((e) => console.error("SB:", e.message));
    save(); broadcast("notification:new", n);
    return json(res, 200, { ok: true, notification: n });
  }

  // حفظ الإعدادات (المالك)
  if (p === "/api/settings" && req.method === "POST") {
    if (!isAdmin(req)) return json(res, 403, { ok: false, msg: "غير مصرّح" });
    const b = await readBody(req);
    DB.settings = Object.assign({}, DB.settings, b.settings || b);
    SB.saveSettings(DB.settings).catch((e) => console.error("SB:", e.message));
    save(); broadcast("settings:update", DB.settings);
    return json(res, 200, { ok: true, settings: DB.settings });
  }

  // حفظ/تعديل المنتجات (المالك)
  if (p === "/api/products" && req.method === "POST") {
    if (!isAdmin(req)) return json(res, 403, { ok: false, msg: "غير مصرّح" });
    const b = await readBody(req);
    const list = b.products || (b.product ? [b.product] : []);
    const changed = [];
    for (const prod of list) {
      const i = DB.products.findIndex((x) => x.id === prod.id);
      if (i === -1) { DB.products.push(prod); changed.push(prod); }
      else { DB.products[i] = Object.assign({}, DB.products[i], prod); changed.push(DB.products[i]); }
    }
    SB.upsertProducts(changed).catch((e) => console.error("SB:", e.message));
    save(); broadcast("products:update", DB.products);
    return json(res, 200, { ok: true, products: DB.products });
  }
  if (p.startsWith("/api/products/") && req.method === "DELETE") {
    if (!isAdmin(req)) return json(res, 403, { ok: false, msg: "غير مصرّح" });
    const id = p.split("/").pop();
    DB.products = DB.products.filter((x) => x.id !== id);
    SB.deleteProduct(id).catch((e) => console.error("SB:", e.message));
    save(); broadcast("products:update", DB.products);
    return json(res, 200, { ok: true, products: DB.products });
  }

  // عدّاد الزيارات
  if (p === "/api/visits" && req.method === "POST") {
    DB.visits = (DB.visits || 0) + 1;
    SB.setVisits(DB.visits).catch((e) => console.error("SB:", e.message));
    save(); broadcast("visits:update", DB.visits);
    return json(res, 200, { ok: true, visits: DB.visits });
  }

  // البث اللحظي
  if (p === "/api/stream" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("retry: 3000\n\n");
    res.write("event: hello\ndata: " + JSON.stringify({ ok: true, rev: DB.rev }) + "\n\n");
    const client = { res, role: q.get("role") || "user", phone: q.get("phone") || "" };
    CLIENTS.add(client);
    req.on("close", () => CLIENTS.delete(client));
    return;
  }

  return json(res, 404, { ok: false, msg: "المسار غير موجود" });
}

/* ---------- خدمة الملفات الثابتة ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".mp4": "video/mp4"
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  let file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("403"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback للمسارات غير الموجودة بدون امتداد
      if (!path.extname(file)) file = path.join(ROOT, "index.html");
      else { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404"); }
    }
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404); return res.end("404"); }
      const ext = path.extname(file).toLowerCase();
      const isCode = [".html", ".js", ".css", ".webmanifest", ".json"].includes(ext);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": isCode ? "no-cache" : "public, max-age=86400" });
      res.end(buf);
    });
  });
}

/* ---------- السيرفر ---------- */
 const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, "http://" + (req.headers.host || "localhost")); }
  catch (e) { res.writeHead(400); return res.end("bad request"); }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    api(req, res, url).catch((e) => json(res, 500, { ok: false, msg: e.message }));
    return;
  }
  serveStatic(req, res, url);
});

/* ---------- التشغيل: نجهّز قاعدة البيانات الأول ثم نفتح السيرفر ---------- */
async function init() {
  if (SB.enabled) {
    try {
      DB = await SB.loadAll(loadSeed());
      DB.rev = Date.now();
      console.log("  قاعدة البيانات: Supabase ☁️  (" + SB.host() + ")");
    } catch (e) {
      console.error("  ⚠️  تعذّر الاتصال بـ Supabase: " + e.message);
      console.error("      تأكد إنك شغّلت ملف supabase/schema.sql وإن المفاتيح في server/.env صحيحة.");
      console.error("      هنشتغل مؤقتًا بالبيانات المحلية.");
      SB.configure("", "");
      loadLocal();
    }
  } else {
    loadLocal();
    console.log("  قاعدة البيانات: ملف محلي (" + DATA_FILE + ")");
  }
}

init().then(() => {
  server.listen(PORT, () => {
    console.log("========================================");
    console.log("  بقالة عم عبده — السيرفر شغّال ✅");
    console.log("  العنوان:      http://localhost:" + PORT);
    console.log("  مجلد الموقع:  " + ROOT);
    console.log("  كلمة سر المالك: " + adminPassword());
    console.log("========================================");
  });
});
