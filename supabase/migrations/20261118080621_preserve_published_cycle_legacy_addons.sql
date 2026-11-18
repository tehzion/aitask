-- The current client omits the retired addonSnapshots field when saving a
-- service cycle. Keep its stored value so a status update cannot erase the
-- frozen snapshot or fail because of the omission. An explicitly changed
-- snapshot still goes through the existing frozen-field check.
do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_guard_published_cycle_pricing()'::regprocedure);
  anchor text := $old$    if coalesce(old.data ->> 'publishedAt', '') <> '' then
      foreach v_key in array v_frozen loop$old$;
  replacement text := $new$    if coalesce(old.data ->> 'publishedAt', '') <> '' then
      if old.data ? 'addonSnapshots' and not (new.data ? 'addonSnapshots') then
        new.data := jsonb_set(new.data, '{addonSnapshots}', old.data -> 'addonSnapshots');
      end if;
      foreach v_key in array v_frozen loop$new$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one published cycle pricing guard to preserve legacy add-ons.';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
