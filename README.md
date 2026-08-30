# La Pupusa — POS local

Sistema de punto de venta y cocina para **un restaurante** (pupusería). No usa Supabase: PostgreSQL en tu máquina, Next.js y tiempo real con `LISTEN/NOTIFY`.

Carpeta: `C:\Users\50374\Downloads\pupuseria-pos`

## Requisitos

- Node 20+
- PostgreSQL 16 (local o Docker)

## Arranque

### 1. Base de datos

Con Docker (desde esta carpeta):

```bash
docker compose up -d
npm run db:setup
```

Sin Docker, crea la base `pupuseria`, configura tus variables privadas en `.env.local` y corre `npm run db:setup`.

El script aplica `sql/01_schema.sql`: tablas, bloqueo de mesa, cobro, RLS, auditoría y notificaciones en vivo. Antes, configura las credenciales privadas y las cuentas iniciales `BOOTSTRAP_SUPERADMIN_*` y `BOOTSTRAP_ADMIN_*` a partir de `.env.example`.

### 2. App

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Usuarios

Las cuentas deben crearse o cambiarse mediante un procedimiento administrativo seguro. No se documentan credenciales en el repositorio.

## Módulos

- **Mesas** — verde disponible / rojo ocupada. Al abrir: nombre de control. Una mesa = un pedido abierto (índice único + `FOR UPDATE`).
- **Toma de orden** — pupusas por especialidad y masa (maíz/arroz), bebidas y destino por ítem. Los ítems se crean como **borrador**: se pueden ajustar o quitar hasta pulsar **Enviar nuevos platillos a cocina**. Mientras estén **Pendientes** en cocina (sin iniciar), todavía se pueden corregir o quitar; los cambios se reflejan automáticamente en Cocina. Una mesa puede combinar comer aquí y para llevar.
- **Cocina** — tablero táctil Pendiente → En preparación → Entregado, más una columna de entregados pendientes de cobro. Los entregados solo desaparecen al cobrar la orden.
- **Caja** — monitor de mesas + comer aquí / para llevar + cobro (también desde la mesa).
- **Reportes** — ventas día/semana/mes, más vendidos, exportar CSV.
- **Menú** — alta de productos (gerente).

## Tiempo real (sin Supabase)

Triggers en `mesas`, `pedidos` y `detalle_pedidos` hacen `NOTIFY pos_events`. La app abre un canal SSE en `/api/realtime`.

## Seguridad

- JWT en cookie httpOnly
- Rol de app `pupuseria_app` (no superuser)
- RLS + `FORCE ROW LEVEL SECURITY`
- Sesión por transacción: `app.role` y `app.user_id`
- El cobro y el candado de mesa están en PostgreSQL, no solo en la UI

`JWT_SECRET`, `DATABASE_URL` y cualquier contraseña deben configurarse únicamente como variables privadas del entorno. Nunca las publiques en el repositorio.

## Railway

El servicio es **Next.js (Node)**, no una app de escritorio. Variables mínimas:

- `DATABASE_URL` — Postgres de Railway
- `JWT_SECRET` — secreto largo

Build: `npm run build` · Start: `npm start` · Provider: Node (`nixpacks.toml`).
