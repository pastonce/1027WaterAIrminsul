export const TREE_WORLD = { width: 1000, height: 3400, ground: 3300 };

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export const trunkX = (height: number) => 500 + Math.sin(height / 310) * 16 + Math.sin(height / 107) * 5;

export function createSkeleton(seed: number) {
  const random = seededRandom(seed);
  return Array.from({ length: 30 }, (_, index) => {
    const height = 55 + index * 94;
    const direction = index % 2 === 0 ? -1 : 1;
    const length = 75 + random() * 120;
    const rise = 30 + random() * 80;
    const startX = trunkX(height);
    const startY = TREE_WORLD.ground - height;
    return {
      id: `branch-${index}`, height, direction, length, rise, startX, startY,
      endX: startX + direction * length, endY: startY - rise,
      path: `M ${startX} ${startY} Q ${startX + direction * length * 0.75} ${startY + 8}, ${startX + direction * length} ${startY - rise}`,
      historical: index === 0 ? 'first-leaf' : index === 10 ? 'freedom' : null,
      leaves: Array.from({ length: 7 }, (_, leafIndex) => ({
        ratio: 0.4 + leafIndex * 0.1, rotation: direction * (30 + random() * 65), size: 0.65 + random() * 0.5,
      })),
    };
  });
}

export function trunkPath(height: number) {
  const samples = Array.from({ length: Math.ceil(height / 28) + 1 }, (_, index) => Math.min(index * 28, height));
  const baseWidth = 5 + Math.min(24, height / 85);
  const widthAt = (sample: number) => Math.max(2.5, baseWidth * (1 - sample / (height + 90) * 0.84));
  const left = samples.map((sample) => `${trunkX(sample) - widthAt(sample)},${TREE_WORLD.ground - sample}`);
  const right = [...samples].reverse().map((sample) => `${trunkX(sample) + widthAt(sample)},${TREE_WORLD.ground - sample}`);
  return `M ${left.join(' L ')} L ${right.join(' L ')} Z`;
}
