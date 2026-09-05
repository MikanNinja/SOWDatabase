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
  race       text not null default '',
  parent_id  uuid,
  birth_year        integer,
  birth_month       integer check (birth_month is null or birth_month between 1 and 12),
  birth_day         integer check (birth_day is null or birth_day between 1 and 31),
  birth_circa       boolean not null default false,
  death_year        integer,
  death_month       integer check (death_month is null or death_month between 1 and 12),
  death_day         integer check (death_day is null or death_day between 1 and 31),
  death_circa       boolean not null default false,
  birth_place_id    uuid,
  birth_place_free  text not null default '',
  death_place_id    uuid,
  death_place_free  text not null default '',
  status     content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

alter table entities add constraint entities_parent_fk
  foreign key (parent_id) references entities(id) on delete set null;
alter table entities add constraint entities_birth_place_fk
  foreign key (birth_place_id) references entities(id) on delete set null;
alter table entities add constraint entities_death_place_fk
  foreign key (death_place_id) references entities(id) on delete set null;

create table entity_aliases (
  id        bigserial primary key,
  entity_id uuid not null references entities(id) on delete cascade,
  alias     text not null
);

create index idx_entity_aliases_alias on entity_aliases (alias);
create index idx_entities_type on entities (type);
create index idx_entities_status on entities (status);
create index idx_entities_parent on entities (parent_id);
create index idx_entities_birth_place on entities (birth_place_id);
create index idx_entities_death_place on entities (death_place_id);

create table entity_factions (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references entities(id) on delete cascade,
  faction_id uuid not null references entities(id) on delete cascade,
  role       text not null default '',
  ordinal    integer not null default 0
);

create index idx_entity_factions_entity on entity_factions (entity_id, ordinal);
create index idx_entity_factions_faction on entity_factions (faction_id);

create table person_relations (
  id           uuid primary key default gen_random_uuid(),
  from_id      uuid not null references entities(id) on delete cascade,
  to_id        uuid not null references entities(id) on delete cascade,
  kind         text not null,
  reverse_kind text not null default '',
  note         text not null default '',
  ordinal      integer not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_person_relations_from on person_relations (from_id, ordinal);
create index idx_person_relations_to on person_relations (to_id, ordinal);

create table text_entries (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  source_category   text not null default '',
  source_name       text not null default '',
  ingame_location   text not null default '',
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

create table text_entity_associations (
  id        uuid primary key default gen_random_uuid(),
  entry_id  uuid not null references text_entries(id) on delete cascade,
  target_id uuid not null references entities(id) on delete cascade,
  ordinal   integer not null default 0
);

create index idx_text_entity_assoc_entry on text_entity_associations (entry_id, ordinal);
create index idx_text_entity_assoc_target on text_entity_associations (target_id);

-- 行级安全：公开只读已发布内容，写入仅允许服务端
alter table entities enable row level security;
alter table entity_aliases enable row level security;
alter table text_entries enable row level security;
alter table text_blocks enable row level security;
alter table content_links enable row level security;
alter table settings enable row level security;
alter table entity_factions enable row level security;
alter table person_relations enable row level security;
alter table text_entity_associations enable row level security;

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

create policy "entity_factions_read_published" on entity_factions
  for select using (
    exists (select 1 from entities p where p.id = entity_id and p.status = 'published' and p.deleted = false)
    and exists (select 1 from entities f where f.id = faction_id and f.status = 'published' and f.deleted = false)
  );
create policy "person_relations_read_published" on person_relations
  for select using (
    exists (select 1 from entities a where a.id = from_id and a.status = 'published' and a.deleted = false)
    and exists (select 1 from entities b where b.id = to_id and b.status = 'published' and b.deleted = false)
  );
create policy "text_entity_associations_read_published" on text_entity_associations
  for select using (
    exists (select 1 from text_entries t where t.id = entry_id and t.status = 'published' and t.deleted = false)
    and exists (select 1 from entities e where e.id = target_id and e.status = 'published' and e.deleted = false)
  );

-- 默认站点设置
insert into settings (key, value) values ('site_name', '游戏资料库') on conflict (key) do nothing;
insert into settings (key, value) values ('site_description', '') on conflict (key) do nothing;
insert into settings (key, value) values ('nav_label', '资料索引') on conflict (key) do nothing;
insert into settings (key, value) values ('footer_text', '内容公开可读，仅由站点拥有者维护。') on conflict (key) do nothing;