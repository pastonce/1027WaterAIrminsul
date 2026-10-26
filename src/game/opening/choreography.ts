import pattern from '../../data/eSkillPattern.generated.json' with { type: 'json' };

const BOUNCE_RULES = { dropStartMs: 100, firstBounceMs: 600, dropHeight: 0.34, restitution: 0.55, reboundCount: 5 } as const;

export function openingBounces() {
  let startMs: number = BOUNCE_RULES.firstBounceMs;
  let flightMs = 2 * (BOUNCE_RULES.firstBounceMs - BOUNCE_RULES.dropStartMs) * BOUNCE_RULES.restitution;
  let heightRatio = BOUNCE_RULES.dropHeight * BOUNCE_RULES.restitution ** 2;
  return Array.from({ length: BOUNCE_RULES.reboundCount }, () => {
    const arc = { startMs, peakMs: startMs + flightMs / 2, endMs: startMs + flightMs, heightRatio };
    startMs = arc.endMs;
    flightMs *= BOUNCE_RULES.restitution;
    heightRatio *= BOUNCE_RULES.restitution ** 2;
    return arc;
  });
}

export const OPENING_RULES = { ...BOUNCE_RULES, durationMs: 5800, materialScale: 0.8, fallbackMs: 220, assetWaitMs: 900, rollMs: openingBounces().at(-1)!.endMs, arriveMs: 2850, holdMs: 600, splitMs: 3450, revealMs: 3890, windowMs: 4210, expandMs: 4430, expandedMs: 5210 } as const;

export function openingGeometry(width: number, height: number) {
  const edge = Math.min(480, Math.min(width, height) * 0.62) * OPENING_RULES.materialScale;
  const expandedEdge = Math.max(width, height) * 1.7 + 32;
  const leafSize = edge * 180 / pattern.openingWindow.size;
  return { edge, expandedEdge, artSize: edge * pattern.viewBox[2] / pattern.openingWindow.size, zoom: expandedEdge / edge, leafSize, rollingRadius: leafSize * 0.28 };
}

export function openingTravel(width: number, height: number) {
  const bounces = openingBounces();
  const radius = openingGeometry(width, height).leafSize / Math.sqrt(2);
  const points = [
    { timeMs: 0, position: -width / 2 - radius - 24 },
    { timeMs: OPENING_RULES.firstBounceMs, position: -width * 0.34 },
    { timeMs: bounces[0].endMs, position: -width * 0.23 },
    { timeMs: bounces[1].endMs, position: -width * 0.16 },
  ];
  const durations = points.slice(1).map((point, index) => point.timeMs - points[index].timeMs);
  const slopes = points.slice(1).map((point, index) => (point.position - points[index].position) / durations[index]);
  const finalMain = points.at(-1)!;
  const glideMs = OPENING_RULES.arriveMs - finalMain.timeMs;
  const glideVelocity = -2 * finalMain.position / glideMs;
  return [
    ...points.map((point, index) => {
      if (index === 0) return { ...point, velocity: slopes[0] };
      if (index === points.length - 1) return { ...point, velocity: glideVelocity };
      const previousWeight = 2 * durations[index] + durations[index - 1];
      const nextWeight = durations[index] + 2 * durations[index - 1];
      return { ...point, velocity: (previousWeight + nextWeight) / (previousWeight / slopes[index - 1] + nextWeight / slopes[index]) };
    }),
    ...[...bounces.slice(2).map((arc) => arc.endMs), OPENING_RULES.arriveMs].map((timeMs) => {
      const remaining = (OPENING_RULES.arriveMs - timeMs) / glideMs;
      return { timeMs, position: finalMain.position * remaining ** 2, velocity: glideVelocity * remaining };
    }),
  ];
}

export interface OpeningTrack { selector: string; frames: Keyframe[] }

export const OPENING_SPIN = { degreesPerSecond: 90, brakeMs: 300 } as const;
export function openingSpinStop(elapsedMs: number) {
  const from = Math.max(0, elapsedMs) * OPENING_SPIN.degreesPerSecond / 1000;
  const brakingAngle = OPENING_SPIN.degreesPerSecond * OPENING_SPIN.brakeMs / 2000;
  const to = Math.ceil((from + brakingAngle) / 90) * 90;
  const glideMs = (to - from - brakingAngle) / OPENING_SPIN.degreesPerSecond * 1000;
  return { from, to, glideMs, durationMs: glideMs + OPENING_SPIN.brakeMs, brakingAngle };
}

