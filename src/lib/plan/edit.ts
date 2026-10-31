import {
  cleanPolygon,
  glueToWall,
  isOnWall,
  isValidRoom,
  nearestWall,
  wallSpan,
  type Feature,
  type Point,
  type Room,
} from './geometry';

/* The plan editor's operations, as plain functions on a draft plan. The
   editor (PlanEditor.svelte) handles touches and undo; this file only knows
   geometry. Every function either changes the draft it is given or returns a
   reason it could not. */

export interface Draft {
  rooms: Room[];
  features: Feature[];
  /** rooms deleted in this session and what happens to their tasks; part of
      the draft so Undo brings a room (and its tasks) back */
  deletions: Array<{ id: string; action: 'home' | 'delete' }>;
}

/** A drag target, as written in the SVG's data-h attributes:
    r:<roomId>  the room body       v:<i>  corner i of the selected room
    e:<i>       wall i (i → i+1)    f:<id> a window or door
    fe:<id>:<0|1>  one end of a window or door */
export interface Handle {
  kind: 'r' | 'v' | 'e' | 'f' | 'fe' | '';
  a: string;
  b: string;
}

export function parseHandle(text: string): Handle {
  const [kind = '', a = '', b = ''] = text.split(':');
  return { kind: kind as Handle['kind'], a, b };
}

/** How far a dropped window or door may be from a wall and still snap to it. */
const SNAP_DISTANCE = 3;
/** A tap must be this close to a wall to place a window or door there. */
const PLACE_DISTANCE = 2.5;
const DOOR_LENGTH = 3;
const WINDOW_LENGTH = 4;
/** How deep a corner cut goes, at most. */
const MAX_CUT = 3;
/** A new room's half-width and half-height. */
const NEW_ROOM_HALF_WIDTH = 4;
const NEW_ROOM_HALF_HEIGHT = 3;

export const clonePlan = (draft: Draft): Draft => JSON.parse(JSON.stringify(draft));

function shiftFeature(feature: Feature, dx: number, dy: number): void {
  feature.x1 += dx;
  feature.x2 += dx;
  feature.y1 += dy;
  feature.y2 += dy;
}

/** Move a window/door by (dx, dy), snapping it to a wall near its new centre.
    (wx, wy) is how far the finger moved, unrounded. */
export function dragFeature(feature: Feature, rooms: Room[], wx: number, wy: number): void {
  const cx = (feature.x1 + feature.x2) / 2 + wx;
  const cy = (feature.y1 + feature.y2) / 2 + wy;
  if (!glueToWall(feature, rooms, cx, cy, SNAP_DISTANCE)) {
    shiftFeature(feature, Math.round(wx), Math.round(wy));
  }
}

/** Lengthen or shorten a window/door from one end. */
export function dragFeatureEnd(feature: Feature, end: string, dx: number, dy: number): void {
  const horizontal = feature.y1 === feature.y2;
  if (end === '0') {
    if (horizontal) {
      feature.x1 += dx;
    } else {
      feature.y1 += dy;
    }
  } else if (horizontal) {
    feature.x2 += dx;
  } else {
    feature.y2 += dy;
  }
}

/** Move a whole room, taking the windows and doors on its walls along. */
export function dragRoom(room: Room, features: Feature[], dx: number, dy: number): void {
  for (const feature of features) {
    if (isOnWall(feature, room.pts)) {
      shiftFeature(feature, dx, dy);
    }
  }
  for (const point of room.pts) {
    point[0] += dx;
    point[1] += dy;
  }
}

/** Push one wall in or out (across its own direction), with its windows and doors. */
export function dragWall(
  room: Room,
  features: Feature[],
  index: number,
  dx: number,
  dy: number,
): void {
  const points = room.pts;
  const next = (index + 1) % points.length;
  const horizontal = points[index][1] === points[next][1];
  const onWall = features.filter((feature) => isOnWall(feature, [points[index], points[next]]));
  if (horizontal) {
    points[index][1] += dy;
    points[next][1] += dy;
    onWall.forEach((feature) => shiftFeature(feature, 0, dy));
  } else {
    points[index][0] += dx;
    points[next][0] += dx;
    onWall.forEach((feature) => shiftFeature(feature, dx, 0));
  }
}

