-- Run once in the Supabase SQL Editor. This creates a private storage bucket
-- and RLS rules; do not disable row-level security on these tables.

create extension if not exists pgcrypto;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on table public.site_admins from public, anon, authenticated;
grant select on table public.site_admins to authenticated;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_admins a
    join auth.users u on u.id = a.user_id
    join auth.identities i on i.user_id = u.id
    where a.user_id = (select auth.uid())
      and lower(u.email) = 'gdsakib67@gmail.com'
      and u.email_confirmed_at is not null
      and i.provider = 'google'
      and lower(i.identity_data->>'email') = 'gdsakib67@gmail.com'
      and i.identity_data->>'email_verified' = 'true'
  );
$$;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to anon, authenticated;
drop policy if exists "Admins can read their own admin membership" on public.site_admins;
create policy "Admins can read their own admin membership"
  on public.site_admins for select to authenticated
  using ((select public.is_site_admin()));

create table if not exists public.site_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text not null check (char_length(description) between 1 and 600),
  category text not null check (char_length(category) between 1 and 80),
  video_url text not null default '' check (char_length(video_url) <= 500),
  file_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 170),
  file_size bigint not null check (file_size > 0 and file_size <= 104857600),
  mime_type text not null,
  thumbnail_path text unique,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_resources_file_path_matches_id
    check (file_path like id::text || '/%'),
  constraint site_resources_thumbnail_path_matches_id
    check (thumbnail_path is null or thumbnail_path like id::text || '/%'),
  constraint site_resources_video_url_is_youtube
    check (video_url = '' or video_url ~* '^https?://(www\.)?(youtube\.com|youtu\.be)/')
);
create index if not exists site_resources_published_created_idx
  on public.site_resources (published, created_at desc);
alter table public.site_resources enable row level security;
revoke all on table public.site_resources from public, anon, authenticated;
grant select on table public.site_resources to anon, authenticated;
grant insert, update, delete on table public.site_resources to authenticated;
drop policy if exists "Published resources are public; admins can read all" on public.site_resources;
create policy "Published resources are public; admins can read all"
  on public.site_resources for select to anon, authenticated
  using (published or (select public.is_site_admin()));
drop policy if exists "Admins can create resources" on public.site_resources;
create policy "Admins can create resources"
  on public.site_resources for insert to authenticated
  with check ((select public.is_site_admin()));
drop policy if exists "Admins can update resources" on public.site_resources;
create policy "Admins can update resources"
  on public.site_resources for update to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));
drop policy if exists "Admins can delete resources" on public.site_resources;
create policy "Admins can delete resources"
  on public.site_resources for delete to authenticated
  using ((select public.is_site_admin()));

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 1 and 800),
  link_url text not null default '' check (link_url = '' or link_url ~* '^https://'),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_announcements_published_created_idx
  on public.site_announcements (published, created_at desc);
alter table public.site_announcements enable row level security;
revoke all on table public.site_announcements from public, anon, authenticated;
grant select on table public.site_announcements to anon, authenticated;
grant insert, update, delete on table public.site_announcements to authenticated;
drop policy if exists "Published announcements are public; admins can read all" on public.site_announcements;
create policy "Published announcements are public; admins can read all"
  on public.site_announcements for select to anon, authenticated
  using (published or (select public.is_site_admin()));
drop policy if exists "Admins can create announcements" on public.site_announcements;
create policy "Admins can create announcements"
  on public.site_announcements for insert to authenticated
  with check ((select public.is_site_admin()));
drop policy if exists "Admins can update announcements" on public.site_announcements;
create policy "Admins can update announcements"
  on public.site_announcements for update to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));
drop policy if exists "Admins can delete announcements" on public.site_announcements;
create policy "Admins can delete announcements"
  on public.site_announcements for delete to authenticated
  using ((select public.is_site_admin()));

