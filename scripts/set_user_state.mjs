import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
const email = process.env.USER_EMAIL?.trim().toLowerCase();
const nextState = process.env.CURRENT_STATE?.trim();

if (!connectionString) throw new Error('DATABASE_URL is required');
if (!email) throw new Error('USER_EMAIL is required');
if (!nextState) throw new Error('CURRENT_STATE is required');

const sql = postgres(connectionString, { ssl: 'require' });

try {
  const rows = await sql`
    select u.id, u.email, s.data
    from auth.users u
    join public.game_saves s on s.user_id = u.id
    where lower(u.email) = ${email}
  `;
  if (rows.length !== 1) {
    throw new Error(`Expected one save for ${email}, found ${rows.length}`);
  }

  const row = rows[0];
  const save = row.data;
  const nextSave = {
    ...save,
    pet: {
      ...save.pet,
      currentState: nextState,
      lastChecked: Date.now(),
    },
  };

  await sql`
    update public.game_saves
    set data = ${sql.json(nextSave)}, updated_at = now()
    where user_id = ${row.id}
  `;

  console.log(JSON.stringify({
    email: row.email,
    before: save.pet.currentState,
    after: nextState,
  }, null, 2));
} finally {
  await sql.end();
}
