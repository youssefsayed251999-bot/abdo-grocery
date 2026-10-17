/* ============================================================
   المزامنة الحقيقية مع السيرفر (طلبات + رسائل + إشعارات لحظية)
   ------------------------------------------------------------
   - لو السيرفر شغّال: كل حاجة بتتزامن لحظيًا بين الأجهزة
   - لو لأ: الموقع يشتغل محليًا عادي (localStorage) من غير أي خطأ
   ============================================================ */
(function () {
  "use strict";
  const C = window.Core;
  const State = C.State;

  function notifyPermitted() { try { return C.Notify.granted(); } catch (e) { return false; } }

  /* ---------- دمج البيانات القادمة من السيرفر ---------- */
  function mergeNotifications(serverList) {
    if (!Array.isArray(serverList)) return;
    const byId = {};
    State.notifications.forEach((n) => { byId[n.id] = n; });
    serverList.forEach((s) => {
      if (byId[s.id]) return;
      State.notifications.push({
        id: s.id, to: "customer", kind: "broadcast", title: s.title, body: s.body,
        image: "", href: "#/notifications", orderId: "", audience: s.audience || "all",
        sentAt: s.at || Date.now(), recipients: 1, opened: 0, read: false
      });
    });
    State.notifications.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  }

  function applySettings(s) {
    if (!s) return;
    const S = window.SEED.DEFAULT_SETTINGS;
    State.settings = Object.assign({}, State.settings, s);
    State.settings.hero = Object.assign({}, S.hero, s.hero || State.settings.hero || {});
    State.settings.delivery = Object.assign({}, S.delivery, s.delivery || State.settings.delivery || {});
    State.settings.notify = Object.assign({}, S.notify, s.notify || State.settings.notify || {});
    if (window.applyBranding) window.applyBranding();
  }

  function applyProducts(list) {
    if (!Array.isArray(list) || !list.length) return;
    State.products = list;
    if (window.PRODUCT_IMAGES) State.products.forEach((p) => { if (!p.image && window.PRODUCT_IMAGES[p.id]) p.image = window.PRODUCT_IMAGES[p.id]; });
  }

  function upsertOrder(o) {
    if (!o) return;
    const i = State.orders.findIndex((x) => x.id === o.id);
    if (i === -1) State.orders.unshift(o); else State.orders[i] = o;
    State.orders.sort((a, b) => b.createdAt - a.createdAt);
  }

  function upsertThread(t) {
    if (!t) return;
    let i = State.threads.findIndex((x) => x.id === t.id);
    if (i === -1 && t.phone) i = State.threads.findIndex((x) => x.phone === t.phone);
    if (i === -1) State.threads.unshift(t); else State.threads[i] = t;
  }

  function applyBootstrap(b) {
    if (!b) return;
    if (b.settings) applySettings(b.settings);
    if (b.products && b.products.length) applyProducts(b.products);
    if (Array.isArray(b.orders)) State.orders = b.orders;
    if (Array.isArray(b.threads)) State.threads = b.threads;
    if (b.thread) upsertThread(b.thread);
    if (Array.isArray(b.notifications)) mergeNotifications(b.notifications);
    if (typeof b.visits === "number") State.visits = b.visits;
    C.save();
    C.render();
    if (window.refreshBadges) window.refreshBadges();
  }

  /* ---------- معالجة أحداث البث اللحظي ---------- */
  function handleEvent(type, data) {
    if (type === "order:new") {
      upsertOrder(data);
      const role = window.API.role;
      if (role === "admin") {
        if (!State.adminNotifs.some((n) => n.orderId === data.id)) {
          C.Notify.push({ to: "admin", kind: "order", tag: "admin:order:" + data.id, title: "طلب جديد " + data.code, body: data.customer.name + " • " + C.money(data.total), href: "#/admin/orders", orderId: data.id, recipients: 1 });
        }
      } else if (data.customer && data.customer.phone && data.customer.phone === window.API.phone) {
        const tag = "order:" + data.id + ":new";
        if (!State.notifications.some((n) => n.tag === tag)) {
          C.Notify.push({ to: "customer", kind: "order", tag: tag, title: "تم استلام طلبك " + data.code + " 🎉", body: "شكرًا لك! طلبك قيد المراجعة وسيتم تأكيده قريبًا.", href: "#/order/" + data.id, orderId: data.id, recipients: 1 });
        }
      }
      softRerender();
    } else if (type === "order:update") {
      upsertOrder(data);
      const role = window.API.role;
      if (role === "user" && data.customer && data.customer.phone === window.API.phone) {
        const tag = "order:" + data.id + ":" + data.status;
        if (!State.notifications.some((n) => n.tag === tag)) {
          const meta = C.statusMeta(data.status);
          C.Notify.push({ to: "customer", kind: "order", tag: tag, title: meta.icon + " تحديث حالة الطلب " + data.code, body: "حالة طلبك الآن: " + meta.label, href: "#/order/" + data.id, orderId: data.id, recipients: 1 });
        }
        const r = C.parseHash();
        if (r.parts[0] === "order" || r.parts[0] === "orders") softRerender();
      }
      if (role === "admin") softRerenderAdmin();
    } else if (type === "message:new") {
      const thread = data.thread; const msg = data.message || {};
      upsertThread(thread);
      if (msg.from === "customer" && window.API.role === "admin") {
        if (!State.adminNotifs.some((n) => n.tag === "msg:" + thread.id + ":" + msg.at)) {
          C.Notify.push({ to: "admin", kind: "message", tag: "msg:" + thread.id + ":" + msg.at, title: "رسالة جديدة من " + thread.name, body: String(msg.text || "").slice(0, 80), href: "#/admin/messages", recipients: 1, silent: true });
        }
      }
      if (msg.from === "store" && window.API.role === "user" && thread.phone === window.API.phone) {
        if (!State.notifications.some((n) => n.tag === "msg:" + thread.id + ":" + msg.at)) {
          C.Notify.push({ to: "customer", kind: "message", tag: "msg:" + thread.id + ":" + msg.at, title: "رد من " + State.settings.storeName + " 💬", body: String(msg.text || "").slice(0, 80), href: "#/messages", recipients: 1 });
        }
      }
      if (window.onNewMessage) window.onNewMessage();
      softRerender(); softRerenderAdmin();
    } else if (type === "thread:update") {
      upsertThread(data); softRerender(); softRerenderAdmin();
    } else if (type === "notification:new") {
      mergeNotifications([data]);
      if (State.notifications.some((n) => n.id === data.id)) {
        // ظهر إشعار جديد للعميل
        if (window.API.role !== "admin") C.toast("🔔 " + data.title, "ok");
      }
      softRerender();
    } else if (type === "settings:update") {
      applySettings(data); C.render();
    } else if (type === "products:update") {
      applyProducts(data); C.render();
    } else if (type === "visits:update") {
      State.visits = data;
    }
  }

  function currentPath() { return C.parseHash().path; }
  function softRerender() {
    const p = currentPath();
    if (["/", "/products", "/product", "/cart", "/checkout", "/order", "/orders", "/messages", "/account", "/notifications"].includes(p)) {
      try { C.render(); } catch (e) { }
    }
  }
  function softRerenderAdmin() {
    const r = C.parseHash();
    if (r.parts[0] === "admin" && State.adminAuthed) { try { C.render(); } catch (e) { } }
  }

  /* ---------- التشغيل ---------- */
  async function connect() {
    window.API.role = State.adminAuthed ? "admin" : "user";
    window.API.phone = C.Chat.phone();
    const b = await window.API.bootstrap();
    if (State.adminAuthed && b && !b.admin) { State.adminAuthed = false; C.save(); try { window.API.clearToken(); } catch (e) { } }
    applyBootstrap(b);
    window.API.stream(handleEvent);
  }

  async function start() {
    const ok = await window.API.init();
    if (!ok) return false;
    try {
      if (State.adminAuthed && window.API.token == null) {
        // لو الجلسة محفوظة بس التوكن مش موجود، نحتاج نعيد الدخول
        State.adminAuthed = false; C.save();
      }
      await connect();
    } catch (e) { /* ignore */ }
    return true;
  }

  /* بعد تسجيل دخول المالك: اجلب بيانات الإدارة وابدأ بث الأدمن */
  async function refreshForAdmin() {
    if (!window.API.enabled) return;
    window.API.role = "admin";
    const b = await window.API.bootstrap();
    applyBootstrap(b);
    window.API.stream(handleEvent);
  }

  /* عميل سجّل دخول/حفظ رقمه: أعد المزامنة بالرقم الجديد */
  function refreshForCustomer() {
    if (!window.API.enabled) return;
    window.API.role = State.adminAuthed ? "admin" : "user";
    window.API.phone = C.Chat.phone();
    window.API.bootstrap().then((b) => { applyBootstrap(b); window.API.stream(handleEvent); });
  }

  window.Sync = {
    start, connect, refreshForAdmin, refreshForCustomer,
    applyBootstrap, upsertOrder, upsertThread, handleEvent
  };
})();
