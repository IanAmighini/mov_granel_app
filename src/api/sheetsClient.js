/**
 * El backend dejó de ser Google Sheets: ahora es Supabase (ver src/api/db.js).
 *
 * Este archivo queda como puente para no tocar los 17 imports en el mismo
 * cambio que la migración. Cuando se renombren los campos en las pantallas,
 * se renombra también el import y este archivo se borra.
 */
export { db as sheetsClient, supabase } from "./db";
