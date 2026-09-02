const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8')
  .split('\n')
  .find(l => l.startsWith('DATABASE_ADMIN_URL='))
  .split('=')[1]
  .trim()
  .replace(/['"]/g, '');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: env
});

async function run() {
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.validate_cobro()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE
        pending INT;
      BEGIN
        IF NEW.estado_pago = 'pagada' AND OLD.estado_pago <> 'pagada' THEN
          SELECT COUNT(*) INTO pending
          FROM public.detalle_pedidos
          WHERE id_pedido = NEW.id AND estado_cocina NOT IN ('entregado', 'no_entregado');
          IF pending > 0 THEN
            RAISE EXCEPTION 'No se puede cobrar: hay % producto(s) sin entregar', pending
              USING ERRCODE = 'P0001';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    console.log('Trigger validate_cobro updated successfully');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

run();
