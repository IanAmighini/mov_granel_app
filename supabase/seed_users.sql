-- ============================================================================
-- ALTA DE USUARIOS
--
-- 1. Reemplazá los dos ...PONER... por contraseñas NUEVAS.
--    NO uses las que estaban en el Apps Script (osky374374 / Aceite$2026):
--    quedaron expuestas en el código fuente.
-- 2. Seleccioná TODO y dale Run.
-- 3. Cuando termine, borrá las contraseñas de este archivo.
--
-- Se puede correr varias veces: si el usuario ya existe, le actualiza la
-- contraseña en vez de fallar por email repetido.
-- ============================================================================

insert into users (email, name, role, password_hash, is_active) values
  ('ianamighini@gmail.com', 'Ian',      'admin',
      crypt('...PONER_CONTRASEÑA_DE_IAN...', gen_salt('bf', 12)), true),
  ('cristian@amighini.net', 'Cristian', 'user',
      crypt('...PONER_CONTRASEÑA_DE_CRISTIAN...', gen_salt('bf', 12)), true)
on conflict (email) do update
  set password_hash = excluded.password_hash,
      role          = excluded.role,
      name          = excluded.name,
      is_active     = true;

-- Control automático: tienen que salir 2 filas, ambas en 'ok'.
select
  email,
  role,
  is_active,
  case
    when left(password_hash,4) in ('$2a$','$2b$','$2y$') and length(password_hash) = 60
      then 'ok'
    else '*** el hash no es bcrypt ***'
  end as hash,
  case
    when password_hash = crypt('...PONER_CONTRASEÑA_DE_IAN...', password_hash)
      or password_hash = crypt('...PONER_CONTRASEÑA_DE_CRISTIAN...', password_hash)
      then 'verificada'
    else '*** no verifica ***'
  end as prueba
from users
order by role;
