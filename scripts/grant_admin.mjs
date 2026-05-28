import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}
if (!email) {
  throw new Error('ADMIN_EMAIL is required');
}

const sql = postgres(connectionString, { ssl: 'require' });

try {
  await sql`
    insert into public.admin_users (email)
    values (${email})
    on conflict (email) do nothing
  `;
  const rows = await sql`
    select email
    from public.admin_users
    order by email
  `;
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
