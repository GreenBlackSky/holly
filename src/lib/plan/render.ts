import { countLabel, type GroupStatus } from '../tasks';
import { esc } from '../text';
import { placeLabel, polygonPath, type Feature, type Room } from './geometry';

/* Draws the floor plan as SVG markup (a string), for the Rooms tab and for
   the plan editor. Sizes are given in screen pixels and divided by `ppu`
   (pixels per plan unit), so text and handles stay the same size on screen
   however far you zoom. */

/** Label font sizes in screen pixels: room name, and the count under it. */
const NAME_FONT_PX = 11.5;
const COUNT_FONT_PX = 10.5;
/** Windows and doors are drawn this thick, in screen pixels. */
const FEATURE_THICKNESS_PX = 5;
/** Touch targets: at least this big, in screen pixels. */
const HIT_RADIUS_PX = 20;
const LABEL_MARGIN = 0.35;
/* room labels are typewritten, like notes on a blueprint */
const FONT_STACK = '"Courier Prime", ui-monospace, "Courier New", monospace';
const NAME_WEIGHT = 700;
const COUNT_WEIGHT = 400;
/** Canvas measurements run slightly narrow compared with SVG text. */
const MEASURE_FUDGE = 1.04;
const FALLBACK_CHAR_WIDTH = 0.62;

let measureContext: CanvasRenderingContext2D | null = null;

/** Width of a piece of text in pixels, as the browser would draw it. */
function measureText(text: string, px: number, weight: number): number {
  try {
    measureContext ??= document.createElement('canvas').getContext('2d');
    if (!measureContext) {
      throw new Error('no canvas');
    }
    measureContext.font = `${weight} ${px}px ${FONT_STACK}`;
    return measureContext.measureText(text).width * MEASURE_FUDGE;
  } catch {
    return text.length * px * FALLBACK_CHAR_WIDTH;
  }
}

export interface EditorSelection {
  room?: string;
  feat?: string;
  vertex?: number | null;
}

export interface PlanDrawing {
  mode: 'view' | 'edit';
  rooms: Room[];
  features: Feature[];
  /** the viewBox [x, y, width, height], in plan units */
  viewBox: number[];
  /** pixels per plan unit */
  ppu: number;
  /** view mode: the selected room and each room's status */
  selectedRoom?: string | null;
  status?: (roomId: string) => GroupStatus;
  /** edit mode: what is selected */
  selection?: EditorSelection;
}

interface LabelVariant {
  kind: 'one' | 'two';
  name: string;
  sub: string;
  /** scale factor on the font sizes */
  scale: number;
  w: number;
  h: number;
}

/** Build the possible labels for a room, longest first; the first that fits wins. */
function labelVariants(
  name: string,
  full: string,
  short: string,
  edit: boolean,
  ppu: number,
): LabelVariant[] {
  const nameSize = NAME_FONT_PX / ppu;
  const countSize = COUNT_FONT_PX / ppu;
  const textWidth = (text: string, size: number): number => {
    if (!text) {
      return 0;
    }
    const weight = size === countSize ? COUNT_WEIGHT : NAME_WEIGHT;
    return measureText(text, size * ppu, weight) / ppu + 0.25 * size;
  };
  const variants: LabelVariant[] = [];
  /* name above, count below */
  const twoLines = (line1: string, line2: string, scale: number): void => {
    variants.push({
      kind: 'two',
      name: line1,
      sub: line2,
      scale,
      w: Math.max(textWidth(line1, nameSize * scale), textWidth(line2, countSize * scale)),
      h: 2.35 * nameSize * scale,
    });
  };
  /* name and count side by side */
  const oneLine = (text: string, sub: string, scale: number): void => {
    const subWidth = sub ? textWidth(sub, countSize * scale) + 0.35 * nameSize * scale : 0;
    variants.push({
      kind: 'one',
      name: text,
      sub,
      scale,
      w: textWidth(text, nameSize * scale) + subWidth,
      h: 1.25 * nameSize * scale,
    });
  };
  const firstWord = name.split(' ')[0];
  const threeLetters = name.slice(0, 3);
  if (edit) {
    oneLine(name, '', 1);
    oneLine(firstWord, '', 1);
    oneLine(firstWord, '', 0.8);
    oneLine(threeLetters, '', 0.8);
  } else {
    twoLines(name, full, 1);
    twoLines(name, short, 1);
    oneLine(name, short, 1);
    twoLines(firstWord, short, 1);
    oneLine(firstWord, short, 1);
    oneLine(name, short, 0.82);
    oneLine(firstWord, short, 0.82);
    oneLine(threeLetters, short, 0.82);
    oneLine('', short, 0.9);
  }
  return variants;
}

