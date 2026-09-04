-- =====================================================================
-- Gamecakes baseline schema
--
-- Builds the whole database from empty. This REPLACES the 0001-0044 migration
-- series, which is the founding deployment's history and is of no use to
-- anyone else. Migrations after this one are numbered from 0045.
--
-- GENERATED FROM THE LIVE SCHEMA by scripts/opensource/baseline.mjs, not by
-- concatenating those migrations. Two reasons that matters:
--   1. The migration files were never a reliable description of the database.
--      They were applied by hand, and 0015 was never applied at all while the
--      application queried the column it adds.
--   2. Several carry backfills matching the founding family's children BY
--      NAME. A structure dump carries no rows, so this file is name-clean by
--      construction rather than by careful editing.
--
-- The only data below is the skills catalog (universal content: no family_id,
-- no kid_id) and the storage buckets. Everything else starts empty.
--
-- Regenerate and verify:
--   node scripts/opensource/baseline.mjs generate <ref> > supabase/baseline/0001_baseline.sql
--   node scripts/opensource/baseline.mjs fingerprint <sourceRef>  > a.txt
--   node scripts/opensource/baseline.mjs fingerprint <scratchRef> > b.txt   # baseline applied
--   diff a.txt b.txt        # must be empty
-- =====================================================================

-- As pg_dump does: allow a function body to reference a table that does not
-- exist yet, so ordering only has to satisfy hard dependencies.
set check_function_bodies = off;

-- ------------------------------------------------------------- 1. extensions
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- -------------------------------------------------------------- 2. functions
-- Ahead of the tables: kids.grade_year DEFAULTs to school_year(), and a
-- default expression must resolve at CREATE TABLE time.
CREATE OR REPLACE FUNCTION public.ensure_kid_tokens_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  insert into kid_tokens (kid_id, family_id, balance)
    values (NEW.id, NEW.family_id, 5)
    on conflict (kid_id) do nothing;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_kid_town_starters()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  -- Shared starting point for every kid in every family.
  insert into kid_region_discoveries (kid_id, family_id, region_slug)
    values
      (NEW.id, NEW.family_id, 'town-square'),
      (NEW.id, NEW.family_id, 'cookie-corner')
    on conflict (kid_id, region_slug) do nothing;

  -- Plus their own land, when they have one. Null is normal: nothing in the
  -- app assigns land_slug yet, so a new family's kids own no land until a
  -- parent (or the setup script) grants one.
  if NEW.land_slug is not null then
    insert into kid_region_discoveries (kid_id, family_id, region_slug)
      values (NEW.id, NEW.family_id, NEW.land_slug)
      on conflict (kid_id, region_slug) do nothing;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mint_tokens(p_kid uuid, p_family uuid, p_delta integer, p_reason text, p_metadata jsonb)
 RETURNS TABLE(balance integer, was_minted boolean)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_balance int;
