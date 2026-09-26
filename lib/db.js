// lib/db.js
import { neon } from '@neondatabase/serverless';

let neonSql = null;

function getSql() {
  if (!neonSql) {
    neonSql = neon(process.env.DATABASE_URL);
  }
  return neonSql;
}

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (Array.isArray(val)) {
    return `ARRAY[${val.map(v => escapeValue(v)).join(',')}]::text[]`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

export default {
  query: async (text, params) => {
    const sql = getSql();
    const finalText = text.replace(/\$(\d+)/g, (_, num) => {
      const idx = parseInt(num, 10) - 1;
      return escapeValue((params || [])[idx]);
    });
    const result = await sql.query(finalText);
    return { rows: result };
  },
  end: async () => {},
};