/* ================= الإقلاع: التحميل، المزامنة، التثبيت، service worker ================= */
(function () {
  "use strict";
  const Core = window.Core;
  const CFG = window.APP_CONFIG || {};
  Core.load();
  if (window.applyBranding) window.applyBranding();

  /* عدّاد زيارات الموقع (مرة لكل زيارة/جلسة) */
  try {
    if (!sessionStorage.getItem("amanah_visited")) {
      sessionStorage.setItem("amanah_visited", "1");
      Core.State.visits = (Core.State.visits || 0) + 1;
      Core.save();
    }
  } catch (e) { /* storage قد يكون محظورًا */ }

  /* ---------- رسالة ترحيب عند أول زيارة ---------- */
  (function welcome() {
    const S = Core.State;
    if (!S.notifications.length && S.settings.notify && S.settings.notify.welcome) {
      Core.Notify.push({
        to: "customer", kind: "system", silent: true,
        title: "أهلاً بك في " + S.settings.storeName + " 🛒",
        body: "سعداء بانضمامك! تصفح منتجاتنا واستفد من خصم أول طلب. توصيل داخل إنشاص الرمل والدفع عند الاستلام.",
        href: "#/products"
      });
    }
  })();

  /* نسخة المالك/المطوّر: نفتح لوحة التحكم مباشرة (الإحصائيات + الإشعارات + الطلبات) */
  if (CFG.owner && (location.hash === "" || location.hash === "#" || location.hash === "#/")) {
    location.hash = "#/admin";
  }

  Core.render();

  /* ---------- المزامنة الحقيقية مع السيرفر (اختيارية) ---------- */
  (function startSync() {
    if (!window.Sync) return;
    window.Sync.start().then((enabled) => {
      if (!enabled) return;
      // عدّاد الزيارة على السيرفر
      try { window.API.visits(); } catch (e) { }
    });
  })();

  /* ---------- تثبيت PWA ---------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const card = document.getElementById("installCard");
    if (card) card.style.display = "flex";
  });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; Core.toast("تم تثبيت التطبيق ✅", "ok"); });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("#btnInstall");
    if (!b) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((c) => {
        if (c.outcome === "accepted") Core.toast("جاري تثبيت التطبيق…", "ok");
        deferredPrompt = null;
      });
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    Core.modal({
      title: "تثبيت الموقع كتطبيق 📲",
      body: '<p style="font-size:.9rem;line-height:1.9">' + (isIOS
        ? "على الآيفون: اضغط زر <b>المشاركة</b> في سفاري ثم <b>Add to Home Screen</b> (إضافة إلى الشاشة الرئيسية)."
        : "افتح قائمة المتصفح (⋮) ثم اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.") +
        "<br><br>الميزات: وصول أسرع من أيقونة على الشاشة، وفتح بدون إنترنت، وإشعارات فورية بتحديثات طلبك 🔔</p>"
    });
  });

  /* ---------- Service Worker ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "navigate") location.hash = e.data.href;
    });
  }

})();
