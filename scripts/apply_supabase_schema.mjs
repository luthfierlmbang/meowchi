import fs from 'node:fs/promises';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(connectionString, { ssl: 'require' });
const schema = await fs.readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

try {
  await sql.unsafe(schema);
  const rows = await sql`
    select
      c.relname as table_name,
      p.polname as policy_name
    from pg_class c
    left join pg_policy p on p.polrelid = c.oid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'game_saves'
    order by p.polname nulls last
  `;
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
