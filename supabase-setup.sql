-- =====================================================
-- PREMIUM STUDIO AUTOMOTIVO — Blog, vídeos e acessos
-- Cole TUDO no Supabase > SQL Editor > New query > Run
-- Depois troque o e-mail do admin no final do arquivo.
-- =====================================================

-- 1) Quem pode entrar no painel
create table if not exists public.psa_admins (
  email text primary key
);
alter table public.psa_admins enable row level security;

create or replace function public.psa_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.psa_admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function public.psa_is_admin() to anon, authenticated;

drop policy if exists "psa admin le admins" on public.psa_admins;
create policy "psa admin le admins" on public.psa_admins for select using (public.psa_is_admin());

-- 2) Posts (artigos do blog e vídeos)
create table if not exists public.psa_posts (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'blog' check (tipo in ('blog','video')),
  titulo text not null,
  slug text not null unique,
  resumo text,
  conteudo text,
  capa_url text,
  video_url text,
  publicado boolean not null default false,
  views integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.psa_posts enable row level security;

drop policy if exists "psa publico ve" on public.psa_posts;
create policy "psa publico ve" on public.psa_posts for select using (publicado or public.psa_is_admin());
drop policy if exists "psa admin insere" on public.psa_posts;
create policy "psa admin insere" on public.psa_posts for insert with check (public.psa_is_admin());
drop policy if exists "psa admin edita" on public.psa_posts;
create policy "psa admin edita" on public.psa_posts for update using (public.psa_is_admin());
drop policy if exists "psa admin apaga" on public.psa_posts;
create policy "psa admin apaga" on public.psa_posts for delete using (public.psa_is_admin());

-- 3) Acessos do site
create table if not exists public.psa_page_views (
  id bigint generated always as identity primary key,
  path text not null,
  slug text,
  referrer text,
  device text,
  criado_em timestamptz not null default now()
);
create index if not exists psa_page_views_data on public.psa_page_views (criado_em);
alter table public.psa_page_views enable row level security;
drop policy if exists "psa admin ve acessos" on public.psa_page_views;
create policy "psa admin ve acessos" on public.psa_page_views for select using (public.psa_is_admin());

-- registra 1 acesso (chamado pelo site; ninguém consegue ler, só gravar)
create or replace function public.psa_register_view(p_path text, p_slug text default null, p_ref text default null, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into psa_page_views(path, slug, referrer, device)
  values (left(coalesce(p_path,'/'),200), left(p_slug,200), left(p_ref,300), left(p_device,20));
  if p_slug is not null then
    update psa_posts set views = views + 1 where slug = p_slug and publicado;
  end if;
end $$;
grant execute on function public.psa_register_view(text,text,text,text) to anon, authenticated;

-- números do painel (só admin)
create or replace function public.psa_admin_stats(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.psa_is_admin() then raise exception 'sem permissao'; end if;
  select json_build_object(
    'hoje',  (select count(*) from psa_page_views where criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'd7',    (select count(*) from psa_page_views where criado_em >= now() - interval '7 days'),
    'd30',   (select count(*) from psa_page_views where criado_em >= now() - interval '30 days'),
    'total', (select count(*) from psa_page_views),
    'blog30',(select count(*) from psa_page_views where slug is not null and criado_em >= now() - interval '30 days'),
    'celular30',(select count(*) from psa_page_views where device='celular' and criado_em >= now() - interval '30 days'),
    'diario', (select coalesce(json_agg(x order by x.dt),'[]'::json) from (
        select d as dt, to_char(d,'DD/MM') as dia,
          (select count(*) from psa_page_views v where (v.criado_em at time zone 'America/Sao_Paulo')::date = d) as n
        from generate_series((now() at time zone 'America/Sao_Paulo')::date - (p_days-1), (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
      ) x),
    'origens', (select coalesce(json_agg(o),'[]'::json) from (
        select coalesce(nullif(referrer,''),'Direto / WhatsApp') as origem, count(*) as n
        from psa_page_views where criado_em >= now() - interval '30 days'
        group by 1 order by 2 desc limit 8) o)
  ) into r;
  return r;
end $$;
grant execute on function public.psa_admin_stats(int) to authenticated;

-- 4) Pasta de imagens e vídeos (Storage)
insert into storage.buckets (id, name, public) values ('psa-midia','psa-midia', true)
on conflict (id) do update set public = true;

drop policy if exists "psa midia publica" on storage.objects;
create policy "psa midia publica" on storage.objects for select using (bucket_id = 'psa-midia');
drop policy if exists "psa admin envia midia" on storage.objects;
create policy "psa admin envia midia" on storage.objects for insert with check (bucket_id = 'psa-midia' and public.psa_is_admin());
drop policy if exists "psa admin apaga midia" on storage.objects;
create policy "psa admin apaga midia" on storage.objects for delete using (bucket_id = 'psa-midia' and public.psa_is_admin());