/** Move a corner; the two walls meeting there follow so they stay straight. */
export function dragCorner(
  room: Room,
  features: Feature[],
  index: number,
  dx: number,
  dy: number,
): void {
  const points = room.pts;
  const count = points.length;
  const previous = (index - 1 + count) % count;
  const next = (index + 1) % count;
  const x = points[index][0] + dx;
  const y = points[index][1] + dy;
  const previousHorizontal = points[previous][1] === points[index][1];
  const nextHorizontal = points[next][1] === points[index][1];
  for (const feature of features.filter((f) => isOnWall(f, [points[previous], points[index]]))) {
    shiftFeature(feature, previousHorizontal ? 0 : dx, previousHorizontal ? dy : 0);
  }
  for (const feature of features.filter((f) => isOnWall(f, [points[index], points[next]]))) {
    shiftFeature(feature, nextHorizontal ? 0 : dx, nextHorizontal ? dy : 0);
  }
  if (previousHorizontal) {
    points[previous][1] = y;
  } else {
    points[previous][0] = x;
  }
  if (nextHorizontal) {
    points[next][1] = y;
  } else {
    points[next][0] = x;
  }
  points[index] = [x, y];
}

/** A window or door of no length, or with its ends crossed, is not allowed. */
export function isTooShort(feature: Feature, resizing: boolean): boolean {
  const isPoint = feature.x1 === feature.x2 && feature.y1 === feature.y2;
  const crossedHorizontal = feature.y1 === feature.y2 && feature.x2 <= feature.x1;
  const crossedVertical = feature.x1 === feature.x2 && feature.y2 <= feature.y1;
  return isPoint || (resizing && (crossedHorizontal || crossedVertical));
}

/** After a window/door is dropped away from every wall, put it on the nearest one. */
export function snapIfLoose(feature: Feature, rooms: Room[]): void {
  if (!rooms.some((room) => isOnWall(feature, room.pts))) {
    glueToWall(
      feature,
      rooms,
      (feature.x1 + feature.x2) / 2,
      (feature.y1 + feature.y2) / 2,
      Infinity,
    );
  }
}

/** Place a new window or door on the wall nearest to a tap; returns it, or null if no wall is near. */
export function placeFeature(
  draft: Draft,
  type: Feature['type'],
  point: { x: number; y: number },
): Feature | null {
  const wall = nearestWall(draft.rooms, point.x, point.y);
  if (!wall || wall.distance > PLACE_DISTANCE) {
    return null;
  }
  const { horizontal, low, high } = wallSpan(wall);
  const length = Math.max(1, Math.min(type === 'door' ? DOOR_LENGTH : WINDOW_LENGTH, high - low));
  const centre = horizontal ? point.x : point.y;
  const start = Math.max(low, Math.min(high - length, Math.round(centre - length / 2)));
  const id = type[0] + Math.random().toString(36).slice(2, 8);
  const feature: Feature = horizontal
    ? { id, type, x1: start, y1: wall.a[1], x2: start + length, y2: wall.a[1] }
    : { id, type, x1: wall.a[0], y1: start, x2: wall.a[0], y2: start + length };
  draft.features.push(feature);
  return feature;
}

/** A plain rectangular room centred on (cx, cy). */
export function newRoom(id: string, name: string, cx: number, cy: number): Room {
  return {
    id,
    name,
    pts: [
      [cx - NEW_ROOM_HALF_WIDTH, cy - NEW_ROOM_HALF_HEIGHT],
      [cx + NEW_ROOM_HALF_WIDTH, cy - NEW_ROOM_HALF_HEIGHT],
      [cx + NEW_ROOM_HALF_WIDTH, cy + NEW_ROOM_HALF_HEIGHT],
      [cx - NEW_ROOM_HALF_WIDTH, cy + NEW_ROOM_HALF_HEIGHT],
    ],
  };
}