export function openingTracks(width: number, height: number): OpeningTrack[] {
  const geometry = openingGeometry(width, height);
  const offset = (milliseconds: number) => milliseconds / OPENING_RULES.durationMs;
  const aperture = (edge: number) => `inset(calc(50% - ${edge / 2}px) calc(50% - ${edge / 2}px))`;
  const easeOut = 'cubic-bezier(.18,.78,.26,1)';
  const expand = 'cubic-bezier(.62,0,.22,1)';
  const fall = 'cubic-bezier(.3333333333,0,.6666666667,.3333333333)';
  const rise = 'cubic-bezier(.3333333333,.6666666667,.6666666667,1)';
  const bounces = openingBounces();
  const travel = openingTravel(width, height);
  const finalAngle = -travel[0].position / geometry.rollingRadius * 180 / Math.PI;
  const rotationPhase = Math.round(finalAngle / 90) * 90 - finalAngle;
  const motion = travel.map((point, index) => {
    const next = travel[index + 1];
    const duration = next ? next.timeMs - point.timeMs : 0;
    const distance = next ? next.position - point.position : 1;
    const easing = next ? `cubic-bezier(.3333333333,${point.velocity * duration / (3 * distance)},.6666666667,${1 - next.velocity * duration / (3 * distance)})` : 'linear';
    return { offset: offset(point.timeMs), position: point.position, angle: (point.position - travel[0].position) / geometry.rollingRadius * 180 / Math.PI + rotationPhase, easing };
  });
  const settledRotation = `rotate(${motion.at(-1)!.angle}deg)`;
  const throwHeight = OPENING_RULES.dropHeight * (1 - (OPENING_RULES.dropStartMs / (OPENING_RULES.firstBounceMs - OPENING_RULES.dropStartMs)) ** 2);
  const tracks: OpeningTrack[] = [
    { selector: '.opening-content', frames: [
      { offset: 0, clipPath: aperture(0), opacity: 0 },
      { offset: offset(OPENING_RULES.revealMs), clipPath: aperture(0), opacity: 0, easing: easeOut },
      { offset: offset(OPENING_RULES.windowMs), clipPath: aperture(geometry.edge), opacity: 1 },
      { offset: offset(OPENING_RULES.expandMs), clipPath: aperture(geometry.edge), opacity: 1, easing: expand },
      { offset: offset(OPENING_RULES.expandedMs), clipPath: aperture(geometry.expandedEdge), opacity: 1 },
      { offset: 1, clipPath: aperture(geometry.expandedEdge), opacity: 1 },
    ] },
    { selector: '.opening-flight', frames: [
      ...motion.map((point, index) => {
        const next = motion[index + 1];
        const easing = index === motion.length - 2 ? `cubic-bezier(.3333333333,${travel[index].velocity * (travel[index + 1].timeMs - travel[index].timeMs) / (3 * (travel[index + 1].position - travel[index].position))},.6666666667,${1 - OPENING_SPIN.degreesPerSecond / 1000 * (travel[index + 1].timeMs - travel[index].timeMs) / (3 * (next.angle - point.angle))})` : point.easing;
        return { offset: point.offset, transform: `rotate(${point.angle}deg)`, opacity: 1, easing };
      }),
      { offset: offset(OPENING_RULES.splitMs), transform: settledRotation, opacity: 1 },
      { offset: offset(OPENING_RULES.splitMs + 90), transform: settledRotation, opacity: 0 },
      { offset: 1, transform: settledRotation, opacity: 0 },
    ] },
    { selector: '.opening-flight-travel', frames: [
      ...motion.map((point) => ({ offset: point.offset, transform: `translateX(${point.position}px)`, easing: point.easing })),
      { offset: 1, transform: 'translateX(0px)' },
    ] },
    { selector: '.opening-flight-bounce', frames: [
      { offset: 0, transform: `translateY(${-height * throwHeight}px)`, easing: rise },
      { offset: offset(OPENING_RULES.dropStartMs), transform: `translateY(${-height * OPENING_RULES.dropHeight}px)`, easing: fall },
      { offset: offset(OPENING_RULES.firstBounceMs), transform: 'translateY(0px)', easing: rise },
      ...bounces.flatMap((arc, index) => [
        { offset: offset(arc.peakMs), transform: `translateY(${-height * arc.heightRatio}px)`, easing: fall },
        { offset: offset(arc.endMs), transform: 'translateY(0px)', easing: index < bounces.length - 1 ? rise : 'linear' },
      ]),
      { offset: offset(OPENING_RULES.arriveMs), transform: 'translateY(0px)' },
      { offset: 1, transform: 'translateY(0px)' },
    ] },
    { selector: '.opening-frame', frames: [
      { offset: 0, transform: 'scale(1)', opacity: 1 },
      { offset: offset(OPENING_RULES.expandMs), transform: 'scale(1)', easing: expand },
      { offset: offset(OPENING_RULES.expandedMs), transform: `scale(${geometry.zoom})`, opacity: 1 },
      { offset: offset(OPENING_RULES.expandedMs + 110), transform: `scale(${geometry.zoom})`, opacity: 0 },
      { offset: 1, transform: `scale(${geometry.zoom})`, opacity: 0 },
    ] },
    { selector: '.opening-structure', frames: [
      { offset: 0, opacity: 0 },
      { offset: offset(OPENING_RULES.splitMs + 80), opacity: 0, transform: 'scale(.9)', easing: easeOut },
      { offset: offset(OPENING_RULES.splitMs + 520), opacity: 1, transform: 'scale(1)' },
      { offset: 1, opacity: 1, transform: 'scale(1)' },
    ] },
    { selector: '.opening-center', frames: [
      { offset: 0, opacity: 0, transform: 'scale(.72) rotate(-20deg)' },
      { offset: offset(OPENING_RULES.splitMs + 300), opacity: 0, transform: 'scale(.72) rotate(-20deg)', easing: easeOut },
      { offset: offset(OPENING_RULES.splitMs + 660), opacity: 1, transform: 'scale(1) rotate(0deg)' },
      { offset: offset(OPENING_RULES.expandedMs - 100), opacity: 1, transform: 'scale(1.03) rotate(24deg)', easing: 'ease-out' },
      { offset: offset(OPENING_RULES.durationMs - 110), opacity: 0, transform: 'scale(1.12) rotate(36deg)' },
      { offset: 1, opacity: 0, transform: 'scale(1.12) rotate(36deg)' },
    ] },
    { selector: '.opening-scan', frames: [
      { offset: 0, opacity: 0, transform: 'translateY(-250px)' },
      { offset: offset(OPENING_RULES.splitMs + 520), opacity: 0, transform: 'translateY(-250px)' },
      { offset: offset(OPENING_RULES.splitMs + 610), opacity: 0.45 },
      { offset: offset(OPENING_RULES.expandMs - 90), opacity: 0, transform: 'translateY(250px)' },
      { offset: 1, opacity: 0, transform: 'translateY(250px)' },
    ] },
  ];
  const centerX = pattern.openingWindow.left + pattern.openingWindow.size / 2;
  const centerY = pattern.openingWindow.top + pattern.openingWindow.size / 2;
  for (const piece of pattern.pieces.filter((entry) => entry.name.startsWith('corner_'))) {
    const [horizontal, skewY, skewX, vertical, left, top] = piece.matrix;
    const [, , regionWidth, regionHeight] = piece.region;
    const sourceX = left + (horizontal * regionWidth + skewX * regionHeight) / 2 - centerX;
    const sourceY = top + (skewY * regionWidth + vertical * regionHeight) / 2 - centerY;
    const origin = `translate(${-sourceX}px,${-sourceY}px)`;
    tracks.push({ selector: `[data-opening-corner=${piece.name}]`, frames: [
      { offset: 0, opacity: 0, transform: origin },
      { offset: offset(OPENING_RULES.splitMs), opacity: 0, transform: origin },
      { offset: offset(OPENING_RULES.splitMs + 50), opacity: 1, transform: origin, easing: easeOut },
      { offset: offset(OPENING_RULES.splitMs + 500), opacity: 1, transform: 'translate(0px,0px)' },
      { offset: 1, opacity: 1, transform: 'translate(0px,0px)' },
    ] });
  }
  return tracks;
}
