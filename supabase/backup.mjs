/**
 * COPIA DE SEGURIDAD DE LA BASE
 *
 *   DB_URL="postgresql://..." node supabase/backup.mjs
 *
 * Se conecta directo a Postgres y baja todas las tablas a un JSON con la
 * fecha en el nombre. No usa el CLI de Supabase a propósito: `supabase db
 * dump` necesita Docker, que en esta máquina no está instalado.
 *
 * No incluye `users`: ahí están los hash de contraseña y no tienen por qué
 * andar dando vueltas en un archivo. Si hay que reconstruir todo, los
 * usuarios se recrean con nuevo_usuario.sql.
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const TABLAS = [
  "suppliers", "refineries", "buyers", "purchase_agreements", "truck_purchases",
  "refinery_movements", "direct_sales", "supplier_payments", "refinery_payments",
  "buyer_payments", "audit_log",
];

const url = process.env.DB_URL;
if (!url) {
  console.error(
    'Falta la cadena de conexión. Se usa así:\n\n' +
    '  DB_URL="postgresql://postgres.xxx:CONTRASEÑA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" \\\n' +
    "    node supabase/backup.mjs\n"
  );
  process.exit(1);
}

// El pooler de Supabase presenta un certificado que Node no valida por
// defecto. La conexión sigue siendo cifrada.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (e) {
  // Los errores de pg vienen con un stack enorme que no ayuda a nadie.
  const ayuda = {
    "28P01": "La contraseña no es correcta. Tres cosas para revisar:\n" +
             "  1. Que hayas reemplazado [YOUR-PASSWORD] CON los corchetes.\n" +
             "  2. Que no tenga @ # / : ? — rompen la cadena. Si los tiene,\n" +
             "     reseteala en Supabase y usá sólo letras y números.\n" +
             "  3. Que no se haya copiado con un espacio al final.",
    "3D000": "La base no existe: revisá que la cadena termine en /postgres",
    ENOTFOUND: "No se encontró el servidor: revisá el host de la cadena.",
    ETIMEDOUT: "Tiempo agotado. Si usaste 'Direct connection', cambiá a\n" +
               "  'Session pooler': la directa es IPv6 y tu red es IPv4.",
  }[e.code];
  console.error(`\nNo se pudo conectar (${e.code}).\n`);
  if (ayuda) console.error(ayuda + "\n");
  else console.error(e.message + "\n");
  process.exit(1);
}

const copia = { copiado_el: new Date().toISOString(), tablas: {} };
for (const t of TABLAS) {
  const { rows } = await client.query(`select * from ${t}`);
  copia.tablas[t] = rows;
  console.log(`  ${t.padEnd(22)} ${String(rows.length).padStart(5)} filas`);
}
await client.end();

const nombre = `backup-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(nombre, JSON.stringify(copia, null, 1));

const total = Object.values(copia.tablas).reduce((n, r) => n + r.length, 0);
console.log(`\n${nombre} — ${total} filas en ${TABLAS.length} tablas`);
