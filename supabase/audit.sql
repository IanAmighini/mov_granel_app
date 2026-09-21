-- ============================================================================
-- AUDITORÍA
--
-- Devuelve algo que la migración se llevó puesto: la Google Sheet tenía
-- historial de revisiones gratis y Postgres no trae nada equivalente.
--
-- Un trigger por tabla guarda el antes y el después de cada alta, cambio y
-- baja, junto con quién lo hizo. De paso, como el borrado deja la fila
-- completa guardada, los borrados dejan de ser definitivos.
--
-- Las pantallas no cambian: el trigger saca el usuario del mismo JWT que ya
-- viaja en cada pedido.
-- ============================================================================

begin;

create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),

  -- Quién. Sale de los claims del JWT que firma la Edge Function de login.
  -- Queda en null cuando el cambio se hizo desde el SQL Editor, que no manda
  -- JWT: eso también es información útil.
  actor_id    uuid,
  actor_email text,

  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null,
  row_id      uuid not null,

  -- La fila entera, antes y después. En un borrado, `old_row` es lo que hace
  -- falta para poder restaurarla.
  old_row     jsonb,
  new_row     jsonb,
  changed     text[]          -- sólo en update: qué campos cambiaron
);

create index on audit_log (at desc);
create index on audit_log (table_name, row_id, at desc);
create index on audit_log (actor_email, at desc);

-- ---------------------------------------------------------------------------
-- El trigger
--
-- SECURITY DEFINER a propósito: corre con los permisos del dueño, así el log
-- se escribe aunque al usuario no se le haya dado permiso de escritura sobre
-- audit_log. Justamente de eso se trata — nadie puede editar su propio rastro.
-- ---------------------------------------------------------------------------
create or replace function audit_row() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_old  jsonb;
  v_new  jsonb;
  v_chg  text[];
begin
  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
  else
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    select array_agg(key order by key) into v_chg
    from jsonb_each(v_new)
    where value is distinct from v_old -> key;

    -- Guardar un cambio que no cambió nada sólo ensucia el historial.
    if v_chg is null then
      return null;
    end if;
  end if;

  -- El hash de la contraseña nunca se copia al log.
  v_old := v_old - 'password_hash';
  v_new := v_new - 'password_hash';

  insert into audit_log (actor_id, actor_email, action, table_name, row_id,
                         old_row, new_row, changed)
  values (
    nullif(claims ->> 'sub', '')::uuid,
    claims ->> 'email',
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    v_old, v_new, v_chg
  );

  return null;   -- trigger AFTER: el valor de retorno se ignora
end $$;

revoke execute on function audit_row() from public;

-- ---------------------------------------------------------------------------
-- Engancharlo a todas las tablas
--
-- `users` también se audita: un cambio de rol es de las cosas que más
-- interesa tener registradas. El hash se descarta arriba.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','refineries','buyers','purchase_agreements','truck_purchases',
    'refinery_movements','direct_sales','supplier_payments','refinery_payments',
    'buyer_payments','users'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function audit_row()',
      'audit_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Permisos: se lee, no se escribe
--
-- Sólo SELECT para los usuarios logueados. Nadie puede insertar, editar ni
-- borrar el log desde la aplicación: el único que escribe es el trigger, que
-- corre como dueño. Un rastro que el interesado puede editar no sirve de nada.
-- ---------------------------------------------------------------------------
alter table audit_log enable row level security;

create policy audit_log_select on audit_log for select
  using (app_role() in ('admin', 'user'));

grant select on audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Restaurar una fila borrada
--
-- Recibe el id del asiento de auditoría del borrado y vuelve a insertar la
-- fila tal como estaba. Deja constancia: la restauración se registra como un
-- alta nueva en el propio log.
--
-- No se le da permiso a nadie: se usa sólo desde el SQL Editor. Es una
-- función que puede escribir en cualquier tabla, así que no tiene por qué
-- estar al alcance del navegador.
-- ---------------------------------------------------------------------------
create or replace function audit_restore(p_audit_id bigint) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a    audit_log;
  cols text;
begin
  select * into a from audit_log where id = p_audit_id;
  if a.id is null then
    return format('No existe el asiento de auditoría %s.', p_audit_id);
  end if;
  if a.action <> 'delete' then
    return format('El asiento %s es un %s, no un borrado.', p_audit_id, a.action);
  end if;

  -- Las columnas calculadas (net_tons) y las de identidad no se escriben.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = a.table_name
    and is_generated = 'NEVER'
    and identity_generation is null;

  if cols is null then
    return format('La tabla %s ya no existe.', a.table_name);
  end if;

  execute format(
    'insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)',
    a.table_name, cols, cols, a.table_name
  ) using a.old_row;

  return format('Restaurada la fila %s en %s.', a.row_id, a.table_name);
end $$;

revoke execute on function audit_restore(bigint) from public;

commit;

-- Control: tienen que ser 11 triggers y el log arranca vacío.
select
  (select count(*) from pg_trigger where tgname like 'audit\_%' and not tgisinternal) as triggers,
  (select count(*) from audit_log) as asientos;
