import { BIRTHDAY_RULES } from './BirthdayDirector';

const COLORS = ['#fb76ac', '#ffd35c', '#86cf79', '#73c7f3', '#bc98f1', '#fff0b8', '#ffa56d', '#74dccc', '#a2a7ef', '#e195ec', '#ff98bd', '#ffc493', '#f6ed88', '#def09b'];

export function birthdayParticles(id: number, compact: boolean, reduced = false) {
  let state = Math.imul(id + 1, 0x9e3779b1) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const count = reduced ? 12 : compact ? 76 + Math.floor(random() * 33) : 120 + Math.floor(random() * 49);
  return Array.from({ length: count }, () => {
    const delay = random() ** 1.35 * 1200;
    const rotation = random() * 360;
    return {
      left: random() * 108 - 4, drift: (random() - 0.5) * 0.46, sway: (random() - 0.5) * 0.09,
      start: 25 + random() * 80, delay, duration: 2700 + random() * (Math.min(4200, BIRTHDAY_RULES.showerMs - delay - 100) - 2700),
      rotation, spin: (random() - 0.5) * 1700, size: 0.64 + random() * 0.72,
      color: COLORS[Math.floor(random() * COLORS.length)], candy: random() < 0.36,
    };
  });
}
