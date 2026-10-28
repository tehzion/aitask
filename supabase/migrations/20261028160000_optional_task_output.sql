-- Output is optional when submitting any task (owner decision, 28 Oct 2026).
-- private.aitask_guard_task_workflow rejected review or completion of a
-- deliverable-linked task that had no output link or file. Keep its output
-- validation but only for a link that is actually supplied: an unsafe link
-- (not https, credentials in the URL, over 2048 characters) is still rejected,
-- while a task with no output may now be submitted.
--
-- The function is patched in place (both anchors must match exactly once) so
-- the rest of its 7 kB definition, grants and settings stay byte-identical.

do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_guard_task_workflow()'::regprocedure);
  v_condition_old constant text := 'if not v_evidence then';
  v_condition_new constant text := 'if not v_evidence and btrim(coalesce(new.data->>''attachmentLink'', '''')) <> '''' then';
  v_message_old constant text := 'Add an output link or upload a deliverable file before sending this linked task for review or completing it.';
  v_message_new constant text := 'Use a valid https:// output link without a username or password.';
begin
  if (length(v_definition) - length(replace(v_definition, v_condition_old, ''))) / length(v_condition_old) <> 1 then
    raise exception 'Linked-task output condition anchor must occur exactly once';
  end if;
  if (length(v_definition) - length(replace(v_definition, v_message_old, ''))) / length(v_message_old) <> 1 then
    raise exception 'Linked-task output message anchor must occur exactly once';
  end if;
  execute replace(replace(v_definition, v_condition_old, v_condition_new), v_message_old, v_message_new);
end;
$migration$;
