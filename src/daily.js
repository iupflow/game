// The daily challenge: one game a day with a twist. Everyone gets the same planets in the same
// order that day (the launcher runs on a seed made from the date), the same rule and the same goal.

/** A small, fast seeded random number generator (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Today's date as YYYY-MM-DD, in the player's own time zone. */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// goal: the body to make; reward: stardust for the first win of the day
export const DAILY_RULES = [
  { id: 'lowgrav', name: 'Low Gravity', text: 'Gravity is weaker today', gravity: 0.65, goal: 8, reward: 150 },
  { id: 'golden', name: 'Golden Day', text: 'Golden planets come 4x as often', golden: 4, goal: 8, reward: 150 },
  { id: 'meteors', name: 'Meteor Day', text: 'Meteor showers, again and again', events: ['meteors'], eventGap: 0.55, goal: 8, reward: 150 },
  { id: 'tight', name: 'Tight Space', text: 'The ring is 8% smaller', ringScale: 0.92, goal: 7, reward: 200 },
  { id: 'bare', name: 'Bare Hands', text: 'No boosters, but bombs come 3x as often', noBoosters: true, bomb: 3, goal: 7, reward: 200 },
  { id: 'spin', name: 'Spin Cycle', text: 'The field turns 3x as fast', spin: 3, goal: 7, reward: 200 },
  { id: 'zerog', name: 'Zero-G Day', text: 'Zero gravity, again and again', events: ['zerog'], eventGap: 0.6, goal: 8, reward: 150 },
];

/** The challenge for a given day: its rule, goal, reward and the seed for the launcher. */
export function dailyChallenge(dateKey = todayKey()) {
  const seed = hash('jelly-' + dateKey);
  const rule = DAILY_RULES[seededRandom(seed)() * DAILY_RULES.length | 0];
  return { date: dateKey, seed, rule, goal: rule.goal, reward: rule.reward };
}
