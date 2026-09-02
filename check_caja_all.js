const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').find(l => l.startsWith('DATABASE_ADMIN_URL=')).split('=')[1].trim().replace(/['"]/g, '');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: env });

async function checkAll() {
  try {
    const rows = await pool.query("SELECT * FROM public.caja ORDER BY created_at ASC");
    console.log('All Rows in DB:', rows.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

checkAll();
