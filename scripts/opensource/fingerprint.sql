select line from (
  select 'COL  '||c.relname||'.'||a.attname||' :: '||format_type(a.atttypid,a.atttypmod)
         ||coalesce(' DEF '||pg_get_expr(ad.adbin,ad.adrelid),'')
         ||case when a.attnotnull then ' NOTNULL' else '' end as line
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
  where n.nspname='public' and c.relkind='r'
  union all select 'CON  '||cl.relname||' '||c.conname||' '||pg_get_constraintdef(c.oid)
  from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace
  where n.nspname='public'
  union all select 'IDX  '||indexdef from pg_indexes where schemaname='public'
  union all select 'FUN  '||p.proname||' '||md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
  union all select 'TRG  '||md5(pg_get_triggerdef(t.oid)) from pg_trigger t
  join pg_class cl on cl.oid=t.tgrelid join pg_namespace n on n.oid=cl.relnamespace
  where n.nspname='public' and not t.tgisinternal
  union all select 'RLS  '||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  union all select 'POL  '||tablename||' '||policyname||' '||md5(coalesce(qual,'')||coalesce(with_check,''))
  from pg_policies where schemaname='public'
  union all select 'BUK  '||id||' public='||public::text from storage.buckets
  -- Table privileges. Added after a baseline that reproduced every structural
  -- detail still produced a database the app could not read: CREATE TABLE
  -- grants nothing, so the tables existed with an empty ACL and PostgREST
  -- returned 42501 "permission denied". Structure and permission are separate,
  -- and a fingerprint that only covers structure will call them identical.
  union all select 'ACL  '||c.relname||' '||coalesce(array_to_string(c.relacl,' | '),'(NONE)')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
  union all select 'SKILLS '||(select count(*) from public.skills)::text
) x order by line;
