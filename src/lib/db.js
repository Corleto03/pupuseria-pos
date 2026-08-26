import pg from "pg";

const { Pool } = pg;

const globalForPg = globalThis;

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function withUser(user, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.role', $1, true), set_config('app.user_id', $2, true)", [
      user.rol,
      user.id,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export function pgError(err) {
  const map = {
    P0001: err.message,
    P0002: err.message,
    "23505": "La mesa ya tiene un pedido abierto.",
  };
  return map[err.code] || err.message || "Error de base de datos";
}
