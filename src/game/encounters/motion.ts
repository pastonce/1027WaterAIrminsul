import type { HidingMotion } from '../../data/inhabitants';

export interface RoamingMotionOptions extends HidingMotion { edge?: 'left' | 'right' | 'top' | 'bottom'; burrow?: -1 | 1; exitDistance?: number }
export function roamingMotion(age: number, leaving: number | undefined, celebrated = false, reduced = false, options: RoamingMotionOptions = {}) {
  if (reduced) return { horizontal: 0, vertical: 0, scaleX: 1, scaleY: 1, opacity: 1 };
  const peek = Math.pow(Math.max(0, Math.sin(age * Math.PI / 4.2)), 8);
  let vertical = Math.pow(1 - Math.min(1, age / 0.75), 2) * 0.9 - peek * 0.12;
  let scaleY = 1;
  let opacity = 1;
  const direction = options.edge === 'left' ? -1 : options.edge === 'right' ? 1 : options.burrow ?? 0;
  const short = (options.travel ?? 1) < 1;
  if (leaving === undefined && age < 0.75 && (options.arrival === 'fade' || short)) opacity = 1 - Math.pow(1 - age / 0.75, 2);
  if (leaving === undefined && age < 0.75 && options.arrival === 'fade') vertical = 0;
  if (leaving !== undefined && celebrated && (options.edge === 'left' || options.edge === 'right')) {
    const progress = Math.min(1, leaving / 1.35);
    if (progress < 0.1) scaleY = 1 - Math.sin(progress / 0.1 * Math.PI) * 0.16;
    const jump = Math.max(0, Math.min(1, (progress - 0.1) / 0.25));
    const departure = Math.max(0, (progress - 0.35) / 0.65);
    const horizontal = direction * (-0.55 * Math.sin(jump * Math.PI / 2) + 1.75 * departure * departure);
    return { horizontal, vertical: -0.78 * Math.sin(jump * Math.PI / 2) * (1 - departure * 0.25), scaleX: 1 / Math.sqrt(scaleY), scaleY, opacity };
  }
  if (leaving !== undefined) {
    if (short) { const fade = Math.max(0, Math.min(1, (leaving / (celebrated ? 1.35 : 0.7) - 0.5) * 2)); opacity = 1 - fade * fade * (3 - 2 * fade); }
    if (celebrated) {
      const progress = Math.min(1, leaving / 1.35);
      if (progress < 0.1) { scaleY = 1 - Math.sin(progress / 0.1 * Math.PI) * 0.16; vertical = 0; }
      else if (progress < 0.55) { vertical = -Math.sin((progress - 0.1) / 0.45 * Math.PI) * 0.78; scaleY = 1.04; }
      else { vertical = Math.pow((progress - 0.55) / 0.45, 2) * 1.2; scaleY = 1 - Math.sin((progress - 0.55) / 0.45 * Math.PI) * 0.14; }
    } else vertical = Math.pow(Math.min(1, leaving / 0.7), 2) * 1.2;
  }
  if (leaving !== undefined || age < 0.75) vertical *= options.travel ?? 1;
  const descent = Math.max(0, vertical);
  const sideways = Boolean(direction);
  const bottom = options.departure === 'bottom' && leaving !== undefined;
  const horizontal = bottom ? 0 : (options.arrival === 'fade' && leaving === undefined && age < 0.75 ? 0 : Math.sin(age * 5) * peek * 0.016) + direction * (descent + Math.min(0, vertical) * 0.7);
  vertical = bottom ? Math.min(0, vertical) + descent * (options.exitDistance ?? 1.2) / 1.2 : options.edge === 'top' ? -vertical : sideways ? Math.min(0, vertical) + descent * 0.12 : vertical;
  return { horizontal, vertical, scaleX: 1 / Math.sqrt(scaleY), scaleY, opacity };
}

export function roamingVariables(options: RoamingMotionOptions) {
  const entrance = roamingMotion(0, undefined, false, false, options);
  const peak = roamingMotion(2, 1.35 * (options.edge === 'left' || options.edge === 'right' ? 0.35 : 0.325), true, false, options);
  const departure = roamingMotion(2, 1.35, true, false, options);
  const retreat = roamingMotion(2, 0.7, false, false, options);
  const orientation = options.edge === 'top' ? -100 : 100;
  return { '--enter-x': `${entrance.horizontal * orientation}%`, '--enter-y': `${entrance.vertical * orientation}%`, '--enter-opacity': entrance.opacity, '--hop-x': `${peak.horizontal * orientation}%`, '--hop-y': `${peak.vertical * orientation}%`, '--exit-x': `${departure.horizontal * orientation}%`, '--exit-y': `${departure.vertical * orientation}%`, '--exit-opacity': departure.opacity, '--retreat-x': `${retreat.horizontal * orientation}%`, '--retreat-y': `${retreat.vertical * orientation}%`, '--retreat-opacity': retreat.opacity };
}
