const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').find(l => l.startsWith('DATABASE_ADMIN_URL=')).split('=')[1].trim().replace(/['"]/g, '');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: env });

async function check() {
  try {
    const cols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'caja'");
    console.log('Columns:', cols.rows);

    const indexes = await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'caja'");
    console.log('Indexes:', indexes.rows);

    const constraints = await pool.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.caja'::regclass");
    console.log('Constraints:', constraints.rows);

    const rows = await pool.query("SELECT * FROM public.caja ORDER BY created_at DESC LIMIT 10");
    console.log('Rows in DB:', rows.rows);

    const schemaFile = fs.readFileSync('sql/01_schema.sql', 'utf8');
    const cajaDef = schemaFile.substring(schemaFile.indexOf('CREATE TABLE IF NOT EXISTS public.caja'), schemaFile.indexOf('CREATE TABLE IF NOT EXISTS public.caja') + 500);
    console.log('Schema definition in SQL file:', cajaDef);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

check();
