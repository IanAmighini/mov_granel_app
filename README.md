# Aceite a Granel

Gestión de compras de aceite crudo a granel, procesamiento por fasón en
refinerías y venta a compradores, con cuenta corriente de cada parte.

Es una aplicación interna de MRT. La usan dos personas.

## Cómo corre

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

Hace falta un `.env.local` con:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

La `anon key` es pública por diseño: viaja dentro del JavaScript que descarga
el navegador. Lo que protege los datos es RLS, no esa clave. **La
`service_role` key no va nunca en el frontend** — sólo dentro de las Edge
Functions.

## Cómo está armado

- **Vite + React + Tailwind**, con componentes de shadcn/ui.
- **Supabase** (Postgres) como base. El navegador habla directo con la Data
  API; no hay servidor propio.
- **Autenticación propia**, no la de Supabase: una Edge Function valida contra
  la tabla `users` y firma un JWT con el rol adentro. Las políticas de RLS
  leen ese rol, así que un usuario de lectura no puede escribir ni armando el
  pedido a mano.

### La base

Todo el SQL vive en `supabase/`, y se aplica en este orden sobre un proyecto
nuevo:

| archivo | qué hace |
|---|---|
| `schema.sql` | tablas, tipos, restricciones, RLS y permisos |
| `audit.sql` | registro de quién cambió qué, y `audit_restore()` |
| `login_intentos.sql` | freno al login tras 5 intentos fallidos |
| `estado_acuerdos.sql` | el estado de un acuerdo lo calcula la base |
| `nuevo_usuario.sql` | alta de usuarios (bcrypt dentro de Postgres) |

Y las herramientas:

| archivo | qué hace |
|---|---|
| `backup.mjs` | baja una copia de toda la base a un JSON |
| `import.py` | genera el SQL de importación desde la planilla vieja |
| `verify.py`, `check.py`, `verify_balances.py` | verifican que los saldos no se hayan movido |

Para bajar una copia:

```bash
DB_URL="postgresql://..." node supabase/backup.mjs
```

La cadena sale del botón **Connect** del panel de Supabase, eligiendo
**Session pooler** (la conexión directa es IPv6). El CLI de Supabase no sirve
acá: `supabase db dump` necesita Docker.

## Convenciones

**No se escriben colores a mano.** Nada de `bg-white` ni `text-slate-500`:
todo va por los tokens del tema (`bg-card`, `text-muted-foreground`,
`border-border`). Los números tienen los suyos: `text-debe`, `text-haber`,
`text-aviso`. Una sola clase fija rompe el modo oscuro en ese punto sin que
nada avise. La paleta vive en `src/index.css`.

**El modo oscuro sigue al navegador** (`prefers-color-scheme`). No hay
interruptor en la app.

**Los importes se calculan en un solo lugar**, `src/lib/oilUtils.js`. Las
pantallas presentan, no recalculan. `src/lib/ledger.js` arma la cuenta
corriente a partir de eso.

**Lo que se puede derivar, lo deriva la base.** El estado de un acuerdo y el
neto de una compra salen de la base, no del frontend: cuando lo mismo se
calculaba en varios lugares, tarde o temprano uno quedó desactualizado.

## Deuda conocida

`src/api/db.js` tiene una capa que traduce nombres de campo viejos
(`destination`, `is_initial_balance`, `party_id`) a los del esquema nuevo. Se
puso para que la migración desde Google Sheets no tocara las pantallas al
mismo tiempo que la base. Cuando se renombren esos campos en las pantallas, se
borra ese bloque y también `src/api/sheetsClient.js`, que hoy sólo re-exporta.
