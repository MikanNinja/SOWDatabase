-- 迁移：entities 增加人物生卒字段（v3）
-- 适用于「已存在 entities 表」的 Supabase 库；部署端若为空库，直接重跑 schema.sql 即可。
-- 在 Supabase SQL Editor 中整段执行。

alter table entities add column birth_year integer;
alter table entities add column birth_month integer check (birth_month is null or birth_month between 1 and 12);
alter table entities add column birth_day integer check (birth_day is null or birth_day between 1 and 31);
alter table entities add column birth_circa boolean not null default false;
alter table entities add column death_year integer;
alter table entities add column death_month integer check (death_month is null or death_month between 1 and 12);
alter table entities add column death_day integer check (death_day is null or death_day between 1 and 31);
alter table entities add column death_circa boolean not null default false;
alter table entities add column birth_place_id uuid;
alter table entities add column birth_place_free text not null default '';
alter table entities add column death_place_id uuid;
alter table entities add column death_place_free text not null default '';

alter table entities add constraint entities_birth_place_fk
  foreign key (birth_place_id) references entities(id) on delete set null;
alter table entities add constraint entities_death_place_fk
  foreign key (death_place_id) references entities(id) on delete set null;

create index if not exists idx_entities_birth_place on entities (birth_place_id);
create index if not exists idx_entities_death_place on entities (death_place_id);
