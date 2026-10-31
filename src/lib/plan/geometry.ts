/* Floor-plan geometry. Rooms are polygons with only horizontal and vertical
   walls, on a grid of whole units (about half a metre each); windows and doors
   are short segments lying on a wall. All of this is pure maths — drawing is
   in render.ts, editing in PlanEditor.svelte. */

export type Point = [number, number];

export interface Room {
  id: string;
  name: string;
  /** corners in order; every wall is horizontal or vertical */
  pts: Point[];
}

export interface Feature {
  id: string;
  type: 'window' | 'door';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** As saved in 'plan/main'. */
export interface Plan {
  rooms: Room[];
  features: Feature[];
  updated?: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CACHE_LIMIT_PLACE = 300;
const EPSILON = 1e-6;
const SEARCH_EPSILON = 1e-9;

export function boundingBox(rooms: Array<Pick<Room, 'pts'>>): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const room of rooms) {
    for (const [x, y] of room.pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 40, y1: 30 };
}

/** SVG path data for a polygon. */
export function polygonPath(points: Point[]): string {
  return 'M' + points.map((p) => p[0] + ' ' + p[1]).join('L') + 'Z';
}

/** Is (x, y) inside the polygon? (ray casting) */
export function isInside(points: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

export function area(points: Point[]): number {
  let doubled = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    doubled += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubled) / 2;
}

/** Distance from a point to the segment a–b. */
export function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared ? ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

const samePoint = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];

/** Drop repeated corners and corners in the middle of a straight wall. */
export function cleanPolygon(points: Point[]): Point[] {
  const result: Point[] = points.map((p) => [p[0], p[1]]);
  let changed = true;
  while (changed && result.length >= 3) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const previous = result[(i - 1 + result.length) % result.length];
      const current = result[i];
      const next = result[(i + 1) % result.length];
      const straightX = previous[0] === current[0] && current[0] === next[0];
      const straightY = previous[1] === current[1] && current[1] === next[1];
      if (samePoint(current, next) || straightX || straightY) {
        result.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

const segmentBox = (a: Point, b: Point): [number, number, number, number] => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
];

/** A usable room shape: an even number of corners, walls alternating
    horizontal/vertical, some area, and no two walls touching except neighbours. */
export function isValidRoom(points: Point[]): boolean {
  const count = points.length;
  if (count < 4 || count % 2) {
    return false;
  }
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const vertical = a[0] === b[0];
    const horizontal = a[1] === b[1];
    if (vertical === horizontal) {
      return false;
    }
  }
  if (area(points) < 1) {
    return false;
  }
  for (let i = 0; i < count; i++) {
    for (let j = i + 2; j < count; j++) {
      if (i === 0 && j === count - 1) {
        continue;
      }
      const boxA = segmentBox(points[i], points[(i + 1) % count]);
      const boxB = segmentBox(points[j], points[(j + 1) % count]);
      const overlaps =
        Math.max(boxA[0], boxB[0]) <= Math.min(boxA[2], boxB[2]) &&
        Math.max(boxA[1], boxB[1]) <= Math.min(boxA[3], boxB[3]);
      if (overlaps) {
        return false;
      }
    }
  }
  return true;
}

export interface Wall {
  distance: number;
  a: Point;
  b: Point;
}

export function nearestWall(rooms: Room[], x: number, y: number): Wall | null {
  let best: Wall | null = null;
  for (const room of rooms) {
    const count = room.pts.length;
    for (let i = 0; i < count; i++) {
      const a = room.pts[i];
      const b = room.pts[(i + 1) % count];
      const distance = distanceToSegment(x, y, a, b);
      if (!best || distance < best.distance) {
        best = { distance, a, b };
      }
    }
  }
  return best;
}

/** The extent of a wall along its own direction. */
export function wallSpan(wall: { a: Point; b: Point }): {
  horizontal: boolean;
  low: number;
  high: number;
} {
  const horizontal = wall.a[1] === wall.b[1];
  const axis = horizontal ? 0 : 1;
  return {
    horizontal,
    low: Math.min(wall.a[axis], wall.b[axis]),
    high: Math.max(wall.a[axis], wall.b[axis]),
  };
}

/** Move a window or door onto the nearest wall within maxDistance, centred
    near (cx, cy). Changes the feature in place; false if no wall was near. */
