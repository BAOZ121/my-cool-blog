-- TEST ONLY: emulate the target project's pre-existing automatic RLS trigger.
-- Never deploy this fixture or recreate/replace the managed production function.
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.schema_name = 'public' and cmd.object_type = 'table' then
      execute format('alter table %s enable row level security',cmd.object_identity);
    end if;
  end loop;
end;
$$;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
  execute function public.rls_auto_enable();
