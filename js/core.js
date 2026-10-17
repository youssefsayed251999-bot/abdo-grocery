/* ================= النواة: الحالة، التخزين، الأدوات، الإشعارات، الراوتر ================= */
(function () {
  "use strict";

  /* ---------- أدوات مساعدة ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (p) => (p || "id") + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const num = (n) => (isNaN(parseFloat(n)) ? 0 : parseFloat(n));

  function money(n) {
    const v = Math.round(num(n) * 100) / 100;
    return v.toLocaleString("en-EG", { maximumFractionDigits: 2 }) + " " + State.settings.currency;
  }
  function dateTime(ts) {
    try {
      return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ts));
    } catch (e) { return new Date(ts).toLocaleString(); }
  }
  function dateOnly(ts) {
    try { return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long" }).format(new Date(ts)); }
    catch (e) { return new Date(ts).toLocaleDateString(); }
  }
  function clockTime(ts) {
    try { return new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" }).format(new Date(ts)); }
    catch (e) { return new Date(ts).toLocaleTimeString(); }
  }
  function relTime(ts) {
    const d = Date.now() - ts, m = Math.floor(d / 60000);
    if (m < 1) return "الآن";
    if (m < 60) return "منذ " + m + " دقيقة";
    const h = Math.floor(m / 60);
    if (h < 24) return "منذ " + h + " ساعة";
    const dd = Math.floor(h / 24);
    return dd === 1 ? "منذ يوم" : "منذ " + dd + " يوم";
  }
  const dayStart = (d) => { const x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- حالة الطلبات ---------- */
  const ORDER_STATUSES = [
    { id: "pending", label: "قيد المراجعة", icon: "⏳", pill: "amber" },
    { id: "confirmed", label: "تم التأكيد", icon: "✅", pill: "blue" },
    { id: "preparing", label: "قيد التجهيز", icon: "🧺", pill: "blue" },
    { id: "shipped", label: "تم الشحن", icon: "🚚", pill: "orange" },
    { id: "delivered", label: "تم التسليم", icon: "📦", pill: "green" },
    { id: "cancelled", label: "ملغي", icon: "❌", pill: "red" }
  ];
  const statusMeta = (id) => ORDER_STATUSES.find((s) => s.id === id) || ORDER_STATUSES[0];
  const PAYMENT_LABELS = { cod: "الدفع عند الاستلام", wallet: "محفظة إلكترونية" };

  /* ---------- التخزين ---------- */
  const KEY = "amanah_grocery_v1";
  const SCHEMA = 3; // رقم إصدار بنية البيانات (لترقية البيانات المحفوظة قديمًا)
  const State = {
    settings: null, products: [], orders: [], notifications: [], adminNotifs: [],
    threads: [], users: [], session: null, cart: [], adminAuthed: false,
    visits: 0,
    ui: { cat: "all", q: "", sort: "popular", adminRange: 30, adminOrderStatus: "all", adminOrderQ: "", adminInvoiceQ: "", adminThread: null }
  };

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
    const S = window.SEED;
    if (!raw) {
      State.settings = JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS));
      State.products = JSON.parse(JSON.stringify(S.DEFAULT_PRODUCTS));
      State.orders = [];
      State.notifications = [];
      State.adminNotifs = [];
      State.threads = [];
      State.users = [];
      State.cart = [];
      State.session = null;
      State.adminAuthed = false;
      if (!window.APP_CONFIG || window.APP_CONFIG.demoData !== false) seedDemo();
    } else {
      State.settings = Object.assign(JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS)), raw.settings || {});
      State.settings.hero = Object.assign({}, S.DEFAULT_SETTINGS.hero, (raw.settings || {}).hero || {});
      State.settings.delivery = Object.assign({}, S.DEFAULT_SETTINGS.delivery, (raw.settings || {}).delivery || {});
      State.settings.notify = Object.assign({}, S.DEFAULT_SETTINGS.notify, (raw.settings || {}).notify || {});
      State.products = raw.products || [];
      State.orders = raw.orders || [];
      State.notifications = raw.notifications || [];
      State.adminNotifs = raw.adminNotifs || [];
      State.threads = raw.threads || [];
      State.users = raw.users || [];
      State.cart = raw.cart || [];
      State.session = raw.session || null;
      State.adminAuthed = !!raw.adminAuthed;
      State.guestPhone = raw.guestPhone || null;
      State.visits = raw.visits || 0;

      /* --- ترقية البيانات المحفوظة من إصدارات قديمة --- */
      if ((raw.schema || 1) < SCHEMA) {
        // تحديث كتالوج المنتجات من البذرة الجديدة (أسماء/أسعار/أقسام/صور)
        // مع الحفاظ على المخزون والمبيعات لو موجودين
        const oldById = {};
        State.products.forEach((p) => { oldById[p.id] = p; });
        State.products = JSON.parse(JSON.stringify(S.DEFAULT_PRODUCTS)).map((s) => {
          const o = oldById[s.id];
          if (o) { if (o.stock != null) s.stock = o.stock; if (o.sold) s.sold = o.sold; }
          return s;
        });
        State.cart = State.cart.filter((c) => State.products.some((p) => p.id === c.id));
        // تحديث نصوص الواجهة القديمة اللي كانت بتتكلم عن أقسام مش موجودة
        const oldHero = State.settings.hero || {};
        if (/خضار|فاكهة|فراخ|لحمة|لحوم/.test((oldHero.title || "") + " " + (oldHero.text || ""))) {
          State.settings.hero = JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS.hero));
        }
        if (/طازة كل يوم/.test(State.settings.tagline || "")) State.settings.tagline = S.DEFAULT_SETTINGS.tagline;
        save();
      }
    }
    /* ربط صور المنتجات الحقيقية (تشتغل لنفس البيانات المحفوظة قديمًا أيضًا) */
    if (window.PRODUCT_IMAGES) {
      State.products.forEach((p) => { if (!p.image && window.PRODUCT_IMAGES[p.id]) p.image = window.PRODUCT_IMAGES[p.id]; });
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        settings: State.settings, products: State.products, orders: State.orders,
        notifications: State.notifications, adminNotifs: State.adminNotifs,
        threads: State.threads, users: State.users, cart: State.cart,
        session: State.session, adminAuthed: State.adminAuthed,
        guestPhone: State.guestPhone || null, visits: State.visits || 0, schema: SCHEMA
      }));
    } catch (e) { /* متصفح بيمنع التخزين (file:// أو وضع خاص) — نكمل في الذاكرة بدون تعطّل */ }
  }
  function resetAll() {
    try { localStorage.removeItem(KEY); } catch (e) { }
    location.hash = "#/";
    location.reload();
  }

  /* ---------- بيانات تجريبية (طلبات + محادثة) ---------- */
  function seedDemo() {
    const P = State.products;
    const pick = (name) => P.find((p) => p.name.indexOf(name) > -1) || P[0];
    const mk = (code, cust, items, status, daysAgo) => {
      const lines = items.map(([n, q]) => { const p = pick(n); return { id: p.id, name: p.name, price: p.price, qty: q, unit: p.unit, emoji: p.emoji }; });
      const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const fee = sub >= State.settings.delivery.freeOver ? 0 : State.settings.delivery.fee;
      const t = Date.now() - daysAgo * 86400000 - Math.floor(Math.random() * 6) * 3600000;
      const hist = [{ status: "pending", at: t }];
      ORDER_STATUSES.forEach((s) => { if (s.id !== "cancelled" && s.id !== "pending" && ORDER_STATUSES.findIndex((x) => x.id === s.id) <= ORDER_STATUSES.findIndex((x) => x.id === status)) hist.push({ status: s.id, at: t + 1000 * 60 * (60 + Math.random() * 900) }); });
      return {
        id: uid("o"), code: code, createdAt: t, items: lines, subtotal: sub, delivery: fee, total: sub + fee,
        customer: cust, payment: "cod", paid: false, status: status, history: hist, read: true
      };
    };
    State.orders = [
      mk("#AM10241", { name: "منى عبد الرحمن", phone: "01001234567", city: "إنشاص الرمل", area: "شارع السوق", address: "عمارة 12 - الدور 3", notes: "" }, [["أندومي بالفراخ", 6], ["أرز مصري", 3], ["عيش بلدي", 10]], "delivered", 6),
      mk("#AM10242", { name: "أحمد سمير", phone: "01122334455", city: "إنشاص الرمل", area: "شارع المحطة", address: "برج النخيل - شقة 8", notes: "اتصل قبل الوصول" }, [["أندومي بالفراخ", 12], ["نودلز كوس بالفراخ", 6], ["شيبسي", 4]], "shipped", 2),
      mk("#AM10243", { name: "فاطمة الزهراء", phone: "01233445566", city: "إنشاص الرمل", area: "شارع الجمعية", address: "عمارة 5 - الدور الأول", notes: "" }, [["عسل أسود (مربلة)", 2], ["طحينة بلدي", 1], ["حلاوة طحينية", 1]], "preparing", 1),
      mk("#AM10244", { name: "محمود حسن", phone: "01555667788", city: "إنشاص الرمل", area: "بجوار المسجد الكبير", address: "منزل 22", notes: "الجرس مش شغال" }, [["جبنة بيضاء", 1], ["مكرونة اسباجتي", 2], ["سكر أبيض", 3], ["شاي العروسة", 2]], "confirmed", 0),
      mk("#AM10245", { name: "سارة إبراهيم", phone: "01099887766", city: "إنشاص الرمل", area: "شارع المدارس", address: "شقة 14 - الدور 5", notes: "" }, [["زبادي (6 عبوات)", 2], ["لبن بلدي", 3], ["بيض بلدي (طبق)", 1], ["عيش بلدي", 20]], "pending", 0)
    ];
    const t0 = Date.now() - 3600000;
    State.threads = [{
      id: uid("t"), name: "سارة إبراهيم", phone: "01099887766", email: "sara@example.com", unread: true, orderCode: "#AM10245",
      createdAt: t0, messages: [
        { from: "customer", text: "السلام عليكم ورحمة الله وبركاته", at: t0 },
        { from: "store", text: "وعليكم السلام ورحمة الله وبركاته 🤍 أهلاً بك! كيف يمكننا مساعدتك؟", at: t0 + 60000 },
        { from: "customer", text: "بخصوص طلب #AM10245 عايزة أعرف التوصيل بكام وامتى يوصل؟", at: t0 + 120000 }
      ]
    }];
    State.products.forEach((p) => { p.sold = Math.floor(Math.random() * 120); });
  }

  /* ---------- السلة ---------- */
  const Cart = {
    count() { return State.cart.reduce((s, i) => s + i.qty, 0); },
    items() {
      return State.cart.map((c) => {
        const p = State.products.find((x) => x.id === c.id);
        return p ? { product: p, qty: c.qty, line: p.price * (1 - (p.discount || 0) / 100) * c.qty } : null;
      }).filter(Boolean);
    },
    sub() { return this.items().reduce((s, i) => s + i.line, 0); },
    fee() {
      const d = State.settings.delivery;
      const sub = this.sub();
      if (!State.cart.length) return 0;
      return sub >= d.freeOver ? 0 : d.fee;
    },
    total() { return this.sub() + this.fee(); },
    qtyOf(id) { const c = State.cart.find((x) => x.id === id); return c ? c.qty : 0; },
    add(id, q) {
      const p = State.products.find((x) => x.id === id); if (!p) return;
      if (p.available === false) { toast("المنتج غير متوفر حاليًا", "err"); return; }
      const c = State.cart.find((x) => x.id === id);
      const next = (c ? c.qty : 0) + (q || 1);
      if (next > p.stock) { toast("الكمية المتاحة في المخزون " + p.stock + " " + p.unit, "err"); return; }
      if (c) c.qty = next; else State.cart.push({ id: id, qty: next });
      save(); renderCartBadges();
    },
    set(id, q) {
      const p = State.products.find((x) => x.id === id); if (!p) return;
      const c = State.cart.find((x) => x.id === id); if (!c) return;
      c.qty = p.available === false ? 0 : clamp(q, 0, p.stock);
      if (c.qty <= 0) State.cart = State.cart.filter((x) => x.id !== id);
      save(); renderCartBadges();
    },
    remove(id) { State.cart = State.cart.filter((x) => x.id !== id); save(); renderCartBadges(); },
    clear() { State.cart = []; save(); renderCartBadges(); }
  };

  /* ---------- الإشعارات ---------- */
  const Notify = {
    supported() { return "Notification" in window; },
    granted() { return this.supported() && Notification.permission === "granted"; },
    request() {
      if (!this.supported()) { toast("المتصفح لا يدعم الإشعارات", "err"); return Promise.resolve(false); }
      return Notification.requestPermission().then((p) => {
        if (p === "granted") { toast("تم تفعيل الإشعارات على هذا الجهاز 🔔", "ok"); State.settings.notifyDevice = true; save(); }
        else toast("لم يتم السماح بالإشعارات", "err");
        return p === "granted";
      });
    },
    os(title, body, opts) {
      if (!this.granted()) return false;
      try {
        const n = new Notification(title, Object.assign({ body: body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", dir: "rtl", lang: "ar", tag: "amanah" }, opts || {}));
        n.onclick = () => { window.focus(); if (opts && opts.href) location.hash = opts.href; n.close(); };
        return true;
      } catch (e) { return false; }
    },
    /* to: 'customer' | 'admin' */
    push(o) {
      const n = {
        id: uid("n"), to: o.to || "customer", kind: o.kind || "system",
        title: o.title, body: o.body || "", image: o.image || "", href: o.href || "",
        orderId: o.orderId || "", audience: o.audience || "all", tag: o.tag || "",
        sentAt: Date.now(), recipients: o.recipients || 1, opened: 0, read: false
      };
      if (n.to === "admin") State.adminNotifs.unshift(n); else State.notifications.unshift(n);
      save();
      if (!o.silent) {
        toast(n.title, "ok");
        this.os(n.title, n.body, { href: n.href });
      }
      if (window.refreshBadges) window.refreshBadges();
      return n;
    },
    markAllRead(which) {
      const arr = which === "admin" ? State.adminNotifs : State.notifications;
      arr.forEach((n) => { n.read = true; }); save();
      if (window.refreshBadges) window.refreshBadges();
    },
    unread(which) { return (which === "admin" ? State.adminNotifs : State.notifications).filter((n) => !n.read).length; }
  };

  /* ---------- العملاء ---------- */
  const Auth = {
    current() { return State.session ? State.users.find((u) => u.email === State.session) || null : null; },
    signup(data) {
      if (State.users.some((u) => u.email === data.email)) return { ok: false, msg: "البريد مستخدم بالفعل" };
      State.users.push({ email: data.email, password: data.password, name: data.name || "عميل جديد", phone: data.phone || "", city: data.city || "", address: data.address || "" });
      State.session = data.email; save(); return { ok: true };
    },
    login(email, password) {
      const u = State.users.find((x) => x.email === email);
      if (!u) return { ok: false, msg: "لا يوجد حساب بهذا البريد" };
      if (u.password !== password) return { ok: false, msg: "كلمة المرور غير صحيحة" };
      State.session = email; save(); return { ok: true };
    },
    logout() { State.session = null; save(); },
    update(patch) {
      const u = this.current(); if (!u) return;
      Object.assign(u, patch); save();
    }
  };

  /* ---------- الطلبات ---------- */
  const Orders = {
    code() { return "#AM" + (10240 + State.orders.length + 1); },
    create(info) {
      const items = Cart.items();
      if (!items.length) return null;
      const bad = items.find((i) => i.product.available === false || i.product.stock <= 0);
      if (bad) { toast("منتج غير متوفر: " + bad.product.name + " — احذفه من السلة", "err"); return null; }
      if (!info.name || !info.phone) { toast("الاسم ورقم الهاتف مطلوبان", "err"); return null; }
      const minOrder = State.settings.delivery.minOrder;
      if (Cart.sub() < minOrder) { toast("الحد الأدنى للطلب " + money(minOrder), "err"); return null; }
      const now = Date.now();
      const order = {
        id: uid("o"), code: this.code(), createdAt: now,
        items: items.map((i) => ({ id: i.product.id, name: i.product.name, price: Math.round(i.product.price * (1 - (i.product.discount || 0) / 100) * 100) / 100, qty: i.qty, unit: i.product.unit, emoji: i.product.emoji })),
        subtotal: Cart.sub(), delivery: Cart.fee(), total: Cart.total(),
        customer: info, payment: info.payment || "cod", paid: false,
        status: "pending", history: [{ status: "pending", at: now }], read: false
      };
      order.items.forEach((it) => { const p = State.products.find((x) => x.id === it.id); if (p) { p.stock = Math.max(0, p.stock - it.qty); p.sold = (p.sold || 0) + it.qty; } });
      State.orders.unshift(order);
      State.guestPhone = order.customer.phone;
      if (Auth.current() && Auth.current().phone) { /* keep profile */ }
      State.cart = []; save();
      if (window.API && window.API.enabled) {
        window.API.postOrder(order);
      } else {
        Notify.push({ to: "admin", kind: "order", title: "طلب جديد " + order.code, body: order.customer.name + " • " + money(order.total), href: "#/admin/orders", orderId: order.id, recipients: 1 });
        Notify.push({ to: "customer", kind: "order", title: "تم استلام طلبك " + order.code + " 🎉", body: "شكرًا لك! طلبك قيد المراجعة وسيتم تأكيده قريبًا.", href: "#/order/" + order.id, orderId: order.id, recipients: 1, silent: false });
      }
      if (window.refreshBadges) window.refreshBadges();
      return order;
    },
    setStatus(id, status) {
      const o = State.orders.find((x) => x.id === id); if (!o) return;
      o.status = status; o.history.push({ status: status, at: Date.now() }); save();
      const meta = statusMeta(status);
      const msgs = {
        confirmed: "تم تأكيد طلبك " + o.code + " ✅ وسنبدأ بتجهيزه قريبًا.",
        preparing: "طلبك " + o.code + " قيد التجهيز الآن 🧺",
        shipped: "طلبك " + o.code + " تم شحنه وهو في الطريق إليك 🚚",
        delivered: "تم تسليم طلبك " + o.code + " 📦 شكرًا لثقتك فينا!",
        cancelled: "تم إلغاء طلبك " + o.code + " ❌ لو حصل خطأ كلمنا على " + State.settings.supportPhone
      };
      if (!(window.API && window.API.enabled)) {
        if (msgs[status]) Notify.push({ to: "customer", kind: "order", title: meta.icon + " تحديث حالة الطلب " + o.code, body: msgs[status], href: "#/order/" + o.id, orderId: o.id, recipients: 1 });
      } else {
        window.API.setOrderStatus(id, status);
      }
      if (window.refreshBadges) window.refreshBadges();
      return o;
    },
    find(id) { return State.orders.find((x) => x.id === id || x.code === id); },
    byPhone(phone) { return State.orders.filter((o) => o.customer.phone === phone); },
    /* إحصاءات */
    inRange(days) {
      const from = dayStart() - (days - 1) * 86400000;
      return State.orders.filter((o) => o.createdAt >= from);
    },
    stats(days) {
      const list = this.inRange(days);
      const valid = list.filter((o) => o.status !== "cancelled");
      const revenue = valid.reduce((s, o) => s + o.total, 0);
      const profit = valid.reduce((s, o) => s + o.items.reduce((a, it) => {
        const p = State.products.find((x) => x.id === it.id);
        const cost = p ? p.cost : 0;
        return a + (it.price - cost) * it.qty;
      }, 0) - o.delivery, 0);
      const cancelled = list.filter((o) => o.status === "cancelled").length;
      const byStatus = {};
      ORDER_STATUSES.forEach((s) => { byStatus[s.id] = list.filter((o) => o.status === s.id).length; });
      const lowStock = State.products.filter((p) => p.stock <= State.settings.lowStock);
      return {
        count: list.length, revenue: revenue, profit: profit, cancelled: cancelled,
        avg: valid.length ? revenue / valid.length : 0, byStatus: byStatus, lowStock: lowStock,
        newCustomers: new Set(list.map((o) => o.customer.phone)).size,
        unreadMessages: State.threads.filter((t) => t.unread).length
      };
    },
    dailyRevenue(days) {
      const out = [];
      for (let i = days - 1; i >= 0; i--) {
        const s = dayStart() - i * 86400000, e = s + 86400000;
        const rev = State.orders.filter((o) => o.createdAt >= s && o.createdAt < e && o.status !== "cancelled").reduce((a, o) => a + o.total, 0);
        out.push({ t: s, rev: rev });
      }
      return out;
    },
    topProducts(n) {
      const map = {};
      State.orders.filter((o) => o.status !== "cancelled").forEach((o) => o.items.forEach((it) => {
        map[it.name] = map[it.name] || { name: it.name, qty: 0, rev: 0, emoji: it.emoji || "🛒" };
        map[it.name].qty += it.qty; map[it.name].rev += it.qty * it.price;
      }));
      return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, n || 5);
    },
    byCity() {
      const map = {};
      State.orders.filter((o) => o.status !== "cancelled").forEach((o) => {
        const c = o.customer.city || "غير محدد";
        map[c] = map[c] || { city: c, count: 0, rev: 0 };
        map[c].count++; map[c].rev += o.total;
      });
      return Object.values(map).sort((a, b) => b.rev - a.rev);
    },
    byPayment() {
      const map = {};
      State.orders.forEach((o) => { const k = PAYMENT_LABELS[o.payment] || o.payment; map[k] = (map[k] || 0) + 1; });
      return map;
    },
    topCustomers(n) {
      const map = {};
      State.orders.filter((o) => o.status !== "cancelled").forEach((o) => {
        const k = o.customer.phone || o.customer.name;
        map[k] = map[k] || { name: o.customer.name, phone: o.customer.phone, total: 0, count: 0 };
        map[k].total += o.total; map[k].count++;
      });
      return Object.values(map).sort((a, b) => b.total - a.total).slice(0, n || 5);
    }
  };

  /* ---------- الرسائل ---------- */
  const Chat = {
    phone() { const u = Auth.current(); return (u && u.phone) || State.guestPhone || ""; },
    myName() { const u = Auth.current(); return (u && u.name) || "زائر"; },
    myThread() {
      const u = Auth.current();
      const phone = (u && u.phone) || State.guestPhone || "";
      let t = State.threads.find((x) => (phone && x.phone === phone) || (u && x.email === u.email));
      if (t) return t;
      t = { id: uid("t"), name: (u && u.name) || "زائر", phone: phone, email: (u && u.email) || "", unread: false, messages: [], createdAt: Date.now() };
      State.threads.unshift(t); save(); return t;
    },
    sendFromCustomer(text) {
      const phone = this.phone();
      // وضع السيرفر: الرسالة تروح للمحل فعليًا
      if (window.API && window.API.enabled) {
        if (!phone) { toast("من فضلك أدخل رقم موبايلك أول (من حسابي) عشان نقدر نرد عليك", "err"); return; }
        const name = this.myName();
        const u = Auth.current();
        window.API.sendMessage({ phone: phone, name: name, email: (u && u.email) || "", text: text, from: "customer" }).then((r) => {
          if (r && r.ok && r.body && r.body.thread) {
            if (window.Sync) window.Sync.upsertThread(r.body.thread);
            if (window.onNewMessage) window.onNewMessage();
          } else if (r && r.status === 0) { toast("تعذّر الإرسال — تأكد من اتصال السيرفر", "err"); }
        });
        return;
      }
      const t = this.myThread();
      t.messages.push({ from: "customer", text: text, at: Date.now() });
      t.unread = true; save();
      Notify.push({ to: "admin", kind: "message", title: "رسالة جديدة من " + t.name, body: text.slice(0, 80), href: "#/admin/messages", recipients: 1 });
      setTimeout(() => {
        const t2 = State.threads.find((x) => x.id === t.id);
        t2.messages.push({ from: "store", text: "شكرًا لرسالتك 🙏 تم استلام رسالتك وسيتم الرد عليك في أقرب وقت. تقدر كمان تكلمنا على " + State.settings.supportPhone, at: Date.now() });
        save(); if (window.onNewMessage) window.onNewMessage();
      }, 1200);
    },
    sendFromStore(threadId, text) {
      const t = State.threads.find((x) => x.id === threadId); if (!t) return;
      if (window.API && window.API.enabled && t.phone) {
        window.API.sendMessage({ phone: t.phone, text: text, from: "store" }).then((r) => {
          if (r && r.ok && r.body && r.body.thread) {
            if (window.Sync) window.Sync.upsertThread(r.body.thread);
            if (window.onNewMessage) window.onNewMessage();
          }
        });
        return;
      }
      t.messages.push({ from: "store", text: text, at: Date.now() }); t.unread = false; save();
    }
  };

  /* ---------- التنبيه (Toast) ---------- */
  function toast(msg, kind) {
    const box = $("#toasts"); if (!box) return;
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; el.style.transition = ".25s"; }, 2200);
    setTimeout(() => el.remove(), 2600);
  }

  /* ---------- النافذة المنبثقة ---------- */
  function modal(o) {
    const root = $("#modalRoot");
    root.innerHTML =
      '<div class="modal-backdrop" data-modal-backdrop>' +
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + esc(o.title || "") + '</h3>' +
      '<button class="x-btn" data-modal-close>✕</button></div>' +
      '<div class="modal-body">' + (o.body || "") + '</div>' +
      (o.footer ? '<div class="modal-body" style="border-top:1px solid var(--line)">' + o.footer + '</div>' : "") +
      "</div></div>";
    root.querySelector("[data-modal-close]").onclick = closeModal;
    const bd = root.querySelector("[data-modal-backdrop]");
    bd.addEventListener("click", (e) => { if (e.target === bd) closeModal(); });
    if (o.onOpen) o.onOpen(root);
    return root;
  }
  function closeModal() { const r = $("#modalRoot"); if (r) r.innerHTML = ""; }
  function confirmDlg(title, text, okLabel) {
    return new Promise((resolve) => {
      modal({
        title: title,
        body: '<p class="muted">' + esc(text) + "</p>",
        footer: '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-modal-close>إلغاء</button><button class="btn danger" id="cfmOk">' + esc(okLabel || "تأكيد") + "</button></div>",
        onOpen: (root) => {
          root.querySelector("[data-modal-close]").onclick = () => { closeModal(); resolve(false); };
          root.querySelector("#cfmOk").onclick = () => { closeModal(); resolve(true); };
        }
      });
    });
  }

  /* ---------- شارات السلة/الإشعارات ---------- */
  function renderCartBadges() {
    const n = Cart.count();
    const c = $("#cartCount"); if (c) { c.textContent = n; c.hidden = !n; }
    const ab = $("#adminBellBadge"); if (ab) { const k = Notify.unread("admin"); ab.textContent = k; ab.hidden = !k; }
    const nb = $("#notifBadge"); if (nb) { const k = Notify.unread("customer"); nb.textContent = k; nb.hidden = !k; }
    // زر لوحة التحكم يظهر لصاحب المتجر (وفي نسخة المطوّر يظهر دائمًا)
    const ae = $("#adminEntry");
    if (ae) ae.hidden = !(State.adminAuthed || (window.APP_CONFIG && window.APP_CONFIG.devTools));
  }
  window.refreshBadges = renderCartBadges;

  /* ---------- الراوتر ---------- */
  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#/, "");
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = {};
    (qs || "").split("&").forEach((kv) => { if (!kv) return; const [k, v] = kv.split("="); params[decodeURIComponent(k)] = decodeURIComponent(v || ""); });
    return { path: "/" + parts.join("/"), parts: parts, params: params };
  }
  function render() {
    const r = parseHash();
    const isAdmin = r.parts[0] === "admin";
    // نسخة العميل (بدون وحدة الإدارة): أي محاولة دخول للوحة التحكم ترجع للمتجر
    if (isAdmin && !(window.Views && window.Views.adminOverview)) { location.hash = "#/"; return; }
    const shop = $("#shopShell"), adminS = $("#adminShell");
    shop.hidden = isAdmin; adminS.hidden = !isAdmin;
    window.scrollTo(0, 0);
    if (isAdmin) {
      if (r.parts[1] === "login" || (!State.adminAuthed && r.parts[1] !== undefined && r.parts[1] !== "login") || !State.adminAuthed) {
        if (!State.adminAuthed) { renderAdminLogin(); return; }
      }
      renderAdmin(r);
    } else {
      renderShop(r);
    }
    renderCartBadges();
    // active nav
    $$(".bottomnav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === (r.parts[0] || "home")));
    $$(".admin-nav a").forEach((a) => a.classList.toggle("active", a.dataset.admin === (r.parts[1] || "overview")));
  }
  function renderShop(r) {
    const v = $("#view");
    const route = r.parts[0] || "";
    const map = { "": "home", "products": "products", "product": "product", "cart": "cart", "checkout": "checkout", "order": "order", "orders": "orders", "messages": "messages", "account": "account", "notifications": "notifications" };
    const name = map[route] || "home";
    const fn = window.Views[name] || window.Views.home;
    v.innerHTML = fn(r);
    if (window.After[name]) window.After[name](r);
  }
  function renderAdmin(r) {
    const v = $("#adminView");
    if (!$(".admin-nav", $("#adminShell"))) v.insertAdjacentHTML("beforebegin", "");
    const sub = r.parts[1] || "overview";
    const map = { overview: "adminOverview", orders: "adminOrders", invoices: "adminInvoices", products: "adminProducts", messages: "adminMessages", notify: "adminNotify", stats: "adminStats", settings: "adminSettings" };
    let name = map[sub] || "adminOverview";
    const fn = window.Views[name];
    if (!fn) { location.hash = "#/admin"; return; }
    // admin nav
    const navHtml =
      '<nav class="admin-nav"><div class="admin-nav-inner">' +
      [["overview", "📊 عامة نظرة"], ["orders", "🧾 الطلبات"], ["invoices", "🧾 الفواتير"], ["products", "🥬 المنتجات"], ["messages", "💬 الرسائل"], ["notify", "🔔 الإشعارات"], ["stats", "📈 الإحصائيات"], ["settings", "⚙️ الإعدادات"]]
        .map((x) => '<a href="#/admin' + (x[0] === "overview" ? "" : "/" + x[0]) + '" data-admin="' + x[0] + '">' + x[1] + "</a>").join("") +
      "</div></nav>";
    $("#adminView").innerHTML = navHtml + '<div id="adminPane">' + fn(r) + "</div>";
    $$(".admin-nav a").forEach((a) => a.classList.toggle("active", a.dataset.admin === sub));
    if (window.AdminAfter && window.AdminAfter[name]) window.AdminAfter[name](r);
  }
  function renderAdminLogin() {
    $("#adminView").innerHTML =
      '<div style="max-width:400px;margin:8vh auto 0">' +
      '<div class="auth-card">' +
      '<div style="text-align:center;margin-bottom:14px"><div style="font-size:2.6rem">🔐</div>' +
      "<h2>لوحة التحكم</h2><p class=\"muted small\">اكتب كلمة المرور للدخول إلى لوحة تحكم المتجر</p></div>" +
      '<form data-form="admin-login"><div class="field"><label>كلمة المرور</label><input type="password" name="password" placeholder="••••••" required /></div>' +
      '<button class="btn block lg" type="submit">دخول</button></form>' +
      '<p class="muted small" style="margin-top:10px;text-align:center">كلمة المرور الافتراضية: <b>admin123</b> (تقدر تغيّرها من الإعدادات)</p>' +
      '<div style="text-align:center;margin-top:6px"><a class="link-btn" href="#/">← رجوع للمتجر</a></div>' +
      "</div></div>";
  }

  /* ---------- التوجيه العام للأحداث ---------- */
  const actions = {
    nav(el) { const h = el.dataset.href; if (h) location.hash = h; },
    page(el) {
      const p = el.dataset.page || "";
      const pages = {
        faq: ["الأسئلة الشائعة", "<b>الحد الأدنى للطلب؟</b><br>الحد الأدنى {{min}}. التوصيل {{fee}} ومجانًا للطلبات فوق {{free}}.<br><br><b>إمتى يوصل الطلب؟</b><br>{{time}}<br><br><b>ينفع أدفع كاش؟</b><br>أكيد! الدفع عند الاستلام متاح داخل كل مناطق التوصيل."],
        privacy: ["سياسة الخصوصية", "بياناتك (الاسم، العنوان، رقم الهاتف) تُستخدم فقط لتوصيل طلبك ولا تُشارك مع أي طرف آخر. كل البيانات محفوظة على جهازك في هذا العرض التجريبي."],
        terms: ["الشروط والأحكام", "استخدام الموقع يعني موافقتك على استخدام البيانات لتجهيز وتوصيل الطلبات. الأسعار قابلة للتغيير حسب السوق، ويتم التأكيد عند الطلب."],
        returns: ["الاسترجاع والشحن", "لو وصلك أي منتج مش طازة أو فيه مشكلة، بلّغنا خلال 24 ساعة من الاستلام وبنستبدله أو بنرجّع فلوسه. الشحن خلال ساعتين داخل المدينة."]
      };
      const p2 = pages[p] || ["معلومة", "لا يوجد محتوى."];
      const d = State.settings.delivery;
      modal({
        title: p2[0], body: '<p style="font-size:.9rem;line-height:1.9">' +
          p2[1].replace("{{min}}", money(d.minOrder)).replace("{{fee}}", money(d.fee)).replace("{{free}}", money(d.freeOver)).replace("{{time}}", d.time) + "</p>"
      });
      return false;
    },
    "add-to-cart"(el) { Cart.add(el.dataset.id, 1); toast("تمت إضافة المنتج للسلة 🛒", "ok"); rerenderIfNeeded(); },
    "qty-dec"(el) { Cart.set(el.dataset.id, Cart.qtyOf(el.dataset.id) - 1); rerenderIfNeeded(); },
    "qty-inc"(el) { Cart.add(el.dataset.id, 1); rerenderIfNeeded(); },
    "cart-remove"(el) { Cart.remove(el.dataset.id); rerenderIfNeeded(); },
    "cart-clear"(el) { confirmDlg("تفريغ السلة", "هل تريد حذف كل المنتجات من السلة؟", "تفريغ").then((ok) => { if (ok) { Cart.clear(); rerenderIfNeeded(); } }); },
    "filter-cat"(el) { State.ui.cat = el.dataset.cat || "all"; Views._renderProducts(); },
    "sort"(el) { State.ui.sort = el.dataset.sort; Views._renderProducts(); },
    "admin-login"(el) { location.hash = "#/admin/login"; },
    "admin-logout"(el) { State.adminAuthed = false; save(); location.hash = "#/"; toast("تم الخروج من لوحة التحكم"); },
    "enable-notif"() { Notify.request(); },
    "notif-read-all"() { Notify.markAllRead("customer"); rerenderIfNeeded(); },
    "admin-notif-read-all"() { Notify.markAllRead("admin"); rerenderIfNeededAdmin(); }
  };
  window.Actions = actions;

  function rerenderIfNeeded() {
    const r = parseHash();
    if (["/", "/products", "/product", "/cart", "/checkout", "/account", "/notifications"].includes(r.path)) render();
  }
  function rerenderIfNeededAdmin() {
    const r = parseHash();
    if (r.parts[0] === "admin") renderAdmin(r);
  }
  window.rerenderIfNeeded = rerenderIfNeeded;
  window.rerenderIfNeededAdmin = rerenderIfNeededAdmin;

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) { const res = fn(el, e); if (res === false) e.preventDefault(); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-form]");
    if (!f) return;
    e.preventDefault();
    const name = f.dataset.form;
    const data = {};
    new FormData(f).forEach((v, k) => { data[k] = v; });
    const fn = window.Forms && window.Forms[name];
    if (fn) fn(data, f);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const name = el.dataset.change;
    const fn = window.Changes && window.Changes[name];
    if (fn) fn(el);
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-input]");
    if (!el) return;
    const name = el.dataset.input;
    const fn = window.Inputs && window.Inputs[name];
    if (fn) fn(el, e);
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("storage", () => { load(); render(); });

  /* ---------- الحساب العام للنواة ---------- */
  window.Core = {
    $, $$, esc, uid, clamp, num, money, dateTime, dateOnly, clockTime, relTime, cap, dayStart,
    ORDER_STATUSES, statusMeta, PAYMENT_LABELS,
    State, load, save, resetAll, Cart, Notify, Auth, Orders, Chat,
    toast, modal, closeModal, confirmDlg, render, parseHash, rerenderIfNeededAdmin,
    Actions: actions
  };
})();
