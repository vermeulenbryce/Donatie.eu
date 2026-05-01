-- Categorie voor nieuwsberichten (admin + filter op /nieuws en homepage).
-- Voer eenmalig uit op bestaande Supabase-projecten waar `site_news_posts` al bestond
-- vóór deze kolom werd toegevoegd. Nieuwe installaties via SQL_ADMIN_LIVE_PHASE1.sql hoeven dit niet.

alter table public.site_news_posts
  add column if not exists category text not null default 'nieuws';

update public.site_news_posts
set category = 'nieuws'
where category is null or category = '';

alter table public.site_news_posts alter column category set default 'nieuws';

-- Naam kan per Postgres-versie verschillen; dubbele drop is onschuldig.
alter table public.site_news_posts drop constraint if exists site_news_posts_category_check;
alter table public.site_news_posts drop constraint if exists site_news_posts_category_chk;
alter table public.site_news_posts
  add constraint site_news_posts_category_chk
  check (category = any (array['nieuws','update','evenement','actie','succes']::text[]));

create index if not exists idx_site_news_posts_category_published
  on public.site_news_posts (category, published, published_at desc);
