/* ============================================================
   طبقة الاتصال بالسيرفر (اختيارية)
   ------------------------------------------------------------
   لو السيرفر (server/server.js) شغّال، الرسائل والطلبات والإشعارات
   بتتزامن لحظيًا بين كل الأجهزة. لو مش شغّال، الموقع يشتغل عادي
   بالبيانات المحلية (localStorage) من غير أي مشاكل.
   ============================================================ */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG || {};

  function resolveBase() {
    // أولوية: ?api= في الرابط ثم apiBase في الإعدادات ثم نفس الأصل
    try {
      const q = new URLSearchParams(location.search);
      const api = q.get("api");
      if (api !== null) return api.replace(/\/+$/, "");
    } catch (e) { }
    if (CFG.apiBase) return String(CFG.apiBase).replace(/\/+$/, "");
    return "";
  }

  const API = {
    enabled: false,
    base: resolveBase(),
    token: null,
    _es: null,
    _onEvent: null,
    role: "user",
    phone: "",

    url(path) { return this.base + path; },

    headers(extra) {
      const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
      if (this.token) h["X-Token"] = this.token;
      return h;
    },

    /* التحقق من وجود السيرفر — مع مهلة قصيرة */
    async init() {
      try {
        try { const t = localStorage.getItem("amanah_admin_token"); if (t) this.token = t; } catch (e) { }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        const r = await fetch(this.url("/api/ping"), { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(timer);
        if (!r.ok) { this.enabled = false; return false; }
        const j = await r.json();
        this.enabled = !!(j && j.ok);
        return this.enabled;
      } catch (e) { this.enabled = false; return false; }
    },

    async req(path, method, body) {
      if (!this.enabled) return null;
      try {
        const r = await fetch(this.url(path), {
          method: method || "GET",
          headers: this.headers(),
          body: body != null ? JSON.stringify(body) : undefined,
          cache: "no-store"
        });
        const j = await r.json().catch(() => null);
        return { status: r.status, ok: r.ok, body: j };
      } catch (e) { return { status: 0, ok: false, body: null, err: e.message }; }
    },

    /* ---- المصادقة ---- */
    async login(password) {
      const r = await this.req("/api/login", "POST", { password });
      if (r && r.ok && r.body && r.body.token) { this.token = r.body.token; try { localStorage.setItem("amanah_admin_token", this.token); } catch (e) { } return true; }
      return false;
    },
    clearToken() { this.token = null; try { localStorage.removeItem("amanah_admin_token"); } catch (e) { } },

    /* ---- جلب البيانات الأولية ---- */
    async bootstrap() {
      const q = this.phone ? "?phone=" + encodeURIComponent(this.phone) : "";
      const r = await this.req("/api/bootstrap" + q, "GET");
      return r && r.ok ? r.body : null;
    },

    /* ---- طلبات ---- */
    postOrder(order) { return this.req("/api/orders", "POST", { order }); },
    setOrderStatus(id, status, paid) {
      const b = { id }; if (status) b.status = status; if (typeof paid === "boolean") b.paid = paid;
      return this.req("/api/orders/status", "POST", b);
    },

    /* ---- رسائل ---- */
    sendMessage(m) { return this.req("/api/message", "POST", m); },
    threadRead(phone, unread) { return this.req("/api/thread-read", "POST", { phone, unread }); },

    /* ---- إشعارات ---- */
    notify(n) { return this.req("/api/notify", "POST", n); },

    /* ---- إعدادات ومنتجات ---- */
    saveSettings(s) { return this.req("/api/settings", "POST", { settings: s }); },
    saveProducts(list) { return this.req("/api/products", "POST", { products: list }); },
    deleteProduct(id) { return this.req("/api/products/" + encodeURIComponent(id), "DELETE"); },

    /* ---- زيارات ---- */
    visits() { return this.req("/api/visits", "POST", {}); },

    /* ---- البث اللحظي ---- */
    stream(onEvent) {
      if (!this.enabled || typeof EventSource === "undefined") return;
      this._onEvent = onEvent;
      const qs = "?role=" + encodeURIComponent(this.role) + (this.phone ? "&phone=" + encodeURIComponent(this.phone) : "");
      try {
        if (this._es) { this._es.close(); }
        const es = new EventSource(this.url("/api/stream" + qs));
        this._es = es;
        const types = ["order:new", "order:update", "message:new", "thread:update", "notification:new", "settings:update", "products:update", "visits:update"];
        types.forEach((t) => es.addEventListener(t, (ev) => {
          let data = null; try { data = JSON.parse(ev.data); } catch (e) { }
          if (onEvent) onEvent(t, data);
        }));
        es.onerror = function () { /* المتصفح يعيد الاتصال تلقائيًا */ };
      } catch (e) { /* ignore */ }
    },

    close() { if (this._es) { try { this._es.close(); } catch (e) { } this._es = null; } }
  };

  window.API = API;
})();