export function glueToWall(
  feature: Feature,
  rooms: Room[],
  cx: number,
  cy: number,
  maxDistance: number,
): boolean {
  const wall = nearestWall(rooms, cx, cy);
  if (!wall || wall.distance > maxDistance) {
    return false;
  }
  const { horizontal, low, high } = wallSpan(wall);
  const currentLength = Math.max(
    Math.abs(feature.x2 - feature.x1),
    Math.abs(feature.y2 - feature.y1),
    1,
  );
  const length = Math.max(1, Math.min(currentLength, high - low));
  const centre = horizontal ? cx : cy;
  const start = Math.max(low, Math.min(high - length, Math.round(centre - length / 2)));
  if (horizontal) {
    feature.x1 = start;
    feature.x2 = start + length;
    feature.y1 = wall.a[1];
    feature.y2 = wall.a[1];
  } else {
    feature.y1 = start;
    feature.y2 = start + length;
    feature.x1 = wall.a[0];
    feature.x2 = wall.a[0];
  }
  return true;
}

/** Does the rectangle fit inside the room without any wall cutting through it? */
function rectangleFits(points: Point[], x0: number, y0: number, x1: number, y1: number): boolean {
  const cornersInside =
    isInside(points, x0 + EPSILON, y0 + EPSILON) &&
    isInside(points, x1 - EPSILON, y0 + EPSILON) &&
    isInside(points, x0 + EPSILON, y1 - EPSILON) &&
    isInside(points, x1 - EPSILON, y1 - EPSILON);
  if (!cornersInside) {
    return false;
  }
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    if (a[1] === b[1]) {
      const y = a[1];
      if (y > y0 && y < y1 && Math.max(a[0], b[0]) > x0 && Math.min(a[0], b[0]) < x1) {
        return false;
      }
    } else {
      const x = a[0];
      if (x > x0 && x < x1 && Math.max(a[1], b[1]) > y0 && Math.min(a[1], b[1]) < y1) {
        return false;
      }
    }
  }
  return true;
}

function distanceToWalls(points: Point[], x: number, y: number): number {
  let distance = Infinity;
  for (let i = 0; i < points.length; i++) {
    distance = Math.min(
      distance,
      distanceToSegment(x, y, points[i], points[(i + 1) % points.length]),
    );
  }
  return distance;
}

export interface LabelSpot {
  x: number;
  y: number;
  /** index into the variants that fitted */
  variant: number;
}

const placeCache = new Map<string, LabelSpot | null>();

/** Find where a room label fits: tries each variant (long to short) and
    returns the first that fits somewhere, at the spot farthest from the walls. */
export function placeLabel(
  points: Point[],
  variants: Array<{ w: number; h: number }>,
  step: number,
  margin: number,
): LabelSpot | null {
  const key = JSON.stringify([points, variants.map((v) => [v.w.toFixed(2), v.h.toFixed(2)]), step]);
  const cached = placeCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const box = boundingBox([{ pts: points }]);
  let result: LabelSpot | null = null;
  for (let variant = 0; variant < variants.length && !result; variant++) {
    const halfWidth = variants[variant].w / 2 + margin;
    const halfHeight = variants[variant].h / 2 + margin;
    let best: { x: number; y: number; distance: number } | null = null;
    for (let x = box.x0 + halfWidth; x <= box.x1 - halfWidth + SEARCH_EPSILON; x += step) {
      for (let y = box.y0 + halfHeight; y <= box.y1 - halfHeight + SEARCH_EPSILON; y += step) {
        if (!rectangleFits(points, x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight)) {
          continue;
        }
        const distance = distanceToWalls(points, x, y);
        if (!best || distance > best.distance + SEARCH_EPSILON) {
          best = { x, y, distance };
        }
      }
    }
    if (best) {
      result = { x: best.x, y: best.y, variant };
    }
  }
  if (placeCache.size > CACHE_LIMIT_PLACE) {
    placeCache.clear();
  }
  placeCache.set(key, result);
  return result;
}

/** Forget cached label spots (after the web fonts load, text widths change). */
export function clearLabelCache(): void {
  placeCache.clear();
}

/** Is the feature lying on one of the polygon's walls? */
export function isOnWall(feature: Feature, points: Point[]): boolean {
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const featureHorizontal = feature.y1 === feature.y2;
    const featureVertical = feature.x1 === feature.x2;
    if (
      a[1] === b[1] &&
      featureHorizontal &&
      feature.y1 === a[1] &&
      Math.min(feature.x1, feature.x2) >= Math.min(a[0], b[0]) &&
      Math.max(feature.x1, feature.x2) <= Math.max(a[0], b[0])
    ) {
      return true;
    }
    if (
      a[0] === b[0] &&
      featureVertical &&
      feature.x1 === a[0] &&
      Math.min(feature.y1, feature.y2) >= Math.min(a[1], b[1]) &&
      Math.max(feature.y1, feature.y2) <= Math.max(a[1], b[1])
    ) {
      return true;
    }
  }
  return false;
}
