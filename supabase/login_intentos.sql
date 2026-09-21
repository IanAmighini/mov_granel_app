-- ============================================================================
-- FRENO AL LOGIN
--
-- Hoy se puede probar contraseñas sin límite: diez intentos seguidos, diez
-- rechazos, ningún bloqueo. Bcrypt con costo 12 hace lento el ataque, pero
-- nada lo detiene.
--
-- Se registran los intentos y, después de 5 fallidos en 15 minutos, la cuenta
-- queda bloqueada por 15 minutos más.
--
-- La tabla no se expone a nadie: la escribe y la lee sólo la Edge Function
-- de login, con la service_role key.
-- ============================================================================

begin;

create table login_attempts (
  id    bigint generated always as identity primary key,
  email text not null,
  ip    text,
  ok    boolean not null default false,
  at    timestamptz not null default now()
);

-- La consulta que corre en cada login: fallidos recientes de un mail.
create index on login_attempts (email, at desc) where not ok;
create index on login_attempts (at);

alter table login_attempts enable row level security;
-- Sin políticas y sin grants: para el navegador esta tabla no existe.

grant select, insert, delete on login_attempts to service_role;

commit;

-- Control: la tabla está y nadie del lado del navegador la puede tocar.
select
  (select count(*) from login_attempts) as intentos,
  (select count(*) from information_schema.role_table_grants
    where table_name = 'login_attempts' and grantee in ('anon', 'authenticated')
  ) as permisos_del_navegador;
