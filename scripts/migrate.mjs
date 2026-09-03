import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;

if (!appUrl) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

async function main() {
  console.log("Conectando con credenciales administrativas para aplicar migración...");
  const dbUrl = new URL(appUrl);
  if (adminUrl) {
    const adminCredentials = new URL(adminUrl);
    dbUrl.username = adminCredentials.username;
    dbUrl.password = adminCredentials.password;
  }
  
  const client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();

  console.log("Ejecutando ALTER TABLE en pedidos...");
  await client.query(`
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS notas TEXT;
  `);

  console.log("Ejecutando ALTER TABLE en usuarios...");
  await client.query(`
    ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  console.log("Ejecutando ALTER TABLE y CONSTRAINT en pedidos...");
  await client.query(`
    ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_metodo_pago_check CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'mixto') OR metodo_pago IS NULL);
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_efectivo NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_tarjeta NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS vuelto NUMERIC(10,2) DEFAULT 0;

    ALTER TABLE public.detalle_pedidos DROP CONSTRAINT IF EXISTS detalle_pedidos_estado_cocina_check;

    UPDATE public.detalle_pedidos
    SET estado_cocina = 'no_entregado'
    WHERE estado_cocina NOT IN ('borrador', 'pendiente', 'preparacion', 'entregado', 'no_entregado', 'anulado');

    ALTER TABLE public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_estado_cocina_check 
      CHECK (estado_cocina IN ('borrador', 'pendiente', 'preparacion', 'entregado', 'no_entregado', 'anulado'));
  `);

  console.log("Creando tabla ajustes...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.ajustes (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);

  console.log("Insertando valores iniciales para ajustes...");
  await client.query(`
    INSERT INTO public.ajustes (clave, valor) VALUES
      ('nombre_restaurante', 'La Pupusa'),
      ('logo_url', '')
    ON CONFLICT (clave) DO NOTHING;
  `);

  console.log("Configurando RLS y políticas en ajustes...");
  await client.query(`
    ALTER TABLE public.ajustes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.ajustes FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`
    DROP POLICY IF EXISTS ajustes_select ON public.ajustes;
    CREATE POLICY ajustes_select ON public.ajustes FOR SELECT
      USING (true);
  `);

  await client.query(`
    DROP POLICY IF EXISTS ajustes_write ON public.ajustes;
    CREATE POLICY ajustes_write ON public.ajustes FOR ALL
      USING (public.current_app_role() IN ('superadmin', 'admin', 'gerente'))
      WITH CHECK (public.current_app_role() IN ('superadmin', 'admin', 'gerente'));
  `);

  console.log("Otorgando permisos a pupuseria_app y pupuseria_prod...");
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pupuseria_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes TO pupuseria_app;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pupuseria_prod') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes TO pupuseria_prod;
      END IF;
    END $$;
  `);

  console.log("Actualizando función protect_detalle_pendiente...");
  await client.query(`
    CREATE OR REPLACE FUNCTION public.protect_detalle_pendiente()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      v_role TEXT := public.current_app_role();
    BEGIN
      IF v_role IN ('superadmin', 'admin') OR current_setting('app.bypass_triggers', true) = 'true' THEN
        RETURN COALESCE(NEW, OLD);
      END IF;

      IF TG_OP = 'DELETE' THEN
        IF OLD.estado_cocina NOT IN ('borrador', 'pendiente') THEN
          RAISE EXCEPTION 'Solo se pueden eliminar productos antes de que comiencen a prepararse' USING ERRCODE = 'P0002';
        END IF;
        RETURN OLD;
      END IF;

      IF TG_OP = 'UPDATE' THEN
        IF NEW.estado_cocina IS DISTINCT FROM OLD.estado_cocina THEN
          IF OLD.estado_cocina = 'borrador' AND NEW.estado_cocina <> 'pendiente' THEN
            RAISE EXCEPTION 'De Borrador solo se puede enviar a Cocina' USING ERRCODE = 'P0002';
          END IF;
          IF OLD.estado_cocina = 'pendiente' AND NEW.estado_cocina <> 'preparacion' THEN
            RAISE EXCEPTION 'De Pendiente solo se puede pasar a En preparación' USING ERRCODE = 'P0002';
          END IF;
          IF OLD.estado_cocina = 'preparacion' AND NEW.estado_cocina <> 'entregado' THEN
            RAISE EXCEPTION 'De En preparación solo se puede pasar a Entregado' USING ERRCODE = 'P0002';
          END IF;
          IF OLD.estado_cocina = 'entregado' THEN
            RAISE EXCEPTION 'Un producto entregado no cambia de estado' USING ERRCODE = 'P0002';
          END IF;
        END IF;
        IF (NEW.id_producto IS DISTINCT FROM OLD.id_producto
            OR NEW.variante IS DISTINCT FROM OLD.variante
            OR NEW.notas IS DISTINCT FROM OLD.notas
            OR NEW.destino_servicio IS DISTINCT FROM OLD.destino_servicio)
           AND OLD.estado_cocina NOT IN ('borrador', 'pendiente') THEN
          RAISE EXCEPTION 'No se puede editar un platillo que ya fue enviado a cocina' USING ERRCODE = 'P0002';
        END IF;

        IF NEW.cantidad IS DISTINCT FROM OLD.cantidad
           AND OLD.estado_cocina NOT IN ('borrador', 'pendiente')
           AND NEW.cantidad >= OLD.cantidad THEN
          RAISE EXCEPTION 'Un platillo enviado solo puede disminuirse al separar una parte en cocina'
            USING ERRCODE = 'P0002';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;
  `);

  console.log("Actualizando política detalle_insert para permitir split a cocineros...");
  await client.query(`
    DROP POLICY IF EXISTS detalle_insert ON public.detalle_pedidos;
    CREATE POLICY detalle_insert ON public.detalle_pedidos FOR INSERT
      WITH CHECK (
        public.current_app_role() IN ('superadmin', 'admin', 'gerente', 'cocinero', 'mesero', 'cajero')
        AND EXISTS (
          SELECT 1 FROM public.pedidos p
          WHERE p.id = id_pedido AND p.estado_pago = 'pendiente'
        )
      );
  `);

  console.log("Actualizando política detalle_delete para permitir deduplicación a cocineros...");
  await client.query(`
    DROP POLICY IF EXISTS detalle_delete ON public.detalle_pedidos;
    CREATE POLICY detalle_delete ON public.detalle_pedidos FOR DELETE
      USING (public.current_app_role() IN ('superadmin', 'admin', 'gerente', 'cocinero', 'mesero', 'cajero'));
  `);

  console.log("Actualizando función validate_cobro...");
  await client.query(`
    CREATE OR REPLACE FUNCTION public.validate_cobro()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      pending INT;
    BEGIN
      IF NEW.estado_pago = 'pagada' AND OLD.estado_pago <> 'pagada' THEN
        SELECT COUNT(*) INTO pending
        FROM public.detalle_pedidos
        WHERE id_pedido = NEW.id AND estado_cocina NOT IN ('entregado', 'no_entregado', 'anulado', 'cancelado');
        IF pending > 0 THEN
          RAISE EXCEPTION 'No se puede cobrar: hay % producto(s) sin entregar o cancelar', pending
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;
  `);

  console.log("Actualizando función recalculate_pedido_total...");
  await client.query(`
    CREATE OR REPLACE FUNCTION public.recalculate_pedido_total()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      v_id UUID;
    BEGIN
      v_id := COALESCE(NEW.id_pedido, OLD.id_pedido);
      UPDATE public.pedidos
      SET total = (
        SELECT COALESCE(SUM(precio_unitario * cantidad), 0)
        FROM public.detalle_pedidos
        WHERE id_pedido = v_id AND estado_cocina NOT IN ('no_entregado', 'anulado', 'cancelado')
      )
      WHERE id = v_id;
      RETURN COALESCE(NEW, OLD);
    END;
    $$;
  `);

  console.log("Actualizando constraint de detalle_pedidos...");
  await client.query(`
    ALTER TABLE public.detalle_pedidos DROP CONSTRAINT IF EXISTS detalle_pedidos_estado_cocina_check;
    ALTER TABLE public.detalle_pedidos ADD CONSTRAINT detalle_pedidos_estado_cocina_check
      CHECK (estado_cocina IN ('borrador', 'pendiente', 'preparacion', 'entregado', 'no_entregado', 'anulado', 'cancelado'));
  `);

  console.log("Configurando RLS y políticas en mesas...");
  await client.query(`
    DROP POLICY IF EXISTS mesas_insert ON public.mesas;
    CREATE POLICY mesas_insert ON public.mesas FOR INSERT
      WITH CHECK (public.current_app_role() IN ('superadmin', 'admin', 'gerente', 'mesero', 'cajero'));
  `);

  await client.end();
  console.log("Migración completada con éxito.");
}

main().catch((err) => {
  console.error("Error en migración:", err.message);
  process.exit(1);
});
