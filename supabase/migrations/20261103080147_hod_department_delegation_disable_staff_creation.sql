-- HOD delegation stays within the department; project Staff membership is optional.
-- Ordinary Staff may not create tasks, including through direct API calls.
do $migration$
declare definition text; anchor text;
begin
  definition := pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure);
  anchor := '        or not v_project_staff_membership_defined';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected exactly one project Staff eligibility boundary';
  end if;
  execute replace(definition,anchor,anchor || E'\n        or v_actor_is_hod');
  definition := pg_get_functiondef('private.aitask_has_permission(text,text)'::regprocedure);
  anchor := '      when member.is_super_admin then true';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected exactly one member permission boundary';
  end if;
  execute replace(definition,anchor,anchor || E'\n      when p_permission = ''createTasks'' and member.role = ''Staff''\n        and coalesce(member.custom_role_id, '''') <> ''builtin-hod'' then false');
end;
$migration$;

update public.aitask_entities
set data = jsonb_set(data, '{permissions,createTasks}', 'false'::jsonb)
where entity_type = 'custom_role' and entity_id = 'builtin-staff';
