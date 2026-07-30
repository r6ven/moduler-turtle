-- Keep ranked puzzle checksums stable after JSON definitions pass through jsonb.
-- PostgreSQL jsonb does not preserve object key insertion order, so checksums must
-- be calculated from a recursively key-sorted canonical representation.

create or replace function public._ranked_canonical_jsonb(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case jsonb_typeof(p_value)
    when 'object' then (
      select '{' || coalesce(
        string_agg(
          to_json(item.key)::text || ':' || public._ranked_canonical_jsonb(item.value),
          ',' order by item.key
        ),
        ''
      ) || '}'
      from jsonb_each(p_value) as item(key, value)
    )
    when 'array' then (
      select '[' || coalesce(
        string_agg(
          public._ranked_canonical_jsonb(item.value),
          ',' order by item.ordinal
        ),
        ''
      ) || ']'
      from jsonb_array_elements(p_value) with ordinality as item(value, ordinal)
    )
    else p_value::text
  end;
$$;

create or replace function public._ranked_fnv1a32(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_hash bigint := 2166136261;
  v_bytes bytea := convert_to(p_value, 'UTF8');
  v_index integer;
begin
  if length(v_bytes) > 0 then
    for v_index in 0..length(v_bytes) - 1 loop
      v_hash := (
        (v_hash # get_byte(v_bytes, v_index)::bigint) * 16777619
      ) % 4294967296;
    end loop;
  end if;

  return 'fnv1a32-' || lpad(to_hex(v_hash), 8, '0');
end;
$$;

revoke all on function public._ranked_canonical_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public._ranked_fnv1a32(text) from public, anon, authenticated;

alter table public.ranked_puzzle_slots disable trigger protect_ranked_slot;

update public.ranked_puzzle_slots
set gameplay_checksum = public._ranked_fnv1a32(
      public._ranked_canonical_jsonb(gameplay_definition)
    ),
    presentation_checksum = public._ranked_fnv1a32(
      public._ranked_canonical_jsonb(presentation_definition)
    );

alter table public.ranked_puzzle_slots enable trigger protect_ranked_slot;

drop function public._ranked_fnv1a32(text);
drop function public._ranked_canonical_jsonb(jsonb);