function roomLabel(room: Room, variants: LabelVariant[], edit: boolean, ppu: number): string {
  const spot = placeLabel(room.pts, variants, edit ? 1 : 0.5, LABEL_MARGIN);
  if (!spot) {
    return '';
  }
  const variant = variants[spot.variant];
  const nameSize = (NAME_FONT_PX / ppu) * variant.scale;
  const countSize = (COUNT_FONT_PX / ppu) * variant.scale;
  if (variant.kind === 'two') {
    return (
      `<text class="rl" x="${spot.x}" y="${spot.y - 0.18 * nameSize}" text-anchor="middle" style="font-size:${nameSize}px">${esc(variant.name)}</text>` +
      `<text class="rc num" x="${spot.x}" y="${spot.y + 0.98 * nameSize}" text-anchor="middle" style="font-size:${countSize}px">${esc(variant.sub)}</text>`
    );
  }
  const namePart = variant.name ? `<tspan class="rl">${esc(variant.name)}</tspan>` : '';
  const gap = variant.name ? 0.35 * nameSize : 0;
  const subPart = variant.sub
    ? `<tspan class="rc num" dx="${gap}" style="font-size:${countSize}px">${esc(variant.sub)}</tspan>`
    : '';
  return `<text x="${spot.x}" y="${spot.y + 0.36 * nameSize}" text-anchor="middle" style="font-size:${nameSize}px">${namePart}${subPart}</text>`;
}

function drawRoom(room: Room, drawing: PlanDrawing): string {
  const edit = drawing.mode === 'edit';
  const name = room.name || 'Room';
  let className: string;
  let attributes: string;
  let full = '';
  let short = '';
  if (edit) {
    className = 'eroom' + (drawing.selection?.room === room.id ? ' esel' : '');
    attributes = `data-h="r:${esc(room.id)}"`;
  } else {
    const group = drawing.status!(room.id);
    className = `room s-${group.status}${drawing.selectedRoom === room.id ? ' sel' : ''}`;
    attributes = `data-room="${esc(room.id)}" tabindex="0" role="button" aria-label="${esc(name)}, ${esc(countLabel(group))}"`;
    full = countLabel(group);
    short = group.total ? String(group.late || group.soon || '✓') : '';
  }
  /* capitals on the plan, as on a blueprint; the editor shows names as typed */
  const shown = edit ? name : name.toUpperCase();
  const variants = labelVariants(shown, full, short, edit, drawing.ppu);
  const label = roomLabel(room, variants, edit, drawing.ppu);
  return `<g class="${className}" ${attributes}><path class="shape" vector-effect="non-scaling-stroke" d="${polygonPath(room.pts)}"/>${label}</g>`;
}

function drawFeature(feature: Feature, drawing: PlanDrawing): string {
  const edit = drawing.mode === 'edit';
  const thickness = FEATURE_THICKNESS_PX / drawing.ppu;
  const horizontal = feature.y1 === feature.y2;
  const x = Math.min(feature.x1, feature.x2);
  const y = Math.min(feature.y1, feature.y2);
  const length = horizontal ? Math.abs(feature.x2 - feature.x1) : Math.abs(feature.y2 - feature.y1);
  const selected = edit && drawing.selection?.feat === feature.id;
  /* a bar along the feature, `width` thick across it */
  const bar = (className: string, width: number, extra = ''): string =>
    horizontal
      ? `<rect class="${className}" ${extra} x="${x}" y="${y - width / 2}" width="${length}" height="${width}"/>`
      : `<rect class="${className}" ${extra} x="${x - width / 2}" y="${y}" width="${width}" height="${length}"/>`;
  let svg = '';
  if (feature.type === 'window') {
    svg += bar('win' + (selected ? ' fsel' : ''), thickness);
  } else {
    /* a door: a gap in the wall, a bar, and a short jamb at each end */
    svg += bar('gap', thickness * 1.3);
    svg += bar('dbar' + (selected ? ' fsel' : ''), thickness);
    const jamb = thickness * 1.8;
    const jambWidth = thickness * 0.5;
    svg += horizontal
      ? `<rect class="dbar" x="${x}" y="${y - jamb / 2}" width="${jambWidth}" height="${jamb}"/><rect class="dbar" x="${x + length - jambWidth}" y="${y - jamb / 2}" width="${jambWidth}" height="${jamb}"/>`
      : `<rect class="dbar" x="${x - jamb / 2}" y="${y}" width="${jamb}" height="${jambWidth}"/><rect class="dbar" x="${x - jamb / 2}" y="${y + length - jambWidth}" width="${jamb}" height="${jambWidth}"/>`;
  }
  if (edit) {
    svg += bar(
      'hit',
      Math.max(thickness * 3, HIT_RADIUS_PX / drawing.ppu),
      `data-h="f:${esc(feature.id)}"`,
    );
  }
  return svg;
}