/** Does corner i point into the room (a notch), rather than out? */
export function isReflexCorner(room: Room, index: number): boolean {
  const points = room.pts;
  const count = points.length;
  const a = points[(index - 1 + count) % count];
  const b = points[index];
  const c = points[(index + 1) % count];
  let doubledArea = 0;
  for (let k = 0; k < count; k++) {
    const p = points[k];
    const q = points[(k + 1) % count];
    doubledArea += p[0] * q[1] - q[0] * p[1];
  }
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  return Math.sign(cross) !== Math.sign(doubledArea);
}

/** Undo a notch at corner i: the room's corner squared off again. Returns the new
    corners, or null if that shape is not valid. */
export function fillCorner(room: Room, index: number): Point[] | null {
  const points = room.pts;
  const count = points.length;
  const startAt = (index - 1 + count) % count;
  const rotated = points.slice(startAt).concat(points.slice(0, startAt));
  const a = rotated[0];
  const c = rotated[2];
  const beforeA = rotated[count - 1];
  const afterC = rotated[3 % count];
  const corner: Point = [0, 0];
  if (beforeA[1] === a[1]) {
    corner[1] = a[1];
  } else {
    corner[0] = a[0];
  }
  if (c[1] === afterC[1]) {
    corner[1] = c[1];
  } else {
    corner[0] = c[0];
  }
  const cleaned = cleanPolygon([corner].concat(rotated.slice(3)));
  return isValidRoom(cleaned) ? cleaned : null;
}

/** Cut a square notch into corner i, making an L. Returns the new corners and
    the index of the notch's inner corner, or null if the corner is too small. */
export function cutCorner(
  room: Room,
  index: number,
): { pts: Point[]; vertex: number | null } | null {
  const points = room.pts;
  const count = points.length;
  const corner = points[index];
  const previous = points[(index - 1 + count) % count];
  const next = points[(index + 1) % count];
  const towardPrevious = [Math.sign(previous[0] - corner[0]), Math.sign(previous[1] - corner[1])];
  const towardNext = [Math.sign(next[0] - corner[0]), Math.sign(next[1] - corner[1])];
  const previousLength = Math.abs(previous[0] - corner[0]) + Math.abs(previous[1] - corner[1]);
  const nextLength = Math.abs(next[0] - corner[0]) + Math.abs(next[1] - corner[1]);
  const depth1 = Math.max(1, Math.min(MAX_CUT, Math.floor(previousLength / 2)));
  const depth2 = Math.max(1, Math.min(MAX_CUT, Math.floor(nextLength / 2)));
  const a: Point = [corner[0] + depth1 * towardPrevious[0], corner[1] + depth1 * towardPrevious[1]];
  const inner: Point = [a[0] + depth2 * towardNext[0], a[1] + depth2 * towardNext[1]];
  const c: Point = [corner[0] + depth2 * towardNext[0], corner[1] + depth2 * towardNext[1]];
  const cleaned = cleanPolygon(
    points.slice(0, index).concat([a, inner, c], points.slice(index + 1)),
  );
  if (!isValidRoom(cleaned)) {
    return null;
  }
  const vertex = cleaned.findIndex((p) => p[0] === inner[0] && p[1] === inner[1]);
  return { pts: cleaned, vertex: vertex < 0 ? null : vertex };
}

/** Remove a room and the windows/doors that were only on its walls. */
export function removeRoom(draft: Draft, room: Room): void {
  draft.features = draft.features.filter(
    (feature) =>
      !(
        isOnWall(feature, room.pts) &&
        !draft.rooms.some((other) => other.id !== room.id && isOnWall(feature, other.pts))
      ),
  );
  draft.rooms = draft.rooms.filter((other) => other.id !== room.id);
}

/** After dragging a room's corner or wall: tidy it, or say why it cannot be. */
export function tidyRoom(room: Room): { ok: boolean; cornersChanged: boolean } {
  const cleaned = cleanPolygon(room.pts);
  if (!isValidRoom(cleaned)) {
    return { ok: false, cornersChanged: false };
  }
  const cornersChanged = cleaned.length !== room.pts.length;
  room.pts = cleaned;
  return { ok: true, cornersChanged };
}
