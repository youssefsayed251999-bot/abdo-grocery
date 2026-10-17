# 🚀 نشر «بقالة عم عبده» على الإنترنت (رابط عام لأي حد)

الهدف: يبقى عندك **لينك عام** زي `https://abdo-grocery.onrender.com` أي حد في الدنيا يفتحه من أي موبايل — من غير ما تسيب جهازك شغّال.

> الموقع مبني **بدون أي مكتبات خارجية**، فمش محتاج أي بناء (build). هنرفع مجلد **`dist/user`** زي ما هو.

---

## الطريقة (Render + GitHub) — بدون أي برامج تتثبّت

### 1) حساب GitHub
1. افتح https://github.com واعمل حساب مجاني (لو مفيش).
2. اضغط **New repository**.
3. الاسم: `abdo-grocery` — اختار **Public** — واضغط **Create repository**.

### 2) ارفع ملفات الموقع
1. في صفحة الريبو اضغط **Add file → Upload files**.
2. افتح مجلد المشروع على جهازك: `dist\user`.
3. اسحب **كل ما بداخل** `dist\user` وارميه في صفحة GitHub، يعني:
   - `index.html`
   - `sw.js`
   - `manifest.webmanifest`
   - `render.yaml`
   - `package.json`
   - المجلدات: `css` و `icons` و `img` و `js` و `server` و `supabase`
4. اضغط **Commit changes**.

> ⚠️ **مهم:** لا ترفع ملف `server\.env` أبدًا — فيه المفتاح السري. الملف ده **مش موجود** جوّه `dist\user` أصلاً، فلو رفعت من `dist\user` تبقى آمن.

### 3) حساب Render
1. افتح https://render.com واعمل حساب (تقدر تسجّل بحساب GitHub مباشرة).
2. **New → Web Service**.
3. اختر الريبو `abdo-grocery`.
4. املأ الإعدادات:

| الخانة | القيمة |
|---|---|
| Name | `abdo-grocery` |
| Region | `Frankfurt (EU Central)` — الأقرب لمصر |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node server/server.js` |
| Instance Type | **Free** |

### 4) المفاتيح السرية (Environment)
في نفس الصفحة افتح **Environment → Environment Variables** وضيف اتنين:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://cxxehmrjexsifohvjeyh.supabase.co` |
| `SUPABASE_SERVICE_KEY` | (المفتاح الموجود في ملف `server\.env` عندك جوّه المشروع) |

> عشان تاخد المفتاح: افتح `server\.env` بأي محرر نصوص، وانسخ القيمة اللي بعد `SUPABASE_SERVICE_KEY=` (أو `SUPABASE_SECRET_KEY=`).

### 5) انشر
1. اضغط **Create Web Service**.
2. استنى دقيقتين لحد ما يقول **Live**.
3. الرابط هيبقى شكله: `https://abdo-grocery.onrender.com`
4. **ابعت الرابط لأي حد** — يفتح عادي على الموبايل والكمبيوتر. 🎉

---

## ملاحظات مهمة

- **النسخة المجانية** بتنام بعد 15 دقيقة من غير استخدام، وأول فتح بعد النوم بياخد حوالي 30–60 ثانية وبعدها يشتغل سريع. (لو عايزه صاحي على طول ممكن ترقّي للخطة المدفوعة لاحقًا.)
- **لوحة المالك:** نفس الرابط + `#/admin` (زي: `https://abdo-grocery.onrender.com/#/admin`) وكلمة السر `admin123`.
- كل العملاء والمطوّر بيعتمدوا على **نفس قاعدة بيانات Supabase**، فأي منتج أو سعر تعدّله يظهر فورًا لكل الناس.
- **للتحديث مستقبلًا:** لما تخلّص أي تعديل، اعمل `node tools/build.js` تاني وارفع ملفات `dist\user` الجديدة على GitHub (Upload files → Commit) وRender هينشر لوحده تلقائي في أقل من دقيقة.

---

## 🔐 أمان (مهم جدًا)

المفتاح السري `SUPABASE_SERVICE_KEY` اتشارك في الشات وقت الإعداد. لازم تغيّره:
1. Supabase → **Project Settings → API → rotate / reset** للمفتاح السري.
2. حدّث القيمة الجديدة في:
   - ملف `server\.env` عندك.
   - صفحة Render → Environment.
3. السيرفر بيقرأ المفاتيح عند التشغيل، فبعد التحديث اعمل **Manual Deploy → Restart** من Render.

---

## 🔁 بديل سريع (اختياري): لينك فوري من غير GitHub

لو عايز لينك يشتغل في ثانية وانت لسه بتجهّز Render (بس **جهازك لازم يفضل شغّال**):

```powershell
# 1) شغّل الموقع محليًا (في نافذة أولى)
cd dist\user
node server\server.js

# 2) في نافذة تانية: نفّذ نفق Cloudflare
cloudflared tunnel --url http://localhost:8080
```

هيطلّع لينك مؤقت شكله `https://xxxx.trycloudflare.com` — يشتغل على طول لأي حد.
(محتاج تنزّل برنامج `cloudflared` مرة واحدة من https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
