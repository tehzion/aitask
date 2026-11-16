-- HOD is an execution role for assigned projects. Project creation remains
-- with Boss Koo and Project Managers, matching the documented role template,
-- even when a per-member or role-template override tries to grant it.
do $migration$
declare
  definition text;
  anchor text := $anchor$        'manageServiceCycles','viewAllServiceClients','viewServicePrices'$anchor$;
  replacement text := $replacement$        'manageServiceCycles','viewAllServiceClients','viewServicePrices','createProjects'$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_has_permission(text,text)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 2 then
    raise exception 'Expected two HOD restricted permission lists in aitask_has_permission';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

do $migration$
declare
  definition text;
  anchor text := $anchor$        'manageServiceCycles','viewAllServiceClients','viewServicePrices'$anchor$;
  replacement text := $replacement$        'manageServiceCycles','viewAllServiceClients','viewServicePrices','createProjects'$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_guard_custom_role_scope()'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one HOD restricted permission list in aitask_guard_custom_role_scope';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
