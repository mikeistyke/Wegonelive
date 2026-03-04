-- Security fix: ensure rls_auto_enable does not run as SECURITY DEFINER.

begin;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.prosecdef = true
  ) then
    execute 'alter function public.rls_auto_enable() security invoker';
  end if;
end
$$;

commit;
