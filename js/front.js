/* ================= واجهة المتجر (العميل) ================= */
(function () {
  "use strict";
  const { esc, money, dateTime, relTime, statusMeta, ORDER_STATUSES, State, Cart, Orders, Auth, Notify, Chat, toast, modal, closeModal } = window.Core;

  const Views = {};
  const After = {};

  /* ---------- عناصر مساعدة ---------- */
  function price(amount, was) {
    return '<span class="price">' + money(amount) + (was ? '<span class="was">' + money(was) + "</span>" : "") + "</span>";
  }
  function finalPrice(p) { return Math.round(p.price * (1 - (p.discount || 0) / 100) * 100) / 100; }
  function thumb(p, cls) {
    if (p.image) return '<div class="' + (cls || "thumb") + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" /></div>';
    return '<div class="' + (cls || "thumb") + '">' + (p.emoji || "🛒") + "</div>";
  }
  function catName(id) { const c = window.SEED.CATEGORIES.find((x) => x.id === id); return c ? c.name : id; }
  function catEmoji(id) { const c = window.SEED.CATEGORIES.find((x) => x.id === id); return c ? c.emoji : "🛒"; }
  // الأقسام اللي فيها منتجات فعلية بس (عشان مانعرضش أقسام فاضية)
  function activeCats() {
    const used = {};
    State.products.forEach((p) => { if (p.active !== false) used[p.cat] = 1; });
    return window.SEED.CATEGORIES.filter((c) => used[c.id]);
  }
  function isAvail(p) { return p.available !== false && p.stock > 0; }
  function stockLabel(p) {
    if (!isAvail(p)) return '<span class="pill red">غير متوفر</span>';
    if (p.stock <= State.settings.lowStock) return '<span class="pill amber">آخر ' + p.stock + " " + esc(p.unit) + "</span>";
    return '<span class="pill green">متوفر ' + p.stock + " " + esc(p.unit) + "</span>";
  }
  function qtyControl(p) {
    const q = Cart.qtyOf(p.id);
    if (q > 0) {
      return '<div class="qty"><button data-action="qty-dec" data-id="' + p.id + '">−</button><b>' + q + '</b><button data-action="qty-inc" data-id="' + p.id + '">+</button></div>';
    }
    return '<button class="add" data-action="add-to-cart" data-id="' + p.id + '" title="أضف للسلة"' + (!isAvail(p) ? " disabled" : "") + ">＋</button>";
  }
  function productCard(p) {
    const fp = finalPrice(p), hasDisc = (p.discount || 0) > 0;
    return '<article class="pcard">' +
      '<a href="#/product/' + p.id + '" data-action="nav" data-href="#/product/' + p.id + '">' +
      thumb(p) +
      (hasDisc ? '<span class="disc">خصم ' + p.discount + "%</span>" : "") +
      (!isAvail(p) ? '<span class="out">غير متوفر</span>' : "") +
      "</a>" +
      '<div class="body">' +
      '<span class="cat">' + catEmoji(p.cat) + " " + esc(catName(p.cat)) + "</span>" +
      '<a class="name" href="#/product/' + p.id + '" data-action="nav" data-href="#/product/' + p.id + '">' + esc(p.name) + "</a>" +
      '<span class="unit">' + esc(p.unit) + " • " + (isAvail(p) ? "متوفر" : "غير متوفر") + "</span>" +
      '<div class="price-row">' + price(fp, hasDisc ? p.price : null) + qtyControl(p) + "</div>" +
      "</div></article>";
  }
  function productGrid(list, emptyMsg) {
    if (!list.length) return '<div class="empty"><span class="big">🔍</span>' + esc(emptyMsg || "لا توجد منتجات مطابقة") + "</div>";
    return '<div class="product-grid">' + list.map(productCard).join("") + "</div>";
  }
  function confidence() {
    return '<div class="grid3" style="margin-bottom:18px">' +
      '<div class="card card-pad" style="text-align:center"><div style="font-size:1.6rem">🚚</div><b style="font-size:.82rem">توصيل سريع</b><div class="muted small">' + esc(State.settings.delivery.time) + "</div></div>" +
      '<div class="card card-pad" style="text-align:center"><div style="font-size:1.6rem">💵</div><b style="font-size:.82rem">دفع عند الاستلام</b><div class="muted small">ادفع لما يوصلك الطلب</div></div>' +
      '<div class="card card-pad" style="text-align:center"><div style="font-size:1.6rem">🏪</div><b style="font-size:.82rem">بقالة كاملة</b><div class="muted small">كل حاجة ناقصة في بيتك</div></div>' +
      "</div>";
  }

  /* ================= الرئيسية ================= */
  Views.home = function () {
    const s = State.settings;
    const prods = State.products.filter((p) => p.active !== false);
    const offers = prods.filter((p) => (p.discount || 0) > 0).slice(0, 4);
    const best = prods.slice().sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 8);
    const quickCats = activeCats().map((c) => c.id);
    let html = "";
    if (s.hero.enabled) {
      html += '<section class="hero"><span class="hero-emoji">🧺</span>' +
        (s.hero.discount ? '<span class="badge-discount">خصم حتى ' + s.hero.discount + "%</span>" : "") +
        "<h1>" + esc(s.hero.title) + "</h1><p>" + esc(s.hero.text) + "</p>" +
        '<div class="hero-actions"><button class="btn" data-action="nav" data-href="#/products">🛒 ' + esc(s.hero.cta || "تسوق الآن") + "</button>" +
        '<button class="btn ghost" data-action="nav" data-href="#/orders">📍 تتبع طلبي</button></div></section>';
    }
    html += confidence();
    html += '<section class="section"><div class="section-head"><h2>الأقسام</h2><button class="link-btn" data-action="nav" data-href="#/products">عرض الكل</button></div>' +
      '<div class="chips">' + quickCats.map((c) => '<button class="chip" data-action="nav" data-href="#/products?cat=' + c + '">' + catEmoji(c) + " " + esc(catName(c)) + "</button>").join("") + "</div></section>";
    if (offers.length) html += '<section class="section"><div class="section-head"><h2>🔥 عروض وخصومات</h2><button class="link-btn" data-action="nav" data-href="#/products">الكل</button></div>' + productGrid(offers) + "</section>";
    html += '<section class="section"><div class="section-head"><h2>⭐ الأكثر مبيعًا</h2><button class="link-btn" data-action="nav" data-href="#/products">عرض الكل</button></div>' + productGrid(best) + "</section>";
    html += '<section class="section"><div class="section-head"><h2>🛒 منتجاتنا</h2><button class="link-btn" data-action="nav" data-href="#/products">عرض الكل</button></div>' + productGrid(prods.slice(0, 8)) + "</section>";
    html += installBanner();
    return html;
  };

  function installBanner() {
    const url = location.origin + location.pathname;
    return '<section class=\"card card-pad\" id=\"installCard\" style=\"display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap\">' +
      '<div><b>📲 ثبّت الموقع كتطبيق على موبايلك</b><div class=\"muted small\">وصول أسرع + إشعارات فورية بتحديثات طلبك</div></div>' +
      '<div class=\"row\"><button class=\"btn sm\" id=\"btnInstall\">تثبيت التطبيق</button>' +
      '<button class=\"btn ghost sm\" data-action=\"enable-notif\">🔔 تفعيل الإشعارات</button></div></section>' +
      '<section class=\"card card-pad\" style=\"margin-top:10px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap\">' +
      '<div><b>📤 شارك المتجر مع أصحابك</b><div class=\"muted small\">رابط مباشر — واتساب أو تليجرام أو انسخ الرابط</div></div>' +
      '<div class=\"row\" style=\"gap:6px\">' +
      '<a class="btn ghost sm" href="https://wa.me/?text=' + encodeURIComponent(State.settings.storeName + " - " + url) + '" target="_blank" rel="noopener">واتساب</a>' +
      '<a class="btn ghost sm" href="https://t.me/share/url?url=' + encodeURIComponent(url) + "&text=" + encodeURIComponent(State.settings.storeName) + '" target="_blank" rel="noopener">تليجرام</a>' +
      '<button class=\"btn sm\" data-action=\"share-copy\" data-url=\"' + esc(url) + '\">نسخ الرابط</button></div></section>';
  }

  /* ================= المنتجات ================= */
  function filteredProducts() {
    const u = State.ui;
    let list = State.products.filter((p) => p.active !== false);
    if (u.cat && u.cat !== "all") list = list.filter((p) => p.cat === u.cat);
    if (u.q) {
      const q = u.q.trim();
      list = list.filter((p) => (p.name + " " + (p.desc || "") + " " + catName(p.cat)).indexOf(q) > -1);
    }
    const sorters = {
      popular: (a, b) => (b.sold || 0) - (a.sold || 0),
      priceAsc: (a, b) => finalPrice(a) - finalPrice(b),
      priceDesc: (a, b) => finalPrice(b) - finalPrice(a),
      disc: (a, b) => (b.discount || 0) - (a.discount || 0),
      name: (a, b) => a.name.localeCompare(b.name, "ar")
    };
    return list.sort(sorters[u.sort] || sorters.popular);
  }
  function productsShell() {
    const u = State.ui;
    const cats = [{ id: "all", name: "الكل", emoji: "🧺" }].concat(activeCats());
    return '<section class="section">' +
      '<div class="toolbar">' +
      '<input type="search" id="prodSearch" placeholder="🔍 دوّر على منتج… (شيبس، أوريو، جبنة، حلاوة)" value="' + esc(u.q) + '" data-input="search" style="flex:1;min-width:180px" />' +
      '<select data-change="sort">' +
      ["popular:الأكثر مبيعًا", "priceAsc:الأرخص أولًا", "priceDesc:الأغلى أولًا", "disc:أعلى خصم", "name:الاسم أ-ي"]
        .map((o) => { const [v, l] = o.split(":"); return '<option value="' + v + '"' + (u.sort === v ? " selected" : "") + ">" + l + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="chips" style="margin-bottom:12px">' + cats.map((c) => '<button class="chip' + (u.cat === c.id ? " active" : "") + '" data-action="filter-cat" data-cat="' + c.id + '">' + c.emoji + " " + esc(c.name) + "</button>").join("") + "</div>" +
      '<div id="prodGrid">' + productGrid(filteredProducts()) + "</div></section>";
  }
  Views.products = function (r) {
    if (r.params.cat) State.ui.cat = r.params.cat;
    return '<div class="section-head"><h2>🧺 كل المنتجات</h2><span class="muted small">' + State.products.filter((p) => p.active !== false).length + " منتج</span></div>" + productsShell();
  };
  Views._renderProducts = function () {
    const g = document.getElementById("prodGrid");
    if (g) g.innerHTML = productGrid(filteredProducts());
    const c = document.querySelectorAll(".chips .chip");
    c.forEach((el) => el.classList.toggle("active", (el.dataset.cat || "") === State.ui.cat));
  };

  /* ================= صفحة المنتج ================= */
  Views.product = function (r) {
    const id = r.parts[1];
    const p = State.products.find((x) => x.id === id);
    if (!p) return '<div class="empty"><span class="big">😕</span>المنتج غير موجود<button class="btn" style="margin-top:10px" data-action="nav" data-href="#/products">رجوع للمنتجات</button></div>';
    const fp = finalPrice(p), hasDisc = (p.discount || 0) > 0;
    const related = State.products.filter((x) => x.cat === p.cat && x.id !== p.id && x.active !== false).slice(0, 4);
    return '<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-action="nav" data-href="#/products">← رجوع للمنتجات</button></div>' +
      '<div class="card card-pad"><div class="grid2" style="grid-template-columns:1fr;gap:16px">' +
      '<div>' + thumb(p, "thumb") + "</div>" +
      "<div>" +
      '<span class="cat muted small">' + catEmoji(p.cat) + " " + esc(catName(p.cat)) + "</span>" +
      "<h1 style=\"font-size:1.35rem;margin:4px 0 8px\">" + esc(p.name) + "</h1>" +
      '<div class="row wrap" style="gap:8px;margin-bottom:10px">' + stockLabel(p) + (hasDisc ? '<span class="pill orange">خصم ' + p.discount + "%</span>" : "") + '<span class="pill grey">باع ' + (p.sold || 0) + " " + esc(p.unit) + "</span></div>" +
      '<div style="font-size:1.5rem;margin-bottom:6px">' + price(fp, hasDisc ? p.price : null) + ' <small class="muted" style="font-size:.75rem">/ ' + esc(p.unit) + "</small></div>" +
      '<p class="muted" style="font-size:.9rem">' + esc(p.desc || "") + "</p>" +
      '<div class="row wrap" style="gap:10px;margin:14px 0">' + qtyControl(p) +
      '<button class="btn" data-action="add-to-cart" data-id="' + p.id + '"' + (!isAvail(p) ? " disabled" : "") + ">أضف إلى السلة</button>" +
      '<button class="btn orange" data-action="buy-now" data-id="' + p.id + '"' + (!isAvail(p) ? " disabled" : "") + ">اشترِ الآن ⚡</button></div>" +
      (p.specs && p.specs.length ? '<div class="divider"></div><h3 style="font-size:.95rem;margin-bottom:6px">المواصفات</h3><div class="stack">' + p.specs.map((s) => '<div class="kv"><span class="muted">• ' + esc(s) + "</span></div>").join("") + "</div>" : "") +
      "</div></div></div>" +
      (related.length ? '<section class="section" style="margin-top:18px"><h2 style="font-size:1.02rem;margin-bottom:10px">منتجات مشابهة</h2>' + productGrid(related) + "</section>" : "");
  };

  /* ================= السلة ================= */
  Views.cart = function () {
    const items = Cart.items();
    if (!items.length) {
      return '<div class="empty"><span class="big">🛒</span><h3>سلتك فاضية حاليًا</h3><p class="muted">تصفح منتجاتنا وأضف اللي يعجبك</p>' +
        '<button class="btn" data-action="nav" data-href="#/products">تصفح المنتجات</button></div>';
    }
    const d = State.settings.delivery;
    return '<div class="section-head"><h2>🛒 سلة التسوق</h2><button class="link-btn" data-action="cart-clear">تفريغ السلة</button></div>' +
      '<div class="card card-pad">' + items.map((i) => {
        const p = i.product;
        return '<div class="line-item">' + thumb(p, "li-thumb") +
          '<div class="li-main"><b>' + esc(p.name) + "</b><span>" + money(finalPrice(p)) + " × " + i.qty + " " + esc(p.unit) + " = <b>" + money(i.line) + "</b></span></div>" +
          '<div class="qty"><button data-action="qty-dec" data-id="' + p.id + '">−</button><b>' + i.qty + '</b><button data-action="qty-inc" data-id="' + p.id + '">+</button></div>' +
          '<button class="x-btn" data-action="cart-remove" data-id="' + p.id + '" title="حذف">🗑️</button></div>';
      }).join("") + "</div>" +
      '<div class="card card-pad" style="margin-top:12px">' +
      '<div class="kv"><span>المجموع الفرعي</span><b>' + money(Cart.sub()) + "</b></div>" +
      '<div class="kv"><span>الشحن' + (Cart.fee() === 0 ? " (مجاني 🎉)" : "") + "</span><b>" + money(Cart.fee()) + "</b></div>" +
      '<div class="kv total-row"><span>الإجمالي</span><b>' + money(Cart.total()) + "</b></div>" +
      (State.settings.delivery.minOrder > Cart.sub() ? '<div class="notice" style="margin-top:8px">الحد الأدنى للطلب ' + money(State.settings.delivery.minOrder) + " — ناقصك " + money(State.settings.delivery.minOrder - Cart.sub()) + ".</div>" : "") +
      (Cart.sub() < d.freeOver ? '<div class="notice blue" style="margin-top:8px">اطلب بـ ' + money(d.freeOver - Cart.sub()) + " كمان وتحصل على شحن مجاني 🚚</div>" : "") +
      '<button class="btn block lg" style="margin-top:10px" data-action="nav" data-href="#/checkout"' + (Cart.sub() < d.minOrder ? " disabled" : "") + ">إتمام الطلب ←</button>" +
      "</div>";
  };

  /* ================= إتمام الطلب ================= */
  Views.checkout = function () {
    const items = Cart.items();
    if (!items.length) return '<div class="empty"><span class="big">🛒</span>السلة فاضية</div>';
    const u = Auth.current();
    const d = State.settings.delivery;
    return '<div class="section-head"><h2>📦 إتمام الطلب</h2><button class="link-btn" data-action="nav" data-href="#/cart">← رجوع للسلة</button></div>' +
      '<form data-form="checkout"><div class="grid2" style="grid-template-columns:1fr;gap:12px">' +
      '<div class="card card-pad">' +
      "<h3 style=\"font-size:.98rem;margin-bottom:10px\">بيانات التوصيل</h3>" +
      '<div class="field"><label>الاسم بالكامل *</label><input name="name" required placeholder="مثال: محمد أحمد" value="' + esc(u ? u.name : "") + '" /></div>' +
      '<div class="field"><label>رقم الهاتف *</label><input name="phone" required inputmode="tel" placeholder="01xxxxxxxxx" value="' + esc(u ? u.phone : "") + '" /></div>' +
      '<div class="grid2"><div class="field"><label>المدينة / المنطقة *</label><select name="city" required>' + d.areas.map((a) => '<option value="' + esc(a) + '"' + (u && u.city === a ? " selected" : "") + ">" + esc(a) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>الشارع / الحي</label><input name="area" placeholder="مثال: شارع السوق - إنشاص الرمل" /></div></div>' +
      '<div class="field"><label>العنوان التفصيلي *</label><input name="address" required placeholder="رقم العمارة، الدور، الشقة" value="' + esc(u ? u.address : "") + '" /></div>' +
      '<div class="field"><label>ملاحظات (اختياري)</label><textarea name="notes" placeholder="مثال: اتصل قبل الوصول"></textarea></div>' +
      "</div>" +
      '<div class="card card-pad">' +
      "<h3 style=\"font-size:.98rem;margin-bottom:10px\">طريقة الدفع</h3>" +
      '<label class="row" style="gap:8px;padding:9px 0"><input type="radio" name="payment" value="cod" checked /> <span>💵 الدفع عند الاستلام <small class="muted">(ادفع كاش لما يوصلك الطلب)</small></span></label>' +
      '<div class="notice green" style="margin-top:8px">⏱️ ' + esc(d.time) + "</div>" +
      '<div class="divider"></div>' +
      "<h3 style=\"font-size:.98rem;margin-bottom:6px\">ملخص الطلب</h3>" +
      items.map((i) => '<div class="kv"><span>' + esc(i.product.name) + " × " + i.qty + "</span><b>" + money(i.line) + "</b></div>").join("") +
      '<div class="kv"><span>الشحن</span><b>' + money(Cart.fee()) + "</b></div>" +
      '<div class="kv total-row"><span>الإجمالي</span><b>' + money(Cart.total()) + "</b></div>" +
      '<button class="btn block lg" type="submit" style="margin-top:10px">تأكيد الطلب ✅</button>' +
      '<p class="muted small" style="margin-top:8px">بالضغط على تأكيد الطلب أنت توافق على <a href="#" data-action="page" data-page="terms">الشروط والأحكام</a>.</p>' +
      "</div></div></form>";
  };

  /* ================= صفحة الطلب / التتبع ================= */
  function timeline(o) {
    const idx = ORDER_STATUSES.findIndex((s) => s.id === o.status);
    if (o.status === "cancelled") {
      return '<div class="timeline">' +
        '<div class="tl-step done"><span class="tl-dot">✔</span><div class="tl-text"><b>تم استلام الطلب</b><span>' + dateTime(o.createdAt) + "</span></div></div>" +
        '<div class="tl-step current"><span class="tl-dot">✕</span><div class="tl-text"><b>تم إلغاء الطلب</b><span>' + relTime(o.history[o.history.length - 1].at) + "</span></div></div></div>";
    }
    return '<div class="timeline">' + ORDER_STATUSES.slice(0, 5).map((s, i) => {
      const h = o.history.find((x) => x.status === s.id);
      const cls = i < idx ? "done" : (i === idx ? "current" : "");
      return '<div class="tl-step ' + cls + '"><span class="tl-dot">' + (i <= idx ? "✔" : i + 1) + '</span><div class="tl-text"><b>' + s.label + "</b><span>" + (h ? dateTime(h.at) : "في الانتظار") + "</span></div></div>";
    }).join("") + "</div>";
  }
  function orderDetail(o, opts) {
    const meta = statusMeta(o.status);
    return '<div class="card card-pad">' +
      '<div class="row between wrap"><div><div class="muted small">رقم الطلب</div><b style="font-size:1.1rem">' + esc(o.code) + "</b></div>" +
      '<span class="pill ' + meta.pill + ' status-badge">' + meta.icon + " " + meta.label + "</span></div>" +
      '<div class="divider"></div>' +
      '<div class="stack">' + o.items.map((it) => '<div class="kv"><span>' + (it.emoji || "🛒") + " " + esc(it.name) + " × " + it.qty + " " + esc(it.unit || "") + "</span><b>" + money(it.price * it.qty) + "</b></div>").join("") + "</div>" +
      '<div class="kv"><span>المجموع الفرعي</span><b>' + money(o.subtotal) + "</b></div>" +
      '<div class="kv"><span>الشحن</span><b>' + money(o.delivery) + "</b></div>" +
      '<div class="kv total-row"><span>الإجمالي</span><b>' + money(o.total) + "</b></div>" +
      '<div class="kv"><span>طريقة الدفع</span><b>' + (window.Core.PAYMENT_LABELS[o.payment] || o.payment) + (o.paid ? " (مدفوع)" : " (غير مدفوع)") + "</b></div>" +
      '<div class="divider"></div>' +
      '<div class="muted small">عنوان التوصيل</div>' +
      "<b>" + esc(o.customer.name) + "</b> — " + esc(o.customer.phone) + "<br><span class=\"muted\">" + esc(o.customer.city) + "، " + esc(o.customer.area || "") + "، " + esc(o.customer.address) + "</span>" +
      (o.customer.notes ? '<div class="muted small">📝 ' + esc(o.customer.notes) + "</div>" : "") +
      (!opts || opts.timeline !== false ? '<div class="divider"></div><h3 style="font-size:.95rem;margin-bottom:4px">حالة الطلب</h3>' + timeline(o) : "") +
      '<div class="row wrap" style="gap:8px;margin-top:12px">' +
      '<button class="btn ghost sm" data-action="nav" data-href="#/messages">💬 تواصل معنا</button>' +
      '<a class="btn ghost sm" href="tel:' + esc(State.settings.supportPhone) + '">📞 اتصل بالمتجر</a>' +
      '<button class="btn ghost sm" data-action="nav" data-href="#/products">🛒 متابعة التسوق</button>' +
      "</div></div>";
  }
  Views.order = function (r) {
    const o = Orders.find(r.parts[1]);
    if (!o) return '<div class="empty"><span class="big">🔎</span>لم نجد هذا الطلب</div>';
    return '<section class="section">' +
      '<div class="empty card-pad" style="background:var(--green-050);border:0;color:var(--green-600)"><span class="big">🎉</span>' +
      "<h3>شكرًا لك! تم استلام طلبك</h3><p class=\"muted\">رقم الطلب <b>" + esc(o.code) + "</b> — هنكلمك لتأكيد الطلب وتحديد ميعاد التوصيل.</p></div>" +
      '<div style="margin-top:12px">' + orderDetail(o) + "</div></section>";
  };
  Views.orders = function () {
    const u = Auth.current();
    const phone = (u && u.phone) || State.guestPhone || "";
    const list = phone ? Orders.byPhone(phone) : [];
    return '<div class="section-head"><h2>📍 تتبع طلباتي</h2></div>' +
      '<div class="card card-pad">' +
      '<div class="field"><label>اكتب رقم الموبايل اللي طلبت بيه</label>' +
      '<div class="row"><input id="trackPhone" placeholder="01xxxxxxxxx" value="' + esc(phone) + '" inputmode="tel" style="flex:1" />' +
      '<button class="btn" data-action="track-orders">عرض</button></div></div>' +
      '<div id="trackResults">' + (list.length ? list.map((o) => '<div style="margin-top:10px">' + orderDetail(o, { timeline: false }) + "</div>").join("") : (phone ? '<div class="empty">لا توجد طلبات لهذا الرقم</div>' : "")) + "</div>" +
      "</div>";
  };

  /* ================= الرسائل ================= */
  function chatBody(thread, who) {
    return '<div class="chat-wrap"><div class="chat-body" id="chatBody">' +
      (thread.messages.length ? thread.messages.map((m) => {
        const mine = (who === "customer" && m.from === "customer") || (who === "store" && m.from === "store");
        return '<div class="msg ' + (mine ? "from-store" : "from-customer") + '">' + esc(m.text) + '<span class="t">' + window.Core.clockTime(m.at) + "</span></div>";
      }).join("") : '<div class="empty" style="margin:auto">ابدأ المحادثة مع المتجر 👋</div>') +
      "</div>" +
      '<div class="quick-replies">' + window.SEED.QUICK_REPLIES.slice(0, 4).map((q, i) => '<button class="chip" data-action="quick-reply" data-text="' + esc(q) + '">' + esc(q) + "</button>").join("") + "</div>" +
      '<div class="chat-input"><input id="chatText" placeholder="اكتب رسالتك…" /><button class="btn" data-action="send-chat">إرسال</button></div></div>';
  }
  Views.messages = function () {
    const t = Chat.myThread();
    return '<div class="section-head"><h2>💬 رسائل المتجر</h2><span class="muted small">' + esc(State.settings.hours) + "</span></div>" +
      '<div class="card" style="padding:10px">' + chatBody(t, "customer") + "</div>" +
      '<div class="notice blue" style="margin-top:10px">تقدر تكلمنا على واتساب/تليفون: ' + esc(State.settings.supportPhone) + "</div>";
  };

  /* ================= حسابي ================= */
  Views.account = function () {
    const u = Auth.current();
    if (!u) {
      return '<div class="section-head"><h2>👤 حسابي</h2></div>' +
        '<div class="auth-card"><div class="tabs"><button class="active" data-action="auth-tab" data-tab="login">تسجيل الدخول</button><button data-action="auth-tab" data-tab="signup">حساب جديد</button></div>' +
        '<form data-form="login" id="formLogin">' +
        '<div class="field"><label>البريد الإلكتروني أو رقم الموبايل</label><input name="email" required placeholder="you@example.com" /></div>' +
        '<div class="field"><label>كلمة المرور</label><input name="password" type="password" required placeholder="••••••" /></div>' +
        '<button class="btn block lg" type="submit">دخول</button></form>' +
        '<form data-form="signup" id="formSignup" class="hidden">' +
        '<div class="field"><label>الاسم</label><input name="name" required placeholder="اسمك بالكامل" /></div>' +
        '<div class="field"><label>رقم الموبايل</label><input name="phone" required inputmode="tel" placeholder="01xxxxxxxxx" /></div>' +
        '<div class="field"><label>البريد الإلكتروني</label><input name="email" required type="email" placeholder="you@example.com" /></div>' +
        '<div class="field"><label>كلمة المرور</label><input name="password" required type="password" placeholder="••••••" /></div>' +
        '<div class="field"><label>المدينة</label><select name="city">' + State.settings.delivery.areas.map((a) => "<option>" + esc(a) + "</option>").join("") + "</select></div>" +
        '<div class="field"><label>العنوان</label><input name="address" placeholder="رقم العمارة، الدور، الشقة" /></div>' +
        '<button class="btn block lg" type="submit">إنشاء الحساب</button></form>' +
        '<p class="muted small" style="margin-top:10px">التسجيل بيخليك تتابع طلباتك أسهل وتراسل المتجر مباشرة. بياناتك محفوظة على جهازك.</p>' +
        "</div>";
    }
    const myOrders = Orders.byPhone(u.phone || "___");
    return '<div class="section-head"><h2>👤 حسابي</h2><button class="link-btn" data-action="logout">تسجيل الخروج</button></div>' +
      '<div class="card card-pad"><div class="row" style="gap:12px"><div class="li-thumb" style="width:54px;height:54px;font-size:1.6rem">🙋</div>' +
      "<div><b>" + esc(u.name) + "</b><div class=\"muted small\">" + esc(u.email) + " • " + esc(u.phone || "بدون رقم") + "</div></div></div>" +
      '<div class="divider"></div>' +
      '<form data-form="profile"><div class="grid2">' +
      '<div class="field"><label>الاسم</label><input name="name" value="' + esc(u.name) + '" /></div>' +
      '<div class="field"><label>رقم الموبايل</label><input name="phone" value="' + esc(u.phone || "") + '" /></div>' +
      '<div class="field"><label>المدينة</label><select name="city">' + State.settings.delivery.areas.map((a) => '<option' + (u.city === a ? " selected" : "") + ">" + esc(a) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>العنوان</label><input name="address" value="' + esc(u.address || "") + '" /></div>' +
      "</div><button class=\"btn\" type=\"submit\">حفظ البيانات</button></form></div>" +
      '<section class="section"><div class="section-head"><h3>🧾 طلباتي (' + myOrders.length + ")</h3></div>" +
      (myOrders.length ? myOrders.map((o) => '<div style="margin-bottom:10px">' + orderDetail(o, { timeline: false }) + "</div>").join("") : '<div class="empty">لسه مفيش طلبات — يلا نبدأ التسوق!</div>') + "</section>" +
      '<section class="section card card-pad"><div class="row between wrap" style="gap:10px"><div><b>🔔 إشعارات الجهاز</b><div class="muted small">فعّل الإشعارات عشان تعرف تحديثات طلبك أول بأول</div></div><button class="btn sm" data-action="enable-notif">تفعيل</button></div></section>' +
      '<section class="section"><button class="btn dark block" data-action="admin-login">' + (State.adminAuthed ? "⚙️ افتح لوحة التحكم" : "🔐 دخول المالك — لوحة التحكم") + "</button></section>";
  };

  /* ================= الإشعارات (صندوق العميل) ================= */
  Views.notifications = function () {
    const list = State.notifications;
    return '<div class="section-head"><h2>🔔 الإشعارات</h2>' + (list.length ? '<button class="link-btn" data-action="notif-read-all">تحديد الكل كمقروء</button>' : "") + "</div>" +
      (Notify.granted() ? "" : '<div class="notice" style="margin-bottom:10px">الإشعارات غير مفعّلة على هذا الجهاز. <button class="link-btn" data-action="enable-notif">فعّل الآن</button></div>') +
      (list.length ? '<div class="card">' + list.map((n) => {
        const icon = n.kind === "order" ? "📦" : (n.kind === "message" ? "💬" : "📣");
        return '<div class="line-item" style="padding:12px 14px">' +
          '<div class="li-thumb">' + icon + "</div>" +
          '<div class="li-main"><b>' + esc(n.title) + (n.read ? "" : ' <span class="pill green">جديد</span>') + "</b><span>" + esc(n.body) + "</span>" +
          '<span class="muted" style="font-size:.72rem">' + relTime(n.sentAt) + "</span></div>" +
          (n.href ? '<button class="btn ghost sm" data-action="nav" data-href="' + esc(n.href) + '">فتح</button>' : "") +
          "</div>";
      }).join("") + "</div>" : '<div class="empty"><span class="big">🔕</span>لا توجد إشعارات حتى الآن</div>');
  };

  /* ================= أحداث إضافية ================= */
  Object.assign(window.Core.Actions, {
    "share-copy"(el) {
      const url = el.dataset.url || location.href;
      const done = () => toast("تم نسخ الرابط 📋", "ok");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy());
      } else fallbackCopy();
      function fallbackCopy() {
        const i = document.createElement("input");
        i.value = url; document.body.appendChild(i); i.select();
        try { document.execCommand("copy"); done(); } catch (e) { toast("انسخ الرابط يدويًا: " + url); }
        i.remove();
      }
    },
    "buy-now"(el) { Cart.add(el.dataset.id, 1); location.hash = "#/checkout"; },
    "auth-tab"(el) {
      const tab = el.dataset.tab;
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === el));
      const fl = document.getElementById("formLogin"), fs = document.getElementById("formSignup");
      if (fl) fl.classList.toggle("hidden", tab !== "login");
      if (fs) fs.classList.toggle("hidden", tab !== "signup");
    },
    "logout"() { Auth.logout(); toast("تم تسجيل الخروج"); window.Core.render(); },
    "track-orders"(el) {
      const phone = (document.getElementById("trackPhone") || {}).value || "";
      State.guestPhone = phone.trim();
      window.Core.save();
      const list = Orders.byPhone(State.guestPhone);
      document.getElementById("trackResults").innerHTML = list.length
        ? list.map((o) => '<div style="margin-top:10px">' + orderDetail(o, { timeline: false }) + "</div>").join("")
        : '<div class="empty">لا توجد طلبات لهذا الرقم</div>';
    },
    "send-chat"() {
      const inp = document.getElementById("chatText"); if (!inp) return;
      const text = inp.value.trim(); if (!text) return;
      inp.value = "";
      Chat.sendFromCustomer(text);
      window.Core.render();
      scrollChatBottom();
    },
    "quick-reply"(el) {
      const inp = document.getElementById("chatText"); if (inp) { inp.value = el.dataset.text || ""; inp.focus(); }
    }
  });

  window.Forms = window.Forms || {};
  Object.assign(window.Forms, {
    login(d) {
      const r = Auth.login(d.email.trim(), d.password);
      if (!r.ok) { toast(r.msg, "err"); return; }
      if (window.Sync) window.Sync.refreshForCustomer();
      toast("أهلاً بك 👋", "ok"); window.Core.render();
    },
    signup(d) {
      const r = Auth.signup({ email: d.email.trim(), password: d.password, name: d.name, phone: d.phone, city: d.city, address: d.address });
      if (!r.ok) { toast(r.msg, "err"); return; }
      if (window.Sync) window.Sync.refreshForCustomer();
      toast("تم إنشاء حسابك 🎉", "ok"); window.Core.render();
    },
    profile(d) {
      Auth.update({ name: d.name, phone: d.phone, city: d.city, address: d.address });
      if (window.Sync) window.Sync.refreshForCustomer();
      toast("تم حفظ بياناتك ✅", "ok");
    },
    checkout(d) {
      const order = Orders.create({
        name: d.name.trim(), phone: d.phone.trim(), city: d.city, area: d.area || "", address: d.address.trim(), notes: d.notes || "",
        payment: d.payment || "cod"
      });
      if (!order) return;
      window.Core.render();
      location.hash = "#/order/" + order.id;
    }
  });

  window.Changes = window.Changes || {};
  window.Changes.sort = function (el) { State.ui.sort = el.value; Views._renderProducts(); };

  let searchTimer = null;
  window.Inputs = window.Inputs || {};
  window.Inputs.search = function (el) {
    State.ui.q = el.value;
    if (el.value.trim()) State.ui.cat = "all";
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { Views._renderProducts(); }, 180);
  };

  function scrollChatBottom() {
    const b = document.getElementById("chatBody");
    if (b) b.scrollTop = b.scrollHeight;
  }
  window.onNewMessage = function () {
    const b = document.getElementById("chatBody");
    if (b && window.Core.parseHash().path === "/messages") window.Core.render();
  };

  window.Views = Views;
  window.After = After;
})();
