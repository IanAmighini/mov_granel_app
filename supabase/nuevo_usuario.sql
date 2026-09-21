-- ============================================================================
-- ALTA DE UN USUARIO
--
-- Reemplazá los tres marcadores y corré todo junto.
--
-- Tres cosas antes:
--   - Usá una contraseña sin acentos ni ñ. Son dos implementaciones distintas
--     de bcrypt las que la escriben y la verifican, y con caracteres fuera del
--     ASCII no vale la pena arriesgarse.
--   - La contraseña se hashea dentro de Postgres: en texto plano sólo viaja
--     en esta consulta y no queda guardada en ningún lado.
--   - Cuando termines, borrá la contraseña de este archivo.
--
-- Se puede correr de nuevo: si el mail ya existe, le cambia la contraseña en
-- lugar de fallar. Eso mismo sirve para rotar una contraseña más adelante.
-- ============================================================================

insert into users (email, name, role, password_hash, is_active) values (
  '...MAIL_DEL_NUEVO...',          -- ej: cristian@amighini.net
  '...NOMBRE...',                  -- ej: Cristian
  'admin',
  crypt('...CONTRASENA...', gen_salt('bf', 12)),
  true
)
on conflict (email) do update
  set password_hash = excluded.password_hash,
      role          = excluded.role,
      name          = excluded.name,
      is_active     = true;

-- Control: los hashes tienen que medir 60 y empezar en $2a$12$.
select
  email,
  name,
  role,
  is_active,
  case when left(password_hash, 4) in ('$2a$', '$2b$', '$2y$')
            and length(password_hash) = 60
       then 'ok' else '*** revisar ***' end as hash,
  to_char(created_at at time zone 'America/Argentina/Buenos_Aires',
          'DD/MM/YYYY HH24:MI') as creado
from users
order by role, email;
