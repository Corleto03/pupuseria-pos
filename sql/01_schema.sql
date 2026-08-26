-- ============================================================
-- PUPUSERÍA POS — PostgreSQL local (sin Supabase)
-- Tiempo real: LISTEN / NOTIFY  (canal: pos_events)
-- Seguridad: RLS + FORCE + rol de aplicación no-superuser
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- ROL DE APLICACIÓN (no es superuser → RLS aplica)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pupuseria_app') THEN
    CREATE ROLE pupuseria_app LOGIN PASSWORD 'pupuseria_app';
  END IF;
END
$$;

-- ─────────────────────────────────────────────
-- TABLAS
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL CHECK (rol IN ('gerente', 'mesero', 'cocinero', 'cajero')),
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mesas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero     INT NOT NULL UNIQUE,
  estado     TEXT NOT NULL DEFAULT 'disponible'
               CHECK (estado IN ('disponible', 'ocupada')),
  capacidad  INT NOT NULL DEFAULT 4 CHECK (capacidad > 0)
);

CREATE TABLE IF NOT EXISTS public.productos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  categoria     TEXT NOT NULL CHECK (categoria IN ('pupusa', 'bebida', 'extra')),
  precio        NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  especialidad  TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS public.pedidos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_mesa         UUID REFERENCES public.mesas(id) ON DELETE RESTRICT,
  id_usuario      UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  nombre_control  TEXT NOT NULL,
  tipo_pedido     TEXT NOT NULL CHECK (tipo_pedido IN ('local', 'llevar')),
  estado_pago     TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado_pago IN ('pendiente', 'pagada', 'cancelada')),
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_pago      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pedidos_mesa_si_local CHECK (
    (tipo_pedido = 'local' AND id_mesa IS NOT NULL)
    OR (tipo_pedido = 'llevar' AND id_mesa IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.detalle_pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pedido      UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  id_producto    UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad       INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  -- Borrador no llega a cocina hasta que el mesero lo envía expresamente.
  estado_cocina  TEXT NOT NULL DEFAULT 'borrador'
                   CHECK (estado_cocina IN ('borrador', 'pendiente', 'preparacion', 'entregado')),
  destino_servicio TEXT NOT NULL DEFAULT 'local'
                   CHECK (destino_servicio IN ('local', 'llevar')),
  notas          TEXT,
  variante       TEXT,
  precio_unitario NUMERIC(10,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_pago ON public.pedidos(estado_pago);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa ON public.pedidos(id_mesa);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON public.pedidos(fecha);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON public.detalle_pedidos(id_pedido);
CREATE INDEX IF NOT EXISTS idx_detalle_estado ON public.detalle_pedidos(estado_cocina);

-- Migración segura para instalaciones creadas con la versión inicial.
ALTER TABLE public.detalle_pedidos ADD COLUMN IF NOT EXISTS destino_servicio TEXT;
UPDATE public.detalle_pedidos d
SET destino_servicio = p.tipo_pedido
FROM public.pedidos p
WHERE p.id = d.id_pedido AND d.destino_servicio IS NULL;
ALTER TABLE public.detalle_pedidos
  ALTER COLUMN estado_cocina SET DEFAULT 'borrador',
  ALTER COLUMN destino_servicio SET DEFAULT 'local',
  ALTER COLUMN destino_servicio SET NOT NULL;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ;
ALTER TABLE public.detalle_pedidos DROP CONSTRAINT IF EXISTS detalle_pedidos_estado_cocina_check;
ALTER TABLE public.detalle_pedidos
  ADD CONSTRAINT detalle_pedidos_estado_cocina_check
  CHECK (estado_cocina IN ('borrador', 'pendiente', 'preparacion', 'entregado'));
ALTER TABLE public.detalle_pedidos DROP CONSTRAINT IF EXISTS detalle_pedidos_destino_servicio_check;
ALTER TABLE public.detalle_pedidos
  ADD CONSTRAINT detalle_pedidos_destino_servicio_check
  CHECK (destino_servicio IN ('local', 'llevar'));
CREATE INDEX IF NOT EXISTS idx_detalle_destino ON public.detalle_pedidos(destino_servicio);
CREATE INDEX IF NOT EXISTS idx_productos_cat ON public.productos(categoria);

-- Una mesa = un pedido abierto (bloqueo real en BD)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mesa_un_pedido_abierto
  ON public.pedidos (id_mesa)
  WHERE id_mesa IS NOT NULL
    AND estado_pago = 'pendiente'
    AND tipo_pedido = 'local';

-- ─────────────────────────────────────────────
-- SESIÓN DE APP (para RLS)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT public.current_app_role() IN ('gerente', 'mesero', 'cocinero', 'cajero');
$$;

-- Login sin exponer hashes por SELECT abierto
CREATE OR REPLACE FUNCTION public.login_lookup(p_email TEXT)
RETURNS TABLE (
  id UUID, email TEXT, password_hash TEXT, nombre TEXT, rol TEXT, activo BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.password_hash, u.nombre, u.rol, u.activo
  FROM public.usuarios u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────
-- TRIGGERS DE NEGOCIO
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_updated ON public.pedidos;
CREATE TRIGGER trg_pedidos_updated
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_detalle_updated ON public.detalle_pedidos;
CREATE TRIGGER trg_detalle_updated
  BEFORE UPDATE ON public.detalle_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
    WHERE id_pedido = v_id
  )
  WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_total ON public.detalle_pedidos;
CREATE TRIGGER trg_recalc_total
  AFTER INSERT OR UPDATE OR DELETE ON public.detalle_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_pedido_total();

CREATE OR REPLACE FUNCTION public.sync_mesa_estado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tipo_pedido = 'local' AND NEW.id_mesa IS NOT NULL THEN
    UPDATE public.mesas SET estado = 'ocupada' WHERE id = NEW.id_mesa;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.id_mesa IS NOT NULL AND (
      NEW.estado_pago IN ('pagada', 'cancelada')
      OR NEW.id_mesa IS DISTINCT FROM OLD.id_mesa
    ) THEN
      UPDATE public.mesas SET estado = 'disponible' WHERE id = OLD.id_mesa
        AND NOT EXISTS (
          SELECT 1 FROM public.pedidos p
          WHERE p.id_mesa = OLD.id_mesa
            AND p.estado_pago = 'pendiente'
            AND p.id <> NEW.id
        );
    END IF;
    IF NEW.tipo_pedido = 'local' AND NEW.id_mesa IS NOT NULL AND NEW.estado_pago = 'pendiente' THEN
      UPDATE public.mesas SET estado = 'ocupada' WHERE id = NEW.id_mesa;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mesa ON public.pedidos;
CREATE TRIGGER trg_sync_mesa
  AFTER INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.sync_mesa_estado();

CREATE OR REPLACE FUNCTION public.protect_detalle_pendiente()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado_cocina NOT IN ('borrador', 'pendiente') THEN
      RAISE EXCEPTION 'Solo se pueden eliminar productos antes de que comiencen a prepararse'
        USING ERRCODE = 'P0002';
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
        OR NEW.notas IS DISTINCT FROM OLD.notas)
       AND OLD.estado_cocina NOT IN ('borrador', 'pendiente') THEN
      RAISE EXCEPTION 'Solo se pueden modificar platillos antes de que comiencen a prepararse'
        USING ERRCODE = 'P0002';
    END IF;
    -- Cocina puede separar una parte para avanzar su estado; nunca aumentar ni
    -- editar directamente un ítem ya enviado.
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

DROP TRIGGER IF EXISTS trg_protect_detalle ON public.detalle_pedidos;
CREATE TRIGGER trg_protect_detalle
  BEFORE UPDATE OR DELETE ON public.detalle_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.protect_detalle_pendiente();

CREATE OR REPLACE FUNCTION public.validate_cobro()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  pending INT;
BEGIN
  IF NEW.estado_pago = 'pagada' AND OLD.estado_pago <> 'pagada' THEN
    SELECT COUNT(*) INTO pending
    FROM public.detalle_pedidos
    WHERE id_pedido = NEW.id AND estado_cocina <> 'entregado';
    IF pending > 0 THEN
      RAISE EXCEPTION 'No se puede cobrar: hay % producto(s) sin entregar', pending
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cobro ON public.pedidos;
CREATE TRIGGER trg_validate_cobro
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.validate_cobro();

CREATE OR REPLACE FUNCTION public.abrir_pedido(
  p_tipo TEXT,
  p_nombre TEXT,
  p_mesa UUID,
  p_usuario UUID
) RETURNS public.pedidos
LANGUAGE plpgsql
AS $$
DECLARE
  v_mesa public.mesas%ROWTYPE;
  v_ped public.pedidos%ROWTYPE;
BEGIN
  IF btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre de control es obligatorio' USING ERRCODE = 'P0001';
  END IF;

  IF p_tipo = 'local' THEN
    IF p_mesa IS NULL THEN
      RAISE EXCEPTION 'Debe elegir una mesa' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_mesa FROM public.mesas WHERE id = p_mesa FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mesa no existe' USING ERRCODE = 'P0001';
    END IF;
    IF v_mesa.estado <> 'disponible' THEN
      RAISE EXCEPTION 'La mesa % ya está ocupada', v_mesa.numero USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.pedidos (id_mesa, id_usuario, nombre_control, tipo_pedido)
  VALUES (
    CASE WHEN p_tipo = 'local' THEN p_mesa ELSE NULL END,
    p_usuario,
    btrim(p_nombre),
    p_tipo
  )
  RETURNING * INTO v_ped;

  RETURN v_ped;
END;
$$;

-- ─────────────────────────────────────────────
-- TIEMPO REAL (LISTEN pos_events)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_pos_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
  v_pedido UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    IF TG_TABLE_NAME = 'detalle_pedidos' THEN
      v_pedido := OLD.id_pedido;
    ELSIF TG_TABLE_NAME = 'pedidos' THEN
      v_pedido := OLD.id;
    END IF;
  ELSE
    v_id := NEW.id;
    IF TG_TABLE_NAME = 'detalle_pedidos' THEN
      v_pedido := NEW.id_pedido;
    ELSIF TG_TABLE_NAME = 'pedidos' THEN
      v_pedido := NEW.id;
    END IF;
  END IF;

  PERFORM pg_notify(
    'pos_events',
    json_build_object(
      'table', TG_TABLE_NAME,
      'op', TG_OP,
      'id', v_id,
      'id_pedido', v_pedido,
      'ts', EXTRACT(EPOCH FROM NOW())
    )::TEXT
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rt_mesas ON public.mesas;
CREATE TRIGGER trg_rt_mesas
  AFTER INSERT OR UPDATE OR DELETE ON public.mesas
  FOR EACH ROW EXECUTE FUNCTION public.notify_pos_event();

DROP TRIGGER IF EXISTS trg_rt_pedidos ON public.pedidos;
CREATE TRIGGER trg_rt_pedidos
  AFTER INSERT OR UPDATE OR DELETE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.notify_pos_event();

DROP TRIGGER IF EXISTS trg_rt_detalle ON public.detalle_pedidos;
CREATE TRIGGER trg_rt_detalle
  AFTER INSERT OR UPDATE OR DELETE ON public.detalle_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.notify_pos_event();

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_pedidos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usuarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mesas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.productos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_pedidos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT
  USING (
    id = public.current_app_user_id()
    OR public.current_app_role() = 'gerente'
  );

DROP POLICY IF EXISTS usuarios_write_gerente ON public.usuarios;
CREATE POLICY usuarios_write_gerente ON public.usuarios FOR ALL
  USING (public.current_app_role() = 'gerente')
  WITH CHECK (public.current_app_role() = 'gerente');

DROP POLICY IF EXISTS mesas_select ON public.mesas;
CREATE POLICY mesas_select ON public.mesas FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS mesas_write ON public.mesas;
CREATE POLICY mesas_write ON public.mesas FOR UPDATE
  USING (public.current_app_role() IN ('gerente', 'mesero', 'cajero'));

DROP POLICY IF EXISTS productos_select ON public.productos;
CREATE POLICY productos_select ON public.productos FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS productos_write ON public.productos;
CREATE POLICY productos_write ON public.productos FOR ALL
  USING (public.current_app_role() = 'gerente')
  WITH CHECK (public.current_app_role() = 'gerente');

DROP POLICY IF EXISTS pedidos_select ON public.pedidos;
CREATE POLICY pedidos_select ON public.pedidos FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
CREATE POLICY pedidos_insert ON public.pedidos FOR INSERT
  WITH CHECK (
    public.current_app_role() IN ('gerente', 'mesero', 'cajero')
    AND id_usuario = public.current_app_user_id()
  );

DROP POLICY IF EXISTS pedidos_update ON public.pedidos;
CREATE POLICY pedidos_update ON public.pedidos FOR UPDATE
  USING (public.current_app_role() IN ('gerente', 'mesero', 'cajero'));

DROP POLICY IF EXISTS detalle_select ON public.detalle_pedidos;
CREATE POLICY detalle_select ON public.detalle_pedidos FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS detalle_insert ON public.detalle_pedidos;
CREATE POLICY detalle_insert ON public.detalle_pedidos FOR INSERT
  WITH CHECK (
    public.current_app_role() IN ('gerente', 'mesero', 'cajero')
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = id_pedido AND p.estado_pago = 'pendiente'
    )
  );

DROP POLICY IF EXISTS detalle_update ON public.detalle_pedidos;
CREATE POLICY detalle_update ON public.detalle_pedidos FOR UPDATE
  USING (
    public.current_app_role() IN ('gerente', 'cocinero', 'mesero', 'cajero')
  );

DROP POLICY IF EXISTS detalle_delete ON public.detalle_pedidos;
CREATE POLICY detalle_delete ON public.detalle_pedidos FOR DELETE
  USING (public.current_app_role() IN ('gerente', 'mesero', 'cajero'));

-- ─────────────────────────────────────────────
-- PERMISOS
-- ─────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO pupuseria_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO pupuseria_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pupuseria_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pupuseria_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pupuseria_app;
GRANT EXECUTE ON FUNCTION public.login_lookup(TEXT) TO pupuseria_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pupuseria_app;

-- ─────────────────────────────────────────────
-- SEED
-- ─────────────────────────────────────────────
INSERT INTO public.mesas (numero, capacidad)
SELECT g, CASE WHEN g <= 8 THEN 4 ELSE 6 END
FROM generate_series(1, 12) AS g
ON CONFLICT (numero) DO NOTHING;

INSERT INTO public.productos (nombre, categoria, precio, especialidad, sort_order) VALUES
  ('Pupusa de Queso',          'pupusa', 0.75, 'Queso', 1),
  ('Pupusa de Frijol',         'pupusa', 0.75, 'Frijol', 2),
  ('Pupusa Revuelta',          'pupusa', 0.85, 'Revuelta', 3),
  ('Pupusa de Chicharrón',     'pupusa', 0.85, 'Chicharrón', 4),
  ('Pupusa de Queso con Loroco','pupusa', 0.95, 'Queso con Loroco', 5),
  ('Pupusa de Ayote',          'pupusa', 0.85, 'Ayote', 6),
  ('Pupusa de Chipilín',       'pupusa', 0.85, 'Chipilín', 7),
  ('Pupusa de Frijol con Queso','pupusa', 0.85, 'Frijol con Queso', 8),
  ('Café',                     'bebida', 0.75, NULL, 20),
  ('Chocolate',                'bebida', 1.00, NULL, 21),
  ('Horchata',                 'bebida', 1.25, NULL, 22),
  ('Kolashampan',              'bebida', 1.00, NULL, 23),
  ('Agua',                     'bebida', 0.50, NULL, 24),
  ('Ensalada de curtido',      'extra',  0.00, NULL, 30)
ON CONFLICT DO NOTHING;

-- Contraseñas: gerente123 / mesero123 / cocina123 / caja123
INSERT INTO public.usuarios (email, password_hash, nombre, rol) VALUES
  ('gerente@pupuseria.local', '$2b$10$PXJai04BdNHtfQEz5fDjBeJStMrMf1GKPjLuCydJdflEVKZKQXxta', 'Ana Gerente', 'gerente'),
  ('mesero@pupuseria.local',  '$2b$10$MZSf39LBBdpCL.Q8GBW4luCexeK3VdqsPJktX7UKIBQbZ1O18Vzyy', 'Luis Mesero', 'mesero'),
  ('cocina@pupuseria.local',  '$2b$10$5YnA5okjl9wzYVvkO5eS8eRM.I6RuV9z2V7SpOHAnkdRnbxlXywC.', 'Rosa Cocina', 'cocinero'),
  ('caja@pupuseria.local',    '$2b$10$zWciIK8Fehhlb2ZDB62Fqed/DQ2hBhC/LFUHDLUmpX.zrEgOHdHKi', 'Mario Caja', 'cajero')
ON CONFLICT (email) DO NOTHING;