create table if not exists public.site_settings_public (
  id integer primary key check (id = 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings_drafts (
  id integer primary key check (id = 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.site_settings_public enable row level security;
alter table public.site_settings_drafts enable row level security;
revoke all on table public.site_settings_public from public, anon, authenticated;
grant select on table public.site_settings_public to anon, authenticated;
grant insert, update on table public.site_settings_public to authenticated;
revoke all on table public.site_settings_drafts from public, anon, authenticated;
grant select, insert, update on table public.site_settings_drafts to authenticated;
drop policy if exists "Published site settings are public" on public.site_settings_public;
create policy "Published site settings are public"
  on public.site_settings_public for select to anon, authenticated
  using (true);
drop policy if exists "Admins publish site settings" on public.site_settings_public;
create policy "Admins publish site settings"
  on public.site_settings_public for insert to authenticated
  with check ((select public.is_site_admin()));
drop policy if exists "Admins update site settings" on public.site_settings_public;
create policy "Admins update site settings"
  on public.site_settings_public for update to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));
drop policy if exists "Only admins can access site settings drafts" on public.site_settings_drafts;
create policy "Only admins can access site settings drafts"
  on public.site_settings_drafts for all to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

insert into public.site_settings_public (id, settings)
values (1, '{
  "heroHeading": "SAKIB — GAMING RESOURCES",
  "heroDescription": "Minecraft builds, Free Fire guides, OBS tools, and PC gaming resources from my tutorials.",
  "channelUrl": "https://www.youtube.com/@gdsakib67",
  "socials": [],
  "videos": [],
  "footerText": "Made for the curious. Built for the next big idea.",
  "categories": ["Minecraft", "Free Fire", "PC Tutorials", "OBS & Streaming", "Gaming Tools", "Software Guides", "Other Resources"],
  "featuredResourceIds": [],
  "weeklyResourceId": ""
}'::jsonb)
on conflict (id) do nothing;
insert into public.site_settings_drafts (id, settings)
select id, settings from public.site_settings_public where id = 1
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tutorial-resources',
  'tutorial-resources',
  false,
  104857600,
  array[
    'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/markdown',
    'application/json', 'text/csv', 'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Published resource files and admin objects are readable" on storage.objects;
create policy "Published resource files and admin objects are readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'tutorial-resources'
    and (
      (select public.is_site_admin())
      or exists (
        select 1 from public.site_resources r
        where r.published
          and (r.file_path = storage.objects.name or r.thumbnail_path = storage.objects.name)
      )
    )
  );

drop policy if exists "Admins upload validated tutorial files" on storage.objects;
create policy "Admins upload validated tutorial files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tutorial-resources'
    and (select public.is_site_admin())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._ -]{0,169}$'
    and lower(substring(name from '\.([A-Za-z0-9]+)$')) in ('pdf','zip','png','jpg','jpeg','txt','json','csv','webp','md','log')
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 104857600
    and metadata->>'mimetype' in (
      'application/pdf','application/zip','application/x-zip-compressed',
      'image/png','image/jpeg','image/webp','text/plain','text/markdown',
      'application/json','text/csv','application/octet-stream'
    )
    and (
      (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) in ('png','jpg','jpeg','webp')
        and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp')
      )
      or (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) = 'pdf'
        and metadata->>'mimetype' = 'application/pdf'
      )
      or (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) = 'zip'
        and metadata->>'mimetype' in ('application/zip','application/x-zip-compressed')
      )
      or (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) in ('txt','log')
        and metadata->>'mimetype' = 'text/plain'
      )
      or (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) = 'md'
        and metadata->>'mimetype' = 'text/markdown'
      )
      or (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) = 'json'
        and metadata->>'mimetype' in ('application/json','application/octet-stream')
      )
      or (
        lower(substring(name from '\.([A-Za-z0-9]+)$')) = 'csv'
        and metadata->>'mimetype' in ('text/csv','application/octet-stream')
      )
    )
    and (
      name !~ '/thumbnail-[^/]+$'
      or (
        coalesce((metadata->>'size')::bigint, 0) <= 5242880
        and lower(substring(name from '\.([A-Za-z0-9]+)$')) in ('png','jpg','jpeg','webp')
        and metadata->>'mimetype' in ('image/png','image/jpeg','image/webp')
      )
    )
  );

drop policy if exists "Admins update tutorial files" on storage.objects;
create policy "Admins update tutorial files"
  on storage.objects for update to authenticated
  using (bucket_id = 'tutorial-resources' and (select public.is_site_admin()))
  with check (bucket_id = 'tutorial-resources' and (select public.is_site_admin()));
drop policy if exists "Admins delete tutorial files" on storage.objects;
create policy "Admins delete tutorial files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tutorial-resources' and (select public.is_site_admin()));

-- After the owner has signed in once with Google, run supabase/grant-owner-admin.sql.
