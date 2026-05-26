// Preconfigured Routine Habit IDs (stable string identifiers)
export const ROUTINE_HABIT_IDS = [
  'routine.brush_teeth',
  'routine.drink_water',
  'routine.make_bed',
  'routine.stretch',
  'routine.tidy_room',
] as const;

export type RoutineHabitId = typeof ROUTINE_HABIT_IDS[number];

// Preconfigured Main Habit IDs (validated via Gemini Vision)
export const MAIN_HABIT_IDS = [
  'main.workout_photo',
  'main.healthy_meal',
] as const;

export type MainHabitId = typeof MAIN_HABIT_IDS[number];

export type HabitId = RoutineHabitId | MainHabitId;

// Reward magnitudes (Req 9.3, 10.3)
export const STANDARD_COIN_REWARD = 5;  // Routine habits
export const LARGE_COIN_REWARD = 50;    // Main habits (Vision-verified)

// Human-readable labels for UI display (Indonesian)
export const ROUTINE_HABIT_LABELS: Record<RoutineHabitId, string> = {
  'routine.brush_teeth': 'Sikat Gigi',
  'routine.drink_water': 'Minum Air Putih',
  'routine.make_bed': 'Rapikan Tempat Tidur',
  'routine.stretch': 'Peregangan',
  'routine.tidy_room': 'Bersihkan Kamar',
};

export const MAIN_HABIT_LABELS: Record<MainHabitId, string> = {
  'main.workout_photo': 'Foto Olahraga',
  'main.healthy_meal': 'Foto Makanan Sehat',
};

// Main habit descriptions for camera capture guidance
export const MAIN_HABIT_DESCRIPTIONS: Record<MainHabitId, string> = {
  'main.workout_photo': 'Ambil foto saat kamu sedang berolahraga atau setelah selesai berolahraga',
  'main.healthy_meal': 'Ambil foto makanan sehat yang kamu konsumsi hari ini',
};
