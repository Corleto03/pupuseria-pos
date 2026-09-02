const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').find(l => l.startsWith('DATABASE_ADMIN_URL=')).split('=')[1].trim().replace(/['"]/g, '');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: env });

async function cleanup() {
  try {
    // Delete or close unclosed boxes that are older than closed boxes on the same day
    const res = await pool.query("DELETE FROM public.caja WHERE cierre IS NULL AND fecha = CURRENT_DATE");
    console.log('Cleaned up orphan rows:', res.rowCount);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

cleanup();