/** Round handles at both ends of the selected window or door. */
function featureHandles(feature: Feature, ppu: number): string {
  const ends: Array<[number, number]> = [
    [feature.x1, feature.y1],
    [feature.x2, feature.y2],
  ];
  return ends
    .map(
      ([cx, cy], end) =>
        `<circle class="hit" data-h="fe:${esc(feature.id)}:${end}" cx="${cx}" cy="${cy}" r="${HIT_RADIUS_PX / ppu}"/>` +
        `<circle class="hv" data-h="fe:${esc(feature.id)}:${end}" vector-effect="non-scaling-stroke" cx="${cx}" cy="${cy}" r="${8 / ppu}"/>`,
    )
    .join('');
}

/** Bar handles on every wall and round handles on every corner of the selected room. */
function roomHandles(room: Room, selectedVertex: number | null | undefined, ppu: number): string {
  const count = room.pts.length;
  let svg = '';
  room.pts.forEach((a, i) => {
    const b = room.pts[(i + 1) % count];
    const horizontal = a[1] === b[1];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const width = (horizontal ? 18 : 9) / ppu;
    const height = (horizontal ? 9 : 18) / ppu;
    const hitWidth = (horizontal ? 44 : 32) / ppu;
    const hitHeight = (horizontal ? 32 : 44) / ppu;
    svg +=
      `<rect class="hit" data-h="e:${i}" x="${mx - hitWidth / 2}" y="${my - hitHeight / 2}" width="${hitWidth}" height="${hitHeight}"/>` +
      `<rect class="he" data-h="e:${i}" x="${mx - width / 2}" y="${my - height / 2}" width="${width}" height="${height}" rx="${3 / ppu}"/>`;
  });
  room.pts.forEach(([cx, cy], i) => {
    svg +=
      `<circle class="hit" data-h="v:${i}" cx="${cx}" cy="${cy}" r="${HIT_RADIUS_PX / ppu}"/>` +
      `<circle class="hv${selectedVertex === i ? ' on' : ''}" data-h="v:${i}" vector-effect="non-scaling-stroke" cx="${cx}" cy="${cy}" r="${8.5 / ppu}"/>`;
  });
  return svg;
}

/** The editor's background grid: every unit, or every other when zoomed out. */
function grid(viewBox: number[], ppu: number): string {
  const ZOOMED_OUT_PPU = 9;
  const step = ppu < ZOOMED_OUT_PPU ? 2 : 1;
  const PAD = 400;
  return (
    `<defs><pattern id="edg" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0H0V${step}" fill="none" class="gridl" stroke-width="${0.8 / ppu}"/></pattern></defs>` +
    `<rect x="${viewBox[0] - PAD}" y="${viewBox[1] - PAD}" width="${viewBox[2] + 2 * PAD}" height="${viewBox[3] + 2 * PAD}" fill="url(#edg)"/>`
  );
}

/** The whole plan as SVG markup, to go inside an <svg> with the given viewBox. */
export function renderPlan(drawing: PlanDrawing): string {
  const edit = drawing.mode === 'edit';
  const selection = drawing.selection ?? {};
  let svg = edit ? grid(drawing.viewBox, drawing.ppu) : '';
  for (const room of drawing.rooms) {
    svg += drawRoom(room, drawing);
  }
  for (const feature of drawing.features) {
    svg += drawFeature(feature, drawing);
  }
  if (edit && selection.feat) {
    const feature = drawing.features.find((f) => f.id === selection.feat);
    if (feature) {
      svg += featureHandles(feature, drawing.ppu);
    }
  }
  if (edit && selection.room) {
    const room = drawing.rooms.find((r) => r.id === selection.room);
    if (room) {
      svg += roomHandles(room, selection.vertex, drawing.ppu);
    }
  }
  return svg;
}
