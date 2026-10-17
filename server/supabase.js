/* ============================================================
   طبقة تخزين Supabase (PostgREST) — بدون أي مكتبات خارجية
   ------------------------------------------------------------
   بتستخدم مفتاح الخدمة (service role key) من server/.env،
   وPostgREST عبر fetch المدمج في Node 18+.
   لو المفاتيح مش موجودة، السيرفر بيشتغل محليًا (data.json).
   ============================================================ */
"use strict";

const cfg = { url: "", key: "", enabled: false };

function configure(url, key) {
  if (url && key) {
    cfg.url = String(url).replace(/\/+$/, "");
    cfg.key = String(key);
    cfg.enabled = true;
  } else {
    cfg.url = "";
    cfg.key = "";
    cfg.enabled = false;
  }
}

function host() {
  try { return new URL(cfg.url).host; } catch (e) { return cfg.url; }
}

const num = (v) => (v == null || v === "" ? 0 : Number(v));

/* ---------- نداء PostgREST ---------- */
async function rest(pathname, opts) {
  opts = opts || {};
  const url = cfg.url + "/rest/v1/" + pathname;
  const headers = Object.assign({
    "apikey": cfg.key,
    "Authorization": "Bearer " + cfg.key,
    "Content-Type": "application/json",
    "Accept": "application/json"
  }, opts.headers || {});
  const r = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok) {
    const msg = (data && data.message) ? data.message : (txt || "").slice(0, 200);
    throw new Error("Supabase " + r.status + ": " + msg);
  }
  return data;
}

const UPSERT = { "Prefer": "resolution=merge-duplicates,return=minimal" };

/* ---------- ربط صفوف قاعدة البيانات بالشكل اللي الموقع متوقعه ---------- */
/* الإتاحة (متوفر/غير متوفر) بتتخزن في عمود badge (عمود مش مستخدم في الواجهة)
   كعلامة "__out" — كده مش محتاجين نغيّر شكل جدول products في Supabase */
const AVAIL_OUT = "__out";
function toProduct(r) {
  return {
    id: r.id, name: r.name, cat: r.cat, price: num(r.price), cost: num(r.cost), stock: num(r.stock),
    unit: r.unit, emoji: r.emoji, badge: r.badge && r.badge !== AVAIL_OUT ? r.badge : "", desc: r.desc || "", specs: r.specs || [],
    image: r.image || "", rating: num(r.rating), reviews: num(r.reviews), sold: num(r.sold),
    discount: num(r.discount), active: r.active !== false, available: r.badge !== AVAIL_OUT
  };
}
function fromProduct(o) {
  return {
    id: o.id, name: o.name, cat: o.cat, price: num(o.price), cost: num(o.cost), stock: num(o.stock),
    unit: o.unit, emoji: o.emoji, badge: o.available === false ? AVAIL_OUT : (o.badge && o.badge !== AVAIL_OUT ? o.badge : ""), desc: o.desc || "", specs: o.specs || [],
    image: o.image || "", rating: num(o.rating), reviews: num(o.reviews), sold: num(o.sold),
    discount: num(o.discount), active: o.active !== false
  };
}
function toOrder(r) {
  return {
    id: r.id, code: r.code, createdAt: num(r.created_at), status: r.status || "pending", paid: !!r.paid,
    payment: r.payment || "cod", subtotal: num(r.subtotal), delivery: num(r.delivery), discount: num(r.discount),
    total: num(r.total), customer: r.customer || {}, items: r.items || [], history: r.history || [],
    notes: r.notes || "", read: !!r.read
  };
}
function toThread(r) {
  return {
    id: r.id, phone: r.phone, name: r.name, email: r.email || "", unread: !!r.unread,
    orderCode: r.order_code || "", createdAt: num(r.created_at), updatedAt: num(r.updated_at),
    messages: r.messages || []
  };
}
function toNotification(r) {
  return { id: r.id, title: r.title, body: r.body, audience: r.audience || "all", at: num(r.at) };
}