begin
  begin
    insert into token_transactions (kid_id, family_id, delta, reason, metadata)
      values (p_kid, p_family, p_delta, p_reason, p_metadata);
  exception
    when unique_violation then
      select kt.balance into v_balance from kid_tokens kt where kt.kid_id = p_kid;
      return query select coalesce(v_balance, 0), false;
      return;
  end;

  update kid_tokens kt set
    balance      = kt.balance + p_delta,
    total_earned = kt.total_earned + greatest(0, p_delta),
    total_spent  = kt.total_spent  + greatest(0, -p_delta),
    updated_at   = now()
  where kt.kid_id = p_kid
  returning kt.balance into v_balance;

  return query select v_balance, true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rent_vehicle(p_kid uuid, p_family uuid, p_vehicle_kind text, p_cost integer)
 RETURNS TABLE(balance integer, expires_at timestamp with time zone, status text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_balance int;
  v_expires timestamptz;
  v_now     timestamptz := now();
  v_target  timestamptz := date_trunc('day', now()) + interval '1 day'; -- next UTC midnight
begin
  -- Lock the wallet so two concurrent rent taps serialize.
  select kt.balance into v_balance
    from kid_tokens kt
    where kt.kid_id = p_kid
    for update;

  if v_balance is null then
    return query select 0, null::timestamptz, 'unknown_kid'::text;
    return;
  end if;

  -- Already own a still-valid rental for this ride? Free — return as-is.
  select r.expires_at into v_expires
    from kid_vehicle_rentals r
    where r.kid_id = p_kid and r.vehicle_kind = p_vehicle_kind;
  if v_expires is not null and v_expires > v_now then
    return query select v_balance, v_expires, 'already_rented'::text;
    return;
  end if;

  if v_balance < p_cost then
    return query select v_balance, null::timestamptz, 'insufficient_balance'::text;
    return;
  end if;

  -- Charge, (re)write the rental row, and audit — all under the FOR UPDATE lock.
  update kid_tokens kt set
    balance     = kt.balance - p_cost,
    total_spent = kt.total_spent + p_cost,
    updated_at  = v_now
    where kt.kid_id = p_kid
    returning kt.balance into v_balance;

  insert into kid_vehicle_rentals (kid_id, family_id, vehicle_kind, rented_at, expires_at)
    values (p_kid, p_family, p_vehicle_kind, v_now, v_target)
    on conflict (kid_id, vehicle_kind)
    do update set rented_at = excluded.rented_at, expires_at = excluded.expires_at;

  insert into token_transactions (kid_id, family_id, delta, reason, metadata)
    values (
      p_kid,
      p_family,
      -p_cost,
      'vehicle_rental',
      jsonb_build_object('vehicle_kind', p_vehicle_kind, 'cost', p_cost, 'expires_at', v_target)
    );

  return query select v_balance, v_target, 'rented'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.school_year(at_ts timestamp with time zone DEFAULT now())
 RETURNS smallint
 LANGUAGE sql
 STABLE
AS $function$
  select (case
            when extract(month from at_ts) >= 8 then extract(year from at_ts)
            else extract(year from at_ts) - 1
          end)::smallint
$function$
;

CREATE OR REPLACE FUNCTION public.set_family_from_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if NEW.family_id is null and NEW.event_id is not null then
    NEW.family_id := (select family_id from public.evidence_events where id = NEW.event_id);
  end if;
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_family_from_kid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if NEW.family_id is null and NEW.kid_id is not null then
    NEW.family_id := (select family_id from public.kids where id = NEW.kid_id);
  end if;
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public.town_discover_region(p_kid uuid, p_family uuid, p_region_slug text, p_cost integer)
 RETURNS TABLE(balance integer, status text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_balance int;
begin
  select kt.balance into v_balance
    from kid_tokens kt
    where kt.kid_id = p_kid
    for update;

  if v_balance is null then
    return query select 0, 'unknown_kid'::text;
    return;
  end if;

  if v_balance < p_cost then
    return query select v_balance, 'insufficient_balance'::text;
    return;
  end if;

  begin
    insert into kid_region_discoveries (kid_id, family_id, region_slug)
      values (p_kid, p_family, p_region_slug);
  exception
    when unique_violation then
      return query select v_balance, 'already_discovered'::text;
      return;
  end;

  update kid_tokens kt set
    balance     = kt.balance - p_cost,
    total_spent = kt.total_spent + p_cost,
    updated_at  = now()
  where kt.kid_id = p_kid
  returning kt.balance into v_balance;

  insert into token_transactions (kid_id, family_id, delta, reason, metadata)
    values (
      p_kid,
      p_family,
      -p_cost,
      'region_unlock',
      jsonb_build_object('region_slug', p_region_slug, 'cost', p_cost)
    );

  return query select v_balance, 'discovered'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.town_ferry_ride(p_kid uuid, p_family uuid, p_region_slug text, p_cost integer)
 RETURNS TABLE(balance integer, status text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_balance int;
  v_already boolean;
begin
  -- Lock the wallet to serialize concurrent taps against the same kid.
  select kt.balance into v_balance
    from kid_tokens kt
    where kt.kid_id = p_kid
    for update;

  if v_balance is null then
    return query select 0, 'unknown_kid'::text;
    return;
  end if;

  -- Already on the island? No charge, no replay (idempotent - a fly landing may
  -- have discovered it already, or a retry after a dropped response).
  select exists(
    select 1 from kid_region_discoveries
      where kid_id = p_kid and region_slug = p_region_slug
  ) into v_already;
  if v_already then
    return query select v_balance, 'already_discovered'::text;
    return;
  end if;

  if v_balance < p_cost then
    return query select v_balance, 'insufficient_balance'::text;
    return;
  end if;

  -- Record the discovery (a race can still unique_violation ? already_discovered).
  begin
    insert into kid_region_discoveries (kid_id, family_id, region_slug)
      values (p_kid, p_family, p_region_slug);
  exception
    when unique_violation then
      return query select v_balance, 'already_discovered'::text;
      return;
  end;

  -- Charge the fare (skip the debit + audit row entirely for a free fly arrival).
  if p_cost > 0 then
    update kid_tokens kt set
      balance     = kt.balance - p_cost,
      total_spent = kt.total_spent + p_cost,
      updated_at  = now()
    where kt.kid_id = p_kid
    returning kt.balance into v_balance;

    insert into token_transactions (kid_id, family_id, delta, reason, metadata)
      values (
        p_kid,
        p_family,
        -p_cost,
        'ferry_ride',
        jsonb_build_object('region_slug', p_region_slug, 'cost', p_cost)
      );
  end if;

  return query select v_balance, 'discovered'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.town_transit_ride(p_kid uuid, p_family uuid, p_region_slug text, p_cost integer, p_reason text)
 RETURNS TABLE(balance integer, status text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_balance int;
  v_already boolean;
begin
  if p_reason not in ('ferry_ride', 'bus_ride') then
    raise exception 'town_transit_ride: unsupported reason %', p_reason;
  end if;

  -- Lock the wallet to serialize concurrent taps against the same kid.
  select kt.balance into v_balance
    from kid_tokens kt
    where kt.kid_id = p_kid
    for update;

  if v_balance is null then
    return query select 0, 'unknown_kid'::text;
    return;
  end if;

  -- Already on the island? No charge, no replay (idempotent — a drive/fly
  -- arrival may have discovered it already, or this is a retry after a dropped
  -- response). This is ALSO what makes the return trip free.
  select exists(
    select 1 from kid_region_discoveries
      where kid_id = p_kid and region_slug = p_region_slug
  ) into v_already;
  if v_already then
    return query select v_balance, 'already_discovered'::text;
    return;
  end if;

  if v_balance < p_cost then
    return query select v_balance, 'insufficient_balance'::text;
    return;
  end if;

  -- Record the discovery (a race can still unique_violation → already_discovered).
  begin
    insert into kid_region_discoveries (kid_id, family_id, region_slug)
      values (p_kid, p_family, p_region_slug);
  exception
    when unique_violation then
      return query select v_balance, 'already_discovered'::text;
      return;
  end;

  -- Charge the fare (skip the debit + audit row entirely for a free arrival).
  if p_cost > 0 then
    update kid_tokens kt set
      balance     = kt.balance - p_cost,
      total_spent = kt.total_spent + p_cost,
      updated_at  = now()
    where kt.kid_id = p_kid
    returning kt.balance into v_balance;

    insert into token_transactions (kid_id, family_id, delta, reason, metadata)
      values (
        p_kid,
        p_family,
        -p_cost,
        p_reason,
        jsonb_build_object('region_slug', p_region_slug, 'cost', p_cost)
      );
  end if;

  return query select v_balance, 'discovered'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unlock_kid_game(p_kid uuid, p_family uuid, p_game_slug text, p_cost integer)
 RETURNS TABLE(balance integer, status text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_balance int;
  v_already boolean;
begin
  -- Lock the wallet so two taps on the same game can't both spend it down.
  select kt.balance into v_balance
    from kid_tokens kt
    where kt.kid_id = p_kid
    for update;

  if v_balance is null then
    return query select 0, 'unknown_kid'::text;
    return;
  end if;

  select exists(
    select 1 from kid_game_unlocks
      where kid_id = p_kid and game_slug = p_game_slug
  ) into v_already;
  if v_already then
    return query select v_balance, 'already_unlocked'::text;
    return;
  end if;

  if v_balance < p_cost then
    return query select v_balance, 'insufficient_balance'::text;
    return;
  end if;

  begin
    insert into kid_game_unlocks (kid_id, family_id, game_slug, cost_paid)
      values (p_kid, p_family, p_game_slug, p_cost);
  exception
    when unique_violation then
      return query select v_balance, 'already_unlocked'::text;
      return;
  end;

  -- Skip the debit + audit row entirely for a free game, so a cost-0 entry in
  -- the registry records the entitlement without littering the parent ledger
  -- with -0 rows (the trap town_discover_region falls into).
  if p_cost > 0 then
    update kid_tokens kt set
      balance     = kt.balance - p_cost,
      total_spent = kt.total_spent + p_cost,
      updated_at  = now()
    where kt.kid_id = p_kid
    returning kt.balance into v_balance;

    insert into token_transactions (kid_id, family_id, delta, reason, metadata)
      values (
        p_kid,
        p_family,
        -p_cost,
        'game_unlock',
        jsonb_build_object('game_slug', p_game_slug, 'cost', p_cost)
      );
  end if;

  return query select v_balance, 'unlocked'::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upgrade_kid_land(p_kid uuid, p_family uuid, p_region_slug text, p_expected_level integer, p_cost integer, p_max_level integer)
 RETURNS TABLE(level integer, balance integer, status text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
                              declare
                                v_balance int;
                                  v_level   int;
                                  begin
                                    select kt.balance into v_balance from kid_tokens kt where kt.kid_id = p_kid for update;
                                      if v_balance is null then
                                          return query select 0, 0, 'unknown_land'::text; return;
                                            end if;

                                              select krd.level into v_level from kid_region_discoveries krd
                                                  where krd.kid_id = p_kid and krd.region_slug = p_region_slug;
                                                    if v_level is null then
                                                        return query select 0, v_balance, 'unknown_land'::text; return;
                                                          end if;

                                                            if v_level <> p_expected_level then
                                                                return query select v_level, v_balance, 'stale'::text; return;
                                                                  end if;
                                                                    if v_level >= p_max_level then
                                                                        return query select v_level, v_balance, 'maxed'::text; return;
                                                                          end if;
                                                                            if v_balance < p_cost then
                                                                                return query select v_level, v_balance, 'insufficient_balance'::text; return;
                                                                                  end if;

                                                                                    update kid_region_discoveries krd set level = krd.level + 1
                                                                                        where krd.kid_id = p_kid and krd.region_slug = p_region_slug
                                                                                            returning krd.level into v_level;

                                                                                              update kid_tokens kt set
                                                                                                  balance = kt.balance - p_cost,
                                                                                                      total_spent = kt.total_spent + p_cost,
                                                                                                          updated_at = now()
                                                                                                              where kt.kid_id = p_kid
                                                                                                                  returning kt.balance into v_balance;

                                                                                                                    insert into token_transactions (kid_id, family_id, delta, reason, metadata)
                                                                                                                        values (p_kid, p_family, -p_cost, 'land_upgrade',
                                                                                                                              jsonb_build_object('region_slug', p_region_slug, 'level', v_level, 'cost', p_cost));

                                                                                                                                return query select v_level, v_balance, 'upgraded'::text;
                                                                                                                                end;
                                                                                                                                $function$
;

-- ----------------------------------------------------------------- 3. tables
CREATE TABLE public.attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  game_id uuid,
  tier integer NOT NULL,
  correct boolean NOT NULL,
  response_time_ms integer,
  raw_response jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  family_id uuid,
  game_slug text,
  completed boolean,
  efficiency numeric(5,4),
  taps_total integer,
  taps_wrong integer
);
CREATE TABLE public.cakey_quiz_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  family_id uuid,
  status text DEFAULT 'in_progress'::text NOT NULL,
  adjustment_eligible boolean DEFAULT false NOT NULL,
  adjustment_applied boolean DEFAULT false NOT NULL,
  next_adjustment_at timestamp with time zone,
  starting_math_tier smallint NOT NULL,
  starting_reading_tier smallint NOT NULL,
  result_math_tier smallint,
  result_reading_tier smallint,
  math_score smallint,
  reading_score smallint,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  answers jsonb DEFAULT '[]'::jsonb NOT NULL
);
CREATE TABLE public.class_material (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  words text[] DEFAULT '{}'::text[] NOT NULL,
  note text,
  skill_id uuid,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.content (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  skill_id uuid NOT NULL,
  tier integer NOT NULL,
  game_type text NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE public.evidence_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source text NOT NULL,
  observation_id uuid,
  attempt_id uuid,
  feedback_id uuid,
  input_text text,
  photo_path text,
  model_used text,
  model_raw jsonb,
  status text DEFAULT 'applied'::text NOT NULL,
  applied_at timestamp with time zone DEFAULT now(),
  family_id uuid
);
CREATE TABLE public.evidence_skills (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  verdict text NOT NULL,
  confidence real NOT NULL,
  weight real DEFAULT 1 NOT NULL,
  synthetic_attempts integer DEFAULT 0 NOT NULL,
  reasoning text,
  family_id uuid
);
CREATE TABLE public.families (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  owner_user_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  parent_pin text,
  digest_emails text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE public.family_digest_sends (
  family_id uuid NOT NULL,
  week_start date NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  recipients integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  game_slug text,
  raw_transcript text NOT NULL,
  audio_path text,
  ticket_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  ai_raw jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  ship_note text,
  drawing_path text,
  family_id uuid
);
CREATE TABLE public.games (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  game_type text NOT NULL,
  subject text NOT NULL,
  skill_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  config jsonb NOT NULL,
  created_by uuid,
  source_drawing_url text,
  approved boolean DEFAULT false NOT NULL,
  map_position jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.invite_codes (
  code text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  redeemed_at timestamp with time zone,
  redeemed_by_user_id uuid,
  redeemed_by_family_id uuid
);
CREATE TABLE public.kid_avatar_position (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  region_slug text NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kid_cupcake_unlocks (
  kid_id uuid NOT NULL,
  kind text NOT NULL,
  value text NOT NULL,
  unlocked_at timestamp with time zone DEFAULT now() NOT NULL,
  cost_paid integer NOT NULL,
  family_id uuid
);
CREATE TABLE public.kid_game_unlocks (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  game_slug text NOT NULL,
  unlocked_at timestamp with time zone DEFAULT now() NOT NULL,
  cost_paid integer NOT NULL
);
CREATE TABLE public.kid_region_discoveries (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  region_slug text NOT NULL,
  discovered_at timestamp with time zone DEFAULT now() NOT NULL,
  level integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.kid_skills (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  current_tier integer DEFAULT 1 NOT NULL,
  mastery_pct real DEFAULT 0 NOT NULL,
  total_attempts integer DEFAULT 0 NOT NULL,
  recent_window jsonb DEFAULT '[]'::jsonb NOT NULL,
  family_id uuid
);
CREATE TABLE public.kid_story_seen (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  story_slug text NOT NULL,
  seen_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kid_subject_placements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  family_id uuid,
  subject text NOT NULL,
  current_tier smallint NOT NULL,
  last_assessed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kid_token_notice_seen (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  seen_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kid_tokens (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  balance integer DEFAULT 5 NOT NULL,
  total_earned integer DEFAULT 0 NOT NULL,
  total_spent integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.kid_vehicle_rentals (
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  vehicle_kind text NOT NULL,
  rented_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL
);
CREATE TABLE public.kids (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  avatar text NOT NULL,
  pin text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  family_id uuid NOT NULL,
  cupcake_config jsonb DEFAULT '{"base": "cupcake", "topping": "none", "variety": "classic", "wrapper": "plain", "frosting": "white"}'::jsonb NOT NULL,
  grade smallint,
  land_slug text,
  grade_year smallint DEFAULT school_year(),
  focus_math text,
  focus_math_level integer,
  focus_reading text,
  focus_reading_level integer
);
CREATE TABLE public.observations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  kind text NOT NULL,
  title text,
  body text NOT NULL,
  skill_id uuid,
  calibrated_tier integer,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  family_id uuid
);
CREATE TABLE public.parents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.skills (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subject text NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL,
  tier integer NOT NULL,
  standard_code text,
  standard_desc text,
  grade_level text,
  on_track_tier integer,
  domain text,
  gamifiable boolean DEFAULT true NOT NULL
);
CREATE TABLE public.token_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kid_id uuid NOT NULL,
  family_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ----------------------------------------------------------- 4. primary keys
ALTER TABLE public.attempts ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.class_material ADD CONSTRAINT class_material_pkey PRIMARY KEY (id);
ALTER TABLE public.content ADD CONSTRAINT content_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_events_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_skills_pkey PRIMARY KEY (id);
ALTER TABLE public.families ADD CONSTRAINT families_pkey PRIMARY KEY (id);
ALTER TABLE public.family_digest_sends ADD CONSTRAINT family_digest_sends_pkey PRIMARY KEY (family_id, week_start);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.games ADD CONSTRAINT games_pkey PRIMARY KEY (id);
ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (code);
ALTER TABLE public.kid_avatar_position ADD CONSTRAINT kid_avatar_position_pkey PRIMARY KEY (kid_id);
ALTER TABLE public.kid_cupcake_unlocks ADD CONSTRAINT kid_cupcake_unlocks_pkey PRIMARY KEY (kid_id, kind, value);
ALTER TABLE public.kid_game_unlocks ADD CONSTRAINT kid_game_unlocks_pkey PRIMARY KEY (kid_id, game_slug);
ALTER TABLE public.kid_region_discoveries ADD CONSTRAINT kid_region_discoveries_pkey PRIMARY KEY (kid_id, region_slug);
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_pkey PRIMARY KEY (id);
ALTER TABLE public.kid_story_seen ADD CONSTRAINT kid_story_seen_pkey PRIMARY KEY (kid_id, story_slug);
ALTER TABLE public.kid_subject_placements ADD CONSTRAINT kid_subject_placements_pkey PRIMARY KEY (id);
ALTER TABLE public.kid_token_notice_seen ADD CONSTRAINT kid_token_notice_seen_pkey PRIMARY KEY (kid_id, transaction_id);
ALTER TABLE public.kid_tokens ADD CONSTRAINT kid_tokens_pkey PRIMARY KEY (kid_id);
ALTER TABLE public.kid_vehicle_rentals ADD CONSTRAINT kid_vehicle_rentals_pkey PRIMARY KEY (kid_id, vehicle_kind);
ALTER TABLE public.kids ADD CONSTRAINT kids_pkey PRIMARY KEY (id);
ALTER TABLE public.observations ADD CONSTRAINT observations_pkey PRIMARY KEY (id);
ALTER TABLE public.parents ADD CONSTRAINT parents_pkey PRIMARY KEY (id);
ALTER TABLE public.skills ADD CONSTRAINT skills_pkey PRIMARY KEY (id);
ALTER TABLE public.token_transactions ADD CONSTRAINT token_transactions_pkey PRIMARY KEY (id);

-- ----------------------------------- 5. unique, check and foreign key constraints
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_event_skill_unique UNIQUE (event_id, skill_id);
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_unique_pair UNIQUE (kid_id, skill_id);
ALTER TABLE public.kid_subject_placements ADD CONSTRAINT kid_subject_placements_kid_id_subject_key UNIQUE (kid_id, subject);
ALTER TABLE public.parents ADD CONSTRAINT parents_email_unique UNIQUE (email);
ALTER TABLE public.skills ADD CONSTRAINT skills_name_unique UNIQUE (subject, name);
ALTER TABLE public.attempts ADD CONSTRAINT attempts_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.attempts ADD CONSTRAINT attempts_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;
ALTER TABLE public.attempts ADD CONSTRAINT attempts_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.attempts ADD CONSTRAINT attempts_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT;
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.class_material ADD CONSTRAINT class_material_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.class_material ADD CONSTRAINT class_material_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.class_material ADD CONSTRAINT class_material_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE public.content ADD CONSTRAINT content_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_events_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE SET NULL;
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_events_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_events_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE SET NULL;
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_events_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_events_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE SET NULL;
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_skills_event_id_fkey FOREIGN KEY (event_id) REFERENCES evidence_events(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_skills_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT;
ALTER TABLE public.families ADD CONSTRAINT families_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.family_digest_sends ADD CONSTRAINT family_digest_sends_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.games ADD CONSTRAINT games_created_by_fkey FOREIGN KEY (created_by) REFERENCES kids(id) ON DELETE SET NULL;
ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_redeemed_by_family_id_fkey FOREIGN KEY (redeemed_by_family_id) REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_redeemed_by_user_id_fkey FOREIGN KEY (redeemed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.kid_avatar_position ADD CONSTRAINT kid_avatar_position_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.kid_avatar_position ADD CONSTRAINT kid_avatar_position_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_cupcake_unlocks ADD CONSTRAINT kid_cupcake_unlocks_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.kid_cupcake_unlocks ADD CONSTRAINT kid_cupcake_unlocks_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_game_unlocks ADD CONSTRAINT kid_game_unlocks_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.kid_game_unlocks ADD CONSTRAINT kid_game_unlocks_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_region_discoveries ADD CONSTRAINT kid_region_discoveries_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.kid_region_discoveries ADD CONSTRAINT kid_region_discoveries_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE;
ALTER TABLE public.kid_story_seen ADD CONSTRAINT kid_story_seen_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.kid_story_seen ADD CONSTRAINT kid_story_seen_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_subject_placements ADD CONSTRAINT kid_subject_placements_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.kid_subject_placements ADD CONSTRAINT kid_subject_placements_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_token_notice_seen ADD CONSTRAINT kid_token_notice_seen_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.kid_token_notice_seen ADD CONSTRAINT kid_token_notice_seen_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_token_notice_seen ADD CONSTRAINT kid_token_notice_seen_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES token_transactions(id) ON DELETE CASCADE;
ALTER TABLE public.kid_tokens ADD CONSTRAINT kid_tokens_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.kid_tokens ADD CONSTRAINT kid_tokens_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kid_vehicle_rentals ADD CONSTRAINT kid_vehicle_rentals_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.kid_vehicle_rentals ADD CONSTRAINT kid_vehicle_rentals_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.kids ADD CONSTRAINT kids_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.kids ADD CONSTRAINT kids_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE SET NULL;
ALTER TABLE public.observations ADD CONSTRAINT observations_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE;
ALTER TABLE public.observations ADD CONSTRAINT observations_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.observations ADD CONSTRAINT observations_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE public.token_transactions ADD CONSTRAINT token_transactions_family_id_fkey FOREIGN KEY (family_id) REFERENCES families(id);
ALTER TABLE public.token_transactions ADD CONSTRAINT token_transactions_kid_id_fkey FOREIGN KEY (kid_id) REFERENCES kids(id) ON DELETE CASCADE;
ALTER TABLE public.attempts ADD CONSTRAINT attempts_rt_nn CHECK (((response_time_ms IS NULL) OR (response_time_ms >= 0)));
ALTER TABLE public.attempts ADD CONSTRAINT attempts_tier_range CHECK (((tier >= 1) AND (tier <= 10)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_math_score_check CHECK (((math_score >= 0) AND (math_score <= 5)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_reading_score_check CHECK (((reading_score >= 0) AND (reading_score <= 5)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_result_math_tier_check CHECK (((result_math_tier >= 1) AND (result_math_tier <= 10)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_result_reading_tier_check CHECK (((result_reading_tier >= 1) AND (result_reading_tier <= 10)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_starting_math_tier_check CHECK (((starting_math_tier >= 1) AND (starting_math_tier <= 10)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_starting_reading_tier_check CHECK (((starting_reading_tier >= 1) AND (starting_reading_tier <= 10)));
ALTER TABLE public.cakey_quiz_sessions ADD CONSTRAINT cakey_quiz_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'expired'::text])));
ALTER TABLE public.class_material ADD CONSTRAINT class_material_kind_check CHECK ((kind = ANY (ARRAY['words'::text, 'standard'::text])));
ALTER TABLE public.class_material ADD CONSTRAINT class_material_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0));
ALTER TABLE public.class_material ADD CONSTRAINT class_material_words_present CHECK (((kind <> 'words'::text) OR (array_length(words, 1) > 0)));
ALTER TABLE public.content ADD CONSTRAINT content_tier_range CHECK (((tier >= 1) AND (tier <= 10)));
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_source_valid CHECK ((source = ANY (ARRAY['observation'::text, 'photo'::text, 'text'::text, 'game_session'::text, 'feedback_ticket'::text, 'manual'::text])));
ALTER TABLE public.evidence_events ADD CONSTRAINT evidence_status_valid CHECK ((status = ANY (ARRAY['applied'::text, 'reverted'::text, 'failed'::text, 'pending'::text])));
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_confidence_range CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)));
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_verdict_valid CHECK ((verdict = ANY (ARRAY['correct'::text, 'partial'::text, 'incorrect'::text, 'not-evidenced'::text])));
ALTER TABLE public.evidence_skills ADD CONSTRAINT evidence_weight_range CHECK (((weight >= (0)::double precision) AND (weight <= (1)::double precision)));
ALTER TABLE public.families ADD CONSTRAINT families_digest_emails_valid CHECK (((array_length(digest_emails, 1) IS NULL) OR (array_length(digest_emails, 1) <= 5)));
ALTER TABLE public.families ADD CONSTRAINT families_name_not_blank CHECK ((length(TRIM(BOTH FROM name)) > 0));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_status_valid CHECK ((status = ANY (ARRAY['new'::text, 'reviewed'::text, 'done'::text, 'wontfix'::text])));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_type_valid CHECK ((ticket_type = ANY (ARRAY['bug'::text, 'feature'::text, 'feedback'::text])));
ALTER TABLE public.games ADD CONSTRAINT games_subject_valid CHECK ((subject = ANY (ARRAY['math'::text, 'reading'::text])));
ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_redemption_pair CHECK ((((redeemed_at IS NULL) AND (redeemed_by_user_id IS NULL) AND (redeemed_by_family_id IS NULL)) OR ((redeemed_at IS NOT NULL) AND (redeemed_by_user_id IS NOT NULL) AND (redeemed_by_family_id IS NOT NULL))));
ALTER TABLE public.kid_cupcake_unlocks ADD CONSTRAINT kid_cupcake_unlocks_cost_paid_check CHECK ((cost_paid >= 0));
ALTER TABLE public.kid_cupcake_unlocks ADD CONSTRAINT kid_cupcake_unlocks_kind_check CHECK ((kind = ANY (ARRAY['base'::text, 'wrapper'::text, 'frosting'::text, 'topping'::text, 'variety'::text])));
ALTER TABLE public.kid_game_unlocks ADD CONSTRAINT kid_game_unlocks_cost_paid_check CHECK ((cost_paid >= 0));
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_attempts_nn CHECK ((total_attempts >= 0));
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_mastery_pct CHECK (((mastery_pct >= (0)::double precision) AND (mastery_pct <= (1)::double precision)));
ALTER TABLE public.kid_skills ADD CONSTRAINT kid_skills_tier_range CHECK (((current_tier >= 1) AND (current_tier <= 10)));
ALTER TABLE public.kid_subject_placements ADD CONSTRAINT kid_subject_placements_current_tier_check CHECK (((current_tier >= 1) AND (current_tier <= 10)));
ALTER TABLE public.kid_subject_placements ADD CONSTRAINT kid_subject_placements_subject_check CHECK ((subject = ANY (ARRAY['math'::text, 'reading'::text])));
ALTER TABLE public.kid_tokens ADD CONSTRAINT kid_tokens_balance_check CHECK ((balance >= 0));
ALTER TABLE public.kid_vehicle_rentals ADD CONSTRAINT kid_vehicle_rentals_vehicle_kind_check CHECK ((vehicle_kind = ANY (ARRAY['skateboard'::text, 'jeep'::text, 'biplane'::text, 'balloon'::text])));
ALTER TABLE public.kids ADD CONSTRAINT kids_focus_math_level_range CHECK (((focus_math_level IS NULL) OR ((focus_math_level >= 1) AND (focus_math_level <= 10))));
ALTER TABLE public.kids ADD CONSTRAINT kids_focus_reading_level_range CHECK (((focus_reading_level IS NULL) OR ((focus_reading_level >= 1) AND (focus_reading_level <= 10))));
ALTER TABLE public.kids ADD CONSTRAINT kids_grade_check CHECK (((grade IS NULL) OR ((grade >= 0) AND (grade <= 12))));
ALTER TABLE public.kids ADD CONSTRAINT kids_pin_format CHECK (((pin IS NULL) OR (pin ~ '^[0-9]{4}$'::text)));
ALTER TABLE public.observations ADD CONSTRAINT observations_body_nonempty CHECK ((length(body) > 0));
ALTER TABLE public.observations ADD CONSTRAINT observations_calibration_needs_skill CHECK (((calibrated_tier IS NULL) OR (skill_id IS NOT NULL)));
ALTER TABLE public.observations ADD CONSTRAINT observations_kind_valid CHECK ((kind = ANY (ARRAY['note'::text, 'homework'::text, 'writing'::text, 'teacher_report'::text])));
ALTER TABLE public.observations ADD CONSTRAINT observations_tier_range CHECK (((calibrated_tier IS NULL) OR ((calibrated_tier >= 1) AND (calibrated_tier <= 10))));
ALTER TABLE public.skills ADD CONSTRAINT skills_subject_valid CHECK ((subject = ANY (ARRAY['math'::text, 'reading'::text, 'logic'::text])));
ALTER TABLE public.skills ADD CONSTRAINT skills_tier_range CHECK (((tier >= 1) AND (tier <= 10)));
ALTER TABLE public.token_transactions ADD CONSTRAINT token_transactions_reason_check CHECK ((reason = ANY (ARRAY['session_drip'::text, 'tier_up'::text, 'milestone'::text, 'region_unlock'::text, 'parent_grant'::text, 'cupcake_unlock'::text, 'land_upgrade'::text, 'storm_clear'::text, 'vehicle_rental'::text, 'ferry_ride'::text, 'bus_ride'::text, 'game_unlock'::text])));

-- ---------------------------------------------------------------- 6. indexes
CREATE INDEX attempts_game_id_idx ON public.attempts USING btree (game_id);
CREATE INDEX attempts_game_idx ON public.attempts USING btree (game_slug, created_at DESC) WHERE (game_slug IS NOT NULL);
CREATE INDEX attempts_kid_created_at_idx ON public.attempts USING btree (kid_id, created_at DESC);
CREATE INDEX attempts_kid_game_idx ON public.attempts USING btree (kid_id, game_slug, created_at DESC);
CREATE INDEX attempts_kid_id_idx ON public.attempts USING btree (kid_id);
CREATE INDEX attempts_skill_id_idx ON public.attempts USING btree (skill_id);
CREATE INDEX cakey_quiz_sessions_kid_started_idx ON public.cakey_quiz_sessions USING btree (kid_id, started_at DESC);
CREATE INDEX class_material_kid_idx ON public.class_material USING btree (kid_id, kind, active);
CREATE INDEX content_skill_id_idx ON public.content USING btree (skill_id);
CREATE INDEX content_skill_tier_idx ON public.content USING btree (skill_id, tier);
CREATE INDEX evidence_events_kid_created_idx ON public.evidence_events USING btree (kid_id, created_at DESC);
CREATE INDEX evidence_events_status_idx ON public.evidence_events USING btree (status);
CREATE INDEX evidence_skills_event_idx ON public.evidence_skills USING btree (event_id);
CREATE INDEX evidence_skills_skill_idx ON public.evidence_skills USING btree (skill_id);
CREATE INDEX families_owner_user_id_idx ON public.families USING btree (owner_user_id);
CREATE INDEX feedback_kid_created_idx ON public.feedback USING btree (kid_id, created_at DESC);
CREATE INDEX feedback_status_idx ON public.feedback USING btree (status);
CREATE INDEX games_approved_idx ON public.games USING btree (approved);
CREATE INDEX games_created_by_idx ON public.games USING btree (created_by);
CREATE INDEX games_subject_idx ON public.games USING btree (subject);
CREATE INDEX invite_codes_redeemed_by_family_id_idx ON public.invite_codes USING btree (redeemed_by_family_id);
CREATE INDEX kid_avatar_position_family_id_idx ON public.kid_avatar_position USING btree (family_id);
CREATE INDEX kid_cupcake_unlocks_kid_idx ON public.kid_cupcake_unlocks USING btree (kid_id);
CREATE INDEX kid_game_unlocks_family_idx ON public.kid_game_unlocks USING btree (family_id);
CREATE INDEX kid_game_unlocks_kid_idx ON public.kid_game_unlocks USING btree (kid_id);
CREATE INDEX kid_region_discoveries_family_id_idx ON public.kid_region_discoveries USING btree (family_id);
CREATE INDEX kid_skills_kid_id_idx ON public.kid_skills USING btree (kid_id);
CREATE INDEX kid_skills_skill_id_idx ON public.kid_skills USING btree (skill_id);
CREATE INDEX kid_story_seen_family_id_idx ON public.kid_story_seen USING btree (family_id);
CREATE INDEX kid_subject_placements_kid_idx ON public.kid_subject_placements USING btree (kid_id);
CREATE INDEX kid_token_notice_seen_family_id_idx ON public.kid_token_notice_seen USING btree (family_id);
CREATE INDEX kid_tokens_family_id_idx ON public.kid_tokens USING btree (family_id);
CREATE INDEX kid_vehicle_rentals_active_idx ON public.kid_vehicle_rentals USING btree (kid_id, expires_at);
CREATE INDEX kids_family_id_idx ON public.kids USING btree (family_id);
CREATE UNIQUE INDEX kids_family_land_slug_idx ON public.kids USING btree (family_id, land_slug) WHERE (land_slug IS NOT NULL);
CREATE INDEX kids_grade_idx ON public.kids USING btree (grade);
CREATE INDEX kids_parent_id_idx ON public.kids USING btree (parent_id);
CREATE INDEX observations_kid_created_idx ON public.observations USING btree (kid_id, created_at DESC);
CREATE INDEX observations_skill_id_idx ON public.observations USING btree (skill_id);
CREATE UNIQUE INDEX token_transactions_attempt_idempotent_idx ON public.token_transactions USING btree (((metadata ->> 'attempt_id'::text))) WHERE (metadata ? 'attempt_id'::text);
CREATE INDEX token_transactions_kid_created_idx ON public.token_transactions USING btree (kid_id, created_at DESC);
CREATE UNIQUE INDEX token_transactions_milestone_idempotent_idx ON public.token_transactions USING btree (((metadata ->> 'milestone_id'::text))) WHERE (metadata ? 'milestone_id'::text);

-- --------------------------------------------------------------- 7. triggers
CREATE TRIGGER set_family_id BEFORE INSERT ON public.attempts FOR EACH ROW EXECUTE FUNCTION set_family_from_kid();
CREATE TRIGGER set_family_id BEFORE INSERT ON public.evidence_events FOR EACH ROW EXECUTE FUNCTION set_family_from_kid();
CREATE TRIGGER set_family_id BEFORE INSERT ON public.evidence_skills FOR EACH ROW EXECUTE FUNCTION set_family_from_event();
CREATE TRIGGER set_family_id BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION set_family_from_kid();
CREATE TRIGGER set_family_id BEFORE INSERT ON public.kid_cupcake_unlocks FOR EACH ROW EXECUTE FUNCTION set_family_from_kid();
CREATE TRIGGER set_family_id BEFORE INSERT ON public.kid_skills FOR EACH ROW EXECUTE FUNCTION set_family_from_kid();
CREATE TRIGGER kids_init_tokens AFTER INSERT ON public.kids FOR EACH ROW EXECUTE FUNCTION ensure_kid_tokens_row();
CREATE TRIGGER kids_init_town_starters AFTER INSERT ON public.kids FOR EACH ROW EXECUTE FUNCTION ensure_kid_town_starters();
CREATE TRIGGER set_family_id BEFORE INSERT ON public.observations FOR EACH ROW EXECUTE FUNCTION set_family_from_kid();

-- ------------------------------------------------------- 8. row level security
-- Some tables below get RLS enabled and NO policy. That is DELIBERATE, not an
-- omission: with RLS on and no policy every client role is denied, and only
-- the server's service_role (which bypasses RLS) can read them. Adding a
-- permissive policy to "fix" one would expose invite codes and parent records.
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cakey_quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_digest_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_avatar_position ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_cupcake_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_game_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_region_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_story_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_subject_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_token_notice_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kid_vehicle_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------- 9. policies
CREATE POLICY attempts_family_isolation ON public.attempts AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY cakey_quiz_sessions_family_isolation ON public.cakey_quiz_sessions AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY evidence_events_family_isolation ON public.evidence_events AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY evidence_skills_family_isolation ON public.evidence_skills AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY families_owner_select ON public.families AS PERMISSIVE FOR SELECT TO authenticated
  USING ((owner_user_id = auth.uid()));
CREATE POLICY families_owner_update ON public.families AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((owner_user_id = auth.uid()))
  WITH CHECK ((owner_user_id = auth.uid()));
CREATE POLICY family_digest_sends_isolation ON public.family_digest_sends AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY feedback_family_isolation ON public.feedback AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_avatar_position_family_isolation ON public.kid_avatar_position AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_cupcake_unlocks_family_isolation ON public.kid_cupcake_unlocks AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_game_unlocks_family_isolation ON public.kid_game_unlocks AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_region_discoveries_family_isolation ON public.kid_region_discoveries AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_skills_family_isolation ON public.kid_skills AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_story_seen_family_isolation ON public.kid_story_seen AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_subject_placements_family_isolation ON public.kid_subject_placements AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_token_notice_seen_family_isolation ON public.kid_token_notice_seen AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_tokens_family_isolation ON public.kid_tokens AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kid_vehicle_rentals_family_isolation ON public.kid_vehicle_rentals AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY kids_family_isolation ON public.kids AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY observations_family_isolation ON public.observations AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));
CREATE POLICY token_transactions_family_isolation ON public.token_transactions AS PERMISSIVE FOR ALL TO authenticated
  USING ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))))
  WITH CHECK ((family_id IN ( SELECT families.id
   FROM families
  WHERE (families.owner_user_id = auth.uid()))));

-- ------------------------------------------------------- 9b. table privileges
-- CREATE TABLE grants nothing. On a fresh Supabase project the public schema
-- carries default privileges that would cover these, but relying on that is
-- how you get a database whose tables all exist and none of which the app can
-- read -- PostgREST returns 42501 "permission denied for table skills" and the
-- setup script reports an empty catalog. Granting explicitly makes the
-- baseline self-sufficient on any project, including one whose public schema
-- was dropped and recreated.
--
-- Wide table grants are Supabase's model, not an oversight: row level security
-- is the actual gate (section 8), and the production database grants exactly
-- this. The five RLS-enabled tables with no policy stay locked to clients
-- regardless of the grant below, because RLS is evaluated after privileges.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;

-- And for anything a later migration adds.
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;

-- -------------------------------------------------------- 10. storage buckets
-- Private, with no storage policies: uploads and reads go through the server
-- using the service key. Parent observation photos and kid feedback
-- attachments break without these.
insert into storage.buckets (id, name, public) values
  ('feedback', 'feedback', false),
  ('observations', 'observations', false)
on conflict (id) do nothing;

-- -------------------------------------------------------------- 11. seed data
-- Skills catalog: 64 rows. Universal content, no family_id and
-- no kid_id. IDs are preserved so installs are reproducible and anything
-- referencing a skill by id stays stable.
INSERT INTO public.skills ("id", "subject", "name", "display_name", "tier", "standard_code", "standard_desc", "grade_level", "on_track_tier", "domain", "gamifiable") VALUES
  ('10000000-0000-4000-8000-000000000001', 'math', 'counting-to-20', 'Counting to 20', 1, 'K.CC.A.1, K.CC.B.5', 'Count to 100 by ones and tens; count objects to 20', 'K', 3, 'counting', true),
  ('10000000-0000-4000-8000-000000000002', 'math', 'add-within-10', 'Add within 10', 2, 'K.OA.A.5, 1.OA.C.6', 'Fluently add within 5 (K); add and subtract within 20 with fluency within 10 (1st)', 'K-1', 4, 'operations', true),
  ('10000000-0000-4000-8000-000000000003', 'math', 'subtract-within-10', 'Subtract within 10', 2, 'K.OA.A.2, 1.OA.C.6', 'Solve subtraction word problems within 10; subtract within 20 with fluency within 10', 'K-1', 4, 'operations', true),
  ('10000000-0000-4000-8000-000000000004', 'math', 'add-within-20', 'Add within 20', 3, '1.OA.C.6, 2.OA.B.2', 'Add within 20 (1st); fluently add and subtract within 20 (2nd)', '1-2', 5, 'operations', true),
  ('10000000-0000-4000-8000-000000000005', 'math', 'subtract-within-20', 'Subtract within 20', 3, '1.OA.C.6, 2.OA.B.2', 'Subtract within 20 (1st); fluently add and subtract within 20 (2nd)', '1-2', 5, 'operations', true),
  ('10000000-0000-4000-8000-000000000006', 'math', 'skip-counting', 'Skip counting by 2s and 5s', 4, '2.NBT.A.2', 'Count within 1000; skip-count by 5s, 10s, and 100s', '2', 5, 'counting', true),
  ('10000000-0000-4000-8000-000000000007', 'math', 'add-double-digit', 'Double-digit addition', 5, '1.NBT.C.4, 2.NBT.B.5', 'Add within 100 including a two-digit and one-digit number (1st); fluently add within 100 (2nd)', '1-2', 6, 'operations', true),
  ('10000000-0000-4000-8000-000000000008', 'math', 'subtract-double-digit', 'Double-digit subtraction', 5, '2.NBT.B.5, 2.NBT.B.7', 'Fluently subtract within 100 (2nd); add and subtract within 1000 (2nd)', '2', 6, 'operations', true),
  ('10000000-0000-4000-8000-000000000009', 'math', 'multiply-within-25', 'Multiply within 25', 6, '2.OA.C.4, 3.OA.A.1', 'Use addition to find total in rectangular arrays (intro to multiplication); understand multiplication as equal groups (3rd)', '2-3', 7, 'operations', true),
  ('10000000-0000-4000-8000-000000000010', 'math', 'number-comparison', 'Number comparison', 1, 'K.CC.C.6, K.CC.C.7', 'Identify whether one group is greater than, less than, or equal to another; compare two numbers 1-10', 'K', 3, 'counting', true),
  ('10000000-0000-4000-8000-000000000011', 'math', 'make-ten', 'Make 10 (number bonds)', 2, 'K.OA.A.4', 'For each number 1-9, find the number that makes 10 when added to it', 'K', 4, 'operations', true),
  ('10000000-0000-4000-8000-000000000012', 'math', 'place-value', 'Place value (tens & ones)', 3, '1.NBT.B.2, 2.NBT.A.1', 'Understand that two-digit numbers are composed of tens and ones; understand hundreds, tens, ones (2nd)', '1-2', 5, 'place-value', true),
  ('10000000-0000-4000-8000-000000000013', 'math', 'add-subtract-within-100', 'Add & subtract within 100', 5, '2.NBT.B.5', 'Fluently add and subtract within 100 using strategies based on place value', '2', 6, 'operations', true),
  ('10000000-0000-4000-8000-000000000014', 'math', 'word-problems', 'Word problems (add/sub)', 3, 'K.OA.A.2, 1.OA.A.1, 2.OA.A.1', 'Solve addition and subtraction word problems within 10 (K), within 20 (1st), within 100 (2nd)', 'K-2', 5, 'operations', true),
  ('10000000-0000-4000-8000-000000000020', 'math', 'multiply-within-100', 'Multiply within 100', 7, '3.OA.C.7', 'Fluently multiply within 100 using strategies such as the relationship between multiplication and division', '3', 7, 'operations', true),
  ('10000000-0000-4000-8000-000000000021', 'math', 'divide-within-100', 'Divide within 100', 7, '3.OA.C.7', 'Fluently divide within 100 using the relationship between multiplication and division', '3', 7, 'operations', true),
  ('10000000-0000-4000-8000-000000000022', 'math', 'multi-digit-multiply', 'Multi-digit multiplication', 8, '4.NBT.B.5', 'Multiply a whole number of up to four digits by a one-digit number; multiply two two-digit numbers', '4', 8, 'operations', true),
  ('10000000-0000-4000-8000-000000000023', 'math', 'long-division', 'Long division', 8, '4.NBT.B.6', 'Find whole-number quotients and remainders with up to four-digit dividends and one-digit divisors', '4', 8, 'operations', true),
  ('10000000-0000-4000-8000-000000000024', 'math', 'multi-digit-operations', 'Multi-digit add/subtract', 8, '4.NBT.B.4', 'Fluently add and subtract multi-digit whole numbers using the standard algorithm', '3-4', 8, 'operations', true),
  ('10000000-0000-4000-8000-000000000025', 'math', 'order-of-operations', 'Order of operations', 9, '5.OA.A.1', 'Use parentheses, brackets, and braces in numerical expressions; evaluate expressions with these symbols', '5', 9, 'operations', true),
  ('10000000-0000-4000-8000-000000000030', 'math', 'fraction-concepts', 'Fraction concepts', 7, '3.NF.A.1, 3.NF.A.2', 'Understand fractions as parts of a whole; represent fractions on a number line', '3', 7, 'fractions', true),
  ('10000000-0000-4000-8000-000000000031', 'math', 'equivalent-fractions', 'Equivalent fractions', 7, '3.NF.A.3, 4.NF.A.1', 'Explain equivalence of fractions; compare fractions by reasoning about their size', '3-4', 8, 'fractions', true),
  ('10000000-0000-4000-8000-000000000032', 'math', 'add-subtract-fractions', 'Add & subtract fractions', 8, '4.NF.B.3, 5.NF.A.1', 'Add and subtract fractions with like denominators (4th); unlike denominators (5th)', '4-5', 9, 'fractions', true),
  ('10000000-0000-4000-8000-000000000033', 'math', 'multiply-divide-fractions', 'Multiply & divide fractions', 9, '5.NF.B.4, 6.NS.A.1', 'Multiply fractions and mixed numbers (5th); divide fractions by fractions (6th)', '5-6', 10, 'fractions', true),
  ('10000000-0000-4000-8000-000000000034', 'math', 'decimals', 'Decimals', 8, '4.NF.C.6, 5.NBT.A.3', 'Use decimal notation for fractions with denominators 10 or 100 (4th); read, write, and compare decimals (5th)', '4-5', 9, 'fractions', true),
  ('10000000-0000-4000-8000-000000000040', 'math', 'time-and-money', 'Time & money', 4, '1.MD.B.3, 2.MD.C.7, 2.MD.C.8', 'Tell time to the hour and half-hour (1st); to nearest 5 min (2nd); solve money word problems (2nd)', '1-2', 5, 'measurement', true),
  ('10000000-0000-4000-8000-000000000041', 'math', 'measurement-length', 'Measurement & length', 5, '2.MD.A.1, 3.MD.B.4', 'Measure and estimate lengths in standard units; generate measurement data and make line plots', '2-3', 6, 'measurement', true),
  ('10000000-0000-4000-8000-000000000042', 'math', 'area-and-perimeter', 'Area & perimeter', 7, '3.MD.C.5, 3.MD.D.8, 4.MD.A.3', 'Understand area as covering; relate area to multiplication; solve perimeter problems', '3-4', 8, 'measurement', true),
  ('10000000-0000-4000-8000-000000000043', 'math', 'data-and-graphs', 'Data & graphs', 6, '2.MD.D.10, 3.MD.B.3, 5.MD.B.2', 'Draw picture graphs and bar graphs (2nd); make scaled graphs (3rd); line plots with fractions (5th)', '2-5', 8, 'measurement', true),
  ('10000000-0000-4000-8000-000000000050', 'math', 'shapes-2d', '2D shapes', 2, 'K.G.A.2, 1.G.A.1, 2.G.A.1', 'Identify and describe 2D shapes (circles, triangles, rectangles, squares, hexagons)', 'K-2', 5, 'geometry', true),
  ('10000000-0000-4000-8000-000000000051', 'math', 'shapes-3d', '3D shapes', 4, 'K.G.A.3, 1.G.A.2', 'Identify 3D shapes (cubes, cones, cylinders, spheres); compose shapes from simpler shapes', 'K-1', 4, 'geometry', true),
  ('10000000-0000-4000-8000-000000000052', 'math', 'angles-and-lines', 'Angles & lines', 8, '4.G.A.1, 4.MD.C.5', 'Draw and identify points, lines, rays, angles; measure angles with a protractor', '4', 8, 'geometry', false),
  ('10000000-0000-4000-8000-000000000053', 'math', 'coordinate-plane', 'Coordinate plane', 9, '5.G.A.1, 6.NS.C.6', 'Graph points on the coordinate plane; understand positive and negative numbers on number lines', '5-6', 10, 'geometry', false),
  ('10000000-0000-4000-8000-000000000060', 'math', 'place-value-thousands', 'Place value to 1000s', 6, '2.NBT.A.1, 3.NBT.A.1', 'Understand hundreds digit; round to nearest 10 or 100', '2-3', 7, 'place-value', true),
  ('10000000-0000-4000-8000-000000000061', 'math', 'place-value-millions', 'Place value to millions', 8, '4.NBT.A.1, 4.NBT.A.2', 'Recognize that a digit is 10x what it represents in the place to its right; read and write multi-digit numbers', '4', 8, 'place-value', true),
  ('10000000-0000-4000-8000-000000000062', 'math', 'place-value-decimals', 'Decimal place value', 9, '5.NBT.A.1, 5.NBT.A.3', 'Understand the place value system extends to decimals; read and compare decimals to thousandths', '5', 9, 'place-value', true),
  ('10000000-0000-4000-8000-000000000070', 'math', 'ratios', 'Ratios & rates', 10, '6.RP.A.1, 6.RP.A.2', 'Understand ratio concepts; use ratio language to describe relationships; find unit rates', '6', 10, 'ratios', true),
  ('10000000-0000-4000-8000-000000000071', 'math', 'percents', 'Percents', 10, '6.RP.A.3.C', 'Find a percent of a quantity as a rate per 100; solve problems involving percentages', '6', 10, 'ratios', true),
  ('20000000-0000-4000-8000-000000000001', 'reading', 'letter-sounds', 'Letter sounds', 1, 'RF.K.3', 'Know and apply grade-level phonics: letter-sound correspondences', 'K', 3, 'phonics', true),
  ('20000000-0000-4000-8000-000000000002', 'reading', 'sight-words-kindergarten', 'Kindergarten sight words', 2, 'RF.K.3.C', 'Read common high-frequency words by sight (the, of, to, you, etc.)', 'K', 4, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000003', 'reading', 'rhyming-words', 'Rhyming words', 2, 'RF.K.2.A', 'Recognize and produce rhyming words', 'K', 3, 'phonics', true),
  ('20000000-0000-4000-8000-000000000004', 'reading', 'sight-words-first-grade', 'First grade sight words', 3, 'RF.1.3.G', 'Recognize and read grade-appropriate irregularly spelled words', '1', 5, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000005', 'reading', 'simple-comprehension', 'Simple comprehension', 3, 'RL.K.1, RL.1.1', 'Ask and answer questions about key details in a text', 'K-1', 4, 'comprehension', true),
  ('20000000-0000-4000-8000-000000000006', 'reading', 'synonyms', 'Synonyms', 4, 'L.2.5', 'Demonstrate understanding of word relationships: synonyms, antonyms', '2', 5, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000010', 'reading', 'phonological-awareness', 'Phonological awareness', 1, 'RF.K.2', 'Demonstrate understanding of spoken words, syllables, and sounds (phonemes)', 'K', 3, 'phonics', true),
  ('20000000-0000-4000-8000-000000000011', 'reading', 'sight-words-second-grade', 'Second grade sight words', 4, 'RF.2.3', 'Know and apply grade-level phonics: distinguish long and short vowels, decode two-syllable words', '2', 5, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000012', 'reading', 'reading-comprehension', 'Reading comprehension', 4, 'RL.2.1, RL.2.3', 'Ask and answer who, what, where, when, why, how; describe how characters respond to major events', '2', 5, 'comprehension', true),
  ('20000000-0000-4000-8000-000000000020', 'reading', 'multisyllabic-words', 'Multisyllabic decoding', 5, 'RF.2.3.C, RF.3.3.C', 'Decode multisyllabic words; identify and know the meaning of common prefixes and suffixes', '2-3', 6, 'phonics', true),
  ('20000000-0000-4000-8000-000000000021', 'reading', 'reading-fluency', 'Reading fluency', 6, 'RF.3.4, RF.4.4, RF.5.4', 'Read grade-level text with purpose, accuracy, appropriate rate, and expression', '3-5', 8, 'phonics', false),
  ('20000000-0000-4000-8000-000000000030', 'reading', 'context-clues', 'Context clues', 7, 'L.3.4, L.4.4', 'Determine the meaning of unknown words using context clues, affixes, and root words', '3-4', 8, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000031', 'reading', 'greek-latin-roots', 'Greek & Latin roots', 8, 'L.4.4.B, L.5.4.B, L.6.4.B', 'Use common Greek and Latin affixes and roots as clues to the meaning of a word', '4-6', 9, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000032', 'reading', 'figurative-language', 'Figurative language', 8, 'L.4.5, L.5.5', 'Explain the meaning of similes, metaphors, idioms, adages, and proverbs', '4-5', 9, 'vocabulary', true),
  ('20000000-0000-4000-8000-000000000040', 'reading', 'main-idea', 'Main idea & details', 6, 'RI.2.2, RI.3.2, RI.4.2', 'Identify the main topic (2nd); determine the main idea and explain how key details support it (3rd-4th)', '2-4', 8, 'comprehension', false),
  ('20000000-0000-4000-8000-000000000041', 'reading', 'text-structure', 'Text structure', 7, 'RI.3.8, RI.4.5, RI.5.5', 'Describe the logical connection between sentences/paragraphs; explain how text structure contributes to meaning', '3-5', 9, 'comprehension', false),
  ('20000000-0000-4000-8000-000000000042', 'reading', 'evidence-based-answers', 'Evidence-based answers', 8, 'RL.4.1, RI.4.1, RL.5.1, RI.5.1', 'Refer to details and examples in a text when explaining what the text says and when drawing inferences', '4-5', 9, 'comprehension', false),
  ('20000000-0000-4000-8000-000000000043', 'reading', 'compare-texts', 'Compare & contrast texts', 9, 'RL.5.9, RI.6.9', 'Compare and contrast stories in the same genre; compare two authors approaches to the same topic', '5-6', 10, 'comprehension', false),
  ('20000000-0000-4000-8000-000000000050', 'reading', 'capitalization-punctuation', 'Capitalization & punctuation', 3, 'L.K.2, L.1.2, L.2.2', 'Capitalize first word of sentence and "I" (K); use end punctuation; commas and apostrophes (2nd)', 'K-2', 5, 'grammar', true),
  ('20000000-0000-4000-8000-000000000051', 'reading', 'parts-of-speech', 'Parts of speech', 5, 'L.1.1, L.2.1, L.3.1', 'Use nouns, verbs, adjectives, adverbs, pronouns, and conjunctions correctly', '1-3', 7, 'grammar', true),
  ('20000000-0000-4000-8000-000000000052', 'reading', 'sentence-structure', 'Sentence structure', 7, 'L.3.1.I, L.4.1, L.5.1', 'Produce simple, compound, and complex sentences; correct fragments and run-ons', '3-5', 9, 'grammar', false),
  ('20000000-0000-4000-8000-000000000053', 'reading', 'spelling-patterns', 'Spelling patterns', 4, 'L.2.2.D, L.3.2.E, L.4.2.D', 'Generalize learned spelling patterns; use conventional spelling for high-frequency words and adding suffixes', '2-4', 7, 'grammar', true),
  ('20000000-0000-4000-8000-000000000054', 'reading', 'narrative-writing', 'Narrative writing', 6, 'W.2.3, W.3.3, W.4.3', 'Write narratives with events in order, descriptive details, temporal words, and a sense of closure', '2-4', 8, 'grammar', false),
  ('20000000-0000-4000-8000-000000000055', 'reading', 'informational-writing', 'Informational writing', 7, 'W.3.2, W.4.2, W.5.2', 'Write informative texts that introduce a topic, develop points with facts/details, and provide a conclusion', '3-5', 9, 'grammar', false),
  ('30000000-0000-4000-8000-000000000001', 'logic', 'chess-puzzles', 'Chess Puzzles', 3, NULL, NULL, NULL, NULL, NULL, true),
  ('30000000-0000-4000-8000-000000000002', 'logic', 'checkers', 'Checkers', 2, NULL, NULL, NULL, NULL, NULL, true)
ON CONFLICT (id) DO NOTHING;
