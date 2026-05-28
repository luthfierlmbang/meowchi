import postgres from 'postgres';

const HUNGER_RATE = 6;
const ENERGY_RATE = 4;
const BLADDER_RATE = 5;
const ENERGY_RECHARGE_RATE = 20;
const OFFLINE_CAP_HOURS = 24;

const connectionString = process.env.DATABASE_URL;
const email = process.env.USER_EMAIL?.trim().toLowerCase();

if (!connectionString) throw new Error('DATABASE_URL is required');
if (!email) throw new Error('USER_EMAIL is required');

function clamp(x) {
  return Math.max(0, Math.min(100, x));
}

function projectStats(stats, hours, currentState) {
  const effectiveHours = Math.min(Math.max(0, hours), OFFLINE_CAP_HOURS);
  const sleeping = currentState === 'sleeping';
  const focusing = currentState === 'focusing';
  const next = {
    hunger: clamp(stats.hunger - HUNGER_RATE * effectiveHours),
    energy: clamp(
      stats.energy + (sleeping ? ENERGY_RECHARGE_RATE : -ENERGY_RATE) * effectiveHours,
    ),
    bladder: focusing ? stats.bladder : clamp(stats.bladder - BLADDER_RATE * effectiveHours),
    happiness: focusing ? stats.happiness : stats.happiness,
  };
  return {
    hunger: clamp(Math.round(next.hunger)),
    energy: clamp(Math.round(next.energy)),
    bladder: clamp(Math.round(next.bladder)),
    happiness: clamp(Math.round(next.happiness)),
  };
}

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
  const now = Date.now();
  const lastChecked = Number(save.pet.lastChecked ?? now);
  const hours = Math.max(0, (now - lastChecked) / 3_600_000);
  const nextStats = projectStats(save.pet.stats, hours, save.pet.currentState);
  const nextSave = {
    ...save,
    pet: {
      ...save.pet,
      stats: nextStats,
      lastChecked: now,
    },
  };

  await sql`
    update public.game_saves
    set data = ${sql.json(nextSave)}, updated_at = now()
    where user_id = ${row.id}
  `;

  console.log(JSON.stringify({
    email: row.email,
    hoursApplied: Math.min(hours, OFFLINE_CAP_HOURS),
    before: save.pet.stats,
    after: nextStats,
    currentState: save.pet.currentState,
  }, null, 2));
} finally {
  await sql.end();
}
