-- 游戏资料库 - Supabase PostgreSQL 模式
-- 与 lib/db/sqlite.ts 的 SQLite 模式保持结构一致

create extension if not exists pgcrypto;

create type entity_type as enum ('person', 'place', 'faction');
create type content_status as enum ('draft', 'published');
create type link_source as enum ('inline', 'manual');

create table settings (
  key   text primary key,
  value text not null default ''
);

create table entities (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  type       entity_type not null,
  name       text not null,
  intro      text not null default '',
  note       text not null default '',
  status     content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table entity_aliases (
  id        bigserial primary key,
  entity_id uuid not null references entities(id) on delete cascade,
  alias     text not null
);

create index idx_entity_aliases_alias on entity_aliases (alias);
create index idx_entities_type on entities (type);
create index idx_entities_status on entities (status);

create table text_entries (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  source_category   text not null default '其他',
  source_name       text not null default '',
  ingame_location   text not null default '',
  trigger_condition text not null default '',
  note              text not null default '',
  body              text not null default '',
  status            content_status not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted           boolean not null default false
);

create index idx_text_entries_status on text_entries (status);
create index idx_text_entries_category on text_entries (source_category);

create table text_blocks (
  id       uuid primary key default gen_random_uuid(),
  entry_id uuid not null references text_entries(id) on delete cascade,
  ordinal  integer not null,
  kind     text not null default 'paragraph',
  content  text not null default ''
);

create index idx_text_blocks_entry on text_blocks (entry_id, ordinal);

create table content_links (
  id           uuid primary key default gen_random_uuid(),
  block_id     uuid not null references text_blocks(id) on delete cascade,
  target_kind  text not null check (target_kind in ('entity', 'text')),
  target_id    uuid not null,
  source       link_source not null default 'inline',
  display_text text not null default '',
  raw          text not null default ''
);

create index idx_content_links_target on content_links (target_kind, target_id);
create index idx_content_links_block on content_links (block_id);

-- 行级安全：公开只读已发布内容，写入仅允许服务端
alter table entities enable row level security;
alter table entity_aliases enable row level security;
alter table text_entries enable row level security;
alter table text_blocks enable row level security;
alter table content_links enable row level security;
alter table settings enable row level security;

create policy "entities_read_published" on entities
  for select using (status = 'published' and deleted = false);
create policy "entity_aliases_read_published" on entity_aliases
  for select using (exists (
    select 1 from entities e where e.id = entity_id and e.status = 'published' and e.deleted = false
  ));
create policy "text_entries_read_published" on text_entries
  for select using (status = 'published' and deleted = false);
create policy "text_blocks_read_published" on text_blocks
  for select using (exists (
    select 1 from text_entries t where t.id = entry_id and t.status = 'published' and t.deleted = false
  ));
create policy "content_links_read_published" on content_links
  for select using (exists (
    select 1 from text_blocks b
    join text_entries t on t.id = b.entry_id
    where b.id = block_id and t.status = 'published' and t.deleted = false
  ));
create policy "settings_read" on settings for select using (true);

-- 默认站点设置
insert into settings (key, value) values ('site_name', '游戏资料库') on conflict (key) do nothing;
insert into settings (key, value) values ('site_description', '') on conflict (key) do nothing;