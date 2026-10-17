-- ============================================================
--  بقالة عم عبده — مخطط قاعدة البيانات على Supabase
-- ------------------------------------------------------------
--  الطريقة:
--    1) افتح مشروعك في Supabase
--    2) من القائمة الجانبية: SQL Editor → New query
--    3) الصق كل الملف ده واضغط Run  (مرة واحدة بس)
-- ============================================================

-- الأقسام
create table if not exists categories (
  id text primary key,
  name text not null,
  emoji text,
  ord int default 0
);

-- المنتجات (تقدر تعدّل السعر/الصورة من هنا مباشرة لو حبيت)
create table if not exists products (
  id text primary key,
  name text,
  cat text,
  price numeric default 0,
  cost numeric default 0,
  stock int default 0,
  unit text,
  emoji text,
  badge text,
  "desc" text,
  specs jsonb default '[]'::jsonb,
  image text,
  rating numeric default 0,
  reviews int default 0,
  sold int default 0,
  discount int default 0,
  active boolean default true
);

-- إعدادات المتجر (صف واحد رقم 1)
create table if not exists settings (
  id int primary key default 1,
  data jsonb not null
);

-- الطلبات
create table if not exists orders (
  id text primary key,
  code text,
  created_at bigint,
  status text default 'pending',
  paid boolean default false,
  payment text default 'cod',
  subtotal numeric default 0,
  delivery numeric default 0,
  discount numeric default 0,
  total numeric default 0,
  customer jsonb,
  items jsonb default '[]'::jsonb,
  history jsonb default '[]'::jsonb,
  notes text,
  read boolean default false
);

-- المحادثات (لكل عميل محادثة)
create table if not exists threads (
  id text primary key,
  phone text unique,
  name text,
  email text,
  unread boolean default false,
  order_code text,
  created_at bigint,
  updated_at bigint,
  messages jsonb default '[]'::jsonb
);

-- الإشعارات
create table if not exists notifications (
  id text primary key,
  title text,
  body text,
  audience text default 'all',
  at bigint
);

-- عدّادات (زي عدد الزيارات)
create table if not exists counters (
  id text primary key,
  value int default 0
);

create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists threads_updated_idx on threads (updated_at desc);

-- ============================================================
--  تأمين الجداول: تفعيل RLS بدون أي سياسة عامة
--  يعني محدش يقدر يقرأ أو يكتب من بره، غير السيرفر بمفتاح الخدمة.
-- ============================================================
alter table categories    enable row level security;
alter table products      enable row level security;
alter table settings      enable row level security;
alter table orders        enable row level security;
alter table threads       enable row level security;
alter table notifications enable row level security;
alter table counters      enable row level security;

-- تمّ ✅
