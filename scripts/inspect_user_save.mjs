import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
const email = process.env.USER_EMAIL?.trim().toLowerCase();

if (!connectionString) throw new Error('DATABASE_URL is required');
if (!email) throw new Error('USER_EMAIL is required');

const sql = postgres(connectionString, { ssl: 'require' });

try {
  const rows = await sql`
    select
      u.id,
      u.email,
      s.updated_at,
      s.data->'pet'->>'currentState' as current_state,
      s.data->'pet'->'stats' as stats,
      (s.data->'pet'->>'lastChecked')::numeric as last_checked,
      (s.data->'pet'->>'lastInteractionAt')::numeric as last_interaction_at
    from auth.users u
    left join public.game_saves s on s.user_id = u.id
    where lower(u.email) = ${email}
  `;
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