/* ---------- تحميل كل البيانات ---------- */
async function loadAll(seed) {
  const [cats, prods, setts, orders, threads, notifs, counter] = await Promise.all([
    rest("categories?select=*&order=ord.asc"),
    rest("products?select=*"),
    rest("settings?id=eq.1&select=data"),
    rest("orders?select=*&order=created_at.desc"),
    rest("threads?select=*&order=updated_at.desc"),
    rest("notifications?select=*&order=at.asc"),
    rest("counters?id=eq.visits&select=value")
  ]);

  let categories = (cats || []).map((c) => ({ id: c.id, name: c.name, emoji: c.emoji || "" }));
  let products = (prods || []).map(toProduct);

  // لو القاعدة فاضية، نزرع البيانات الافتراضية مرة واحدة
  if (!categories.length) { categories = seed.categories || []; await upsertCategories(categories); }
  if (!products.length) { products = seed.products || []; await upsertProducts(products); }

  let settings = (setts && setts[0] && setts[0].data) || null;
  if (!settings) { settings = seed.settings || {}; await saveSettings(settings); }

  return {
    rev: Date.now(),
    categories, products, settings,
    orders: (orders || []).map(toOrder),
    threads: (threads || []).map(toThread),
    notifications: (notifs || []).map(toNotification),
    visits: (counter && counter[0] && num(counter[0].value)) || 0
  };
}

/* ---------- عمليات الكتابة ---------- */
async function upsertCategories(list) {
  if (!cfg.enabled || !list.length) return;
  const rows = list.map((c, i) => ({ id: c.id, name: c.name, emoji: c.emoji || "", ord: i }));
  await rest("categories?on_conflict=id", { method: "POST", body: rows, headers: UPSERT });
}
async function upsertProducts(list) {
  if (!cfg.enabled || !list.length) return;
  await rest("products?on_conflict=id", { method: "POST", body: list.map(fromProduct), headers: UPSERT });
}
async function deleteProduct(id) {
  if (!cfg.enabled) return;
  await rest("products?id=eq." + encodeURIComponent(id), { method: "DELETE", headers: { "Prefer": "return=minimal" } });
}
async function saveSettings(s) {
  if (!cfg.enabled) return;
  await rest("settings?on_conflict=id", { method: "POST", body: [{ id: 1, data: s }], headers: UPSERT });
}
async function upsertOrder(o) {
  if (!cfg.enabled) return;
  const r = {
    id: o.id, code: o.code, created_at: o.createdAt, status: o.status, paid: !!o.paid,
    payment: o.payment || "cod", subtotal: num(o.subtotal), delivery: num(o.delivery), discount: num(o.discount),
    total: num(o.total), customer: o.customer || {}, items: o.items || [], history: o.history || [],
    notes: o.notes || "", read: !!o.read
  };
  await rest("orders?on_conflict=id", { method: "POST", body: [r], headers: UPSERT });
}
async function upsertThread(t) {
  if (!cfg.enabled) return;
  const r = {
    id: t.id, phone: t.phone, name: t.name, email: t.email || "", unread: !!t.unread,
    order_code: t.orderCode || "", created_at: t.createdAt || Date.now(), updated_at: t.updatedAt || t.createdAt || Date.now(),
    messages: t.messages || []
  };
  await rest("threads?on_conflict=id", { method: "POST", body: [r], headers: UPSERT });
}
async function insertNotification(n) {
  if (!cfg.enabled) return;
  await rest("notifications?on_conflict=id", { method: "POST", body: [{ id: n.id, title: n.title, body: n.body, audience: n.audience || "all", at: n.at || Date.now() }], headers: UPSERT });
}
async function setVisits(v) {
  if (!cfg.enabled) return;
  await rest("counters?on_conflict=id", { method: "POST", body: [{ id: "visits", value: num(v) }], headers: UPSERT });
}

module.exports = {
  configure, host, rest, loadAll,
  upsertCategories, upsertProducts, deleteProduct, saveSettings,
  upsertOrder, upsertThread, insertNotification, setVisits,
  get enabled() { return cfg.enabled; }
};
