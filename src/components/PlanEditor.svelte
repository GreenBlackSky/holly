<!--
  The floor-plan editor, full screen. Rooms are dragged by their body, walls
  by the bar handles, corners by the round ones; windows and doors snap to
  walls. Every change goes on an undo stack; nothing is saved until Save.

  Touches are handled by hand (pointer events) because a tap selects, a drag
  moves, and a drag on empty space pans the view. The SVG is redrawn as a
  string on every move, which is fast enough at this size.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clonePlan,
    cutCorner,
    dragCorner,
    dragFeature,
    dragFeatureEnd,
    dragRoom,
    dragWall,
    fillCorner,
    isReflexCorner,
    isTooShort,
    newRoom,
    parseHandle,
    placeFeature,
    removeRoom,
    snapIfLoose,
    tidyRoom,
    type Draft,
  } from '../lib/plan/edit';
  import { boundingBox, type Feature } from '../lib/plan/geometry';
  import { renderPlan, type EditorSelection } from '../lib/plan/render';
  import { app, savePlan, ui, type RoomDeletion } from '../lib/state.svelte';
  import { makeId } from '../lib/tasks';
  import { plural } from '../lib/text';
  import { dialog, dialogState } from '../lib/ui/dialog.svelte';
  import { toast } from '../lib/ui/toast.svelte';

  const UNDO_LIMIT = 100;
  /** A finger must move this many pixels before a tap becomes a drag. */
  const DRAG_THRESHOLD_PX = 7;
  /** Handles within this many pixels of a touch can be grabbed. */
  const GRAB_RADIUS_PX = 24;
  /** Prefer corners over walls when both are close (pixels of bias). */
  const WALL_HANDLE_BIAS = 4;
  const FEATURE_BODY_BIAS = -2;
  const ZOOM_STEP = 1.4;
  const MIN_VIEW = 8;
  const MAX_VIEW = 400;
  const FIT_PADDING = 4;

  /* ---- editor state: plain objects, redrawn by hand ---- */
  let draft: Draft = clonePlan({
    rooms: app.plan?.rooms ?? [],
    features: app.plan?.features ?? [],
    deletions: [],
  });
  const undoStack: string[] = [];
  let redoStack: string[] = [];
  let selection: EditorSelection = {};
  let viewBox = [0, 0, 60, 50];

  interface Drag {
    handle: string;
    start: { x: number; y: number };
    clientX: number;
    clientY: number;
    snapshot: string;
    startViewBox: number[];
    ppu: number;
    moved: boolean;
  }
  let drag: Drag | null = null;

  /* ---- what the template shows ---- */
  let placing = $state<Feature['type'] | null>(null);
  let hint = $state('');
  let cutLabel = $state('Cut corner');
  let saving = $state(false);
  /* the drawing, as SVG markup, and its viewBox */
  let markup = $state('');
  let viewBoxText = $state('0 0 60 50');
  let canvas: HTMLDivElement;
  let svg: SVGSVGElement;

  function canvasSize(): { w: number; h: number } {
    return { w: canvas?.clientWidth || 320, h: canvas?.clientHeight || 320 };
  }

  function pixelsPerUnit(): number {
    const { w, h } = canvasSize();
    return Math.min(w / viewBox[2], h / viewBox[3]);
  }

  function fit(): void {
    const box = boundingBox(draft.rooms);
    let width = box.x1 - box.x0 + 2 * FIT_PADDING;
    let height = box.y1 - box.y0 + 2 * FIT_PADDING;
    const { w, h } = canvasSize();
    if (width / height < w / h) {
      width = (height * w) / h;
    } else {
      height = (width * h) / w;
    }
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    viewBox = [cx - width / 2, cy - height / 2, width, height];
  }

  function zoom(factor: number): void {
    const [x, y, width, height] = viewBox;
    const newWidth = Math.min(MAX_VIEW, Math.max(MIN_VIEW, width / factor));
    const newHeight = (newWidth * height) / width;
    viewBox = [x + width / 2 - newWidth / 2, y + height / 2 - newHeight / 2, newWidth, newHeight];
    redraw();
  }

  function selectedRoom() {
    return selection.room ? draft.rooms.find((room) => room.id === selection.room) : undefined;
  }

  function hintText(): string {
    if (placing) {
      return `Tap a wall to place the ${placing}. Tap + ${placing === 'window' ? 'Window' : 'Door'} again to cancel.`;
    }
    if (selection.feat) {
      return 'Drag it along a wall, or onto another wall. It sticks to the nearest wall. Drag the round ends to resize.';
    }
    const room = selectedRoom();
    if (room && selection.vertex != null) {
      return isReflexCorner(room, selection.vertex)
        ? 'Drag this corner, or tap Fill corner to undo the notch.'
        : 'Drag this corner, or tap Cut corner to notch it into an L.';
    }
    if (selection.room) {
      return 'Drag ● corners or ▬ walls. Drag inside the room to move it. Tap a corner to select it.';
    }
    return draft.rooms.length
      ? 'Tap a room, window or door to edit it. Drag empty space to move around.'
      : 'Tap + Room to start your plan.';
  }

  /** Draw everything again from the draft. */
  function redraw(): void {
    if (!svg) {
      return;
    }
    const { w, h } = canvasSize();
    const ppu = Math.min(w / viewBox[2], h / viewBox[3]);
    /* stretch the view box to the canvas's shape, keeping its centre */
    const viewWidth = w / ppu;
    const viewHeight = h / ppu;
    viewBox = [
      viewBox[0] + viewBox[2] / 2 - viewWidth / 2,
      viewBox[1] + viewBox[3] / 2 - viewHeight / 2,
      viewWidth,
      viewHeight,
    ];
    viewBoxText = viewBox.join(' ');
    markup = renderPlan({
      mode: 'edit',
      rooms: draft.rooms,
      features: draft.features,
      viewBox,
      ppu,
      selection,
    });
    hint = hintText();
    const room = selectedRoom();
    cutLabel =
      room && selection.vertex != null && isReflexCorner(room, selection.vertex)
        ? 'Fill corner'
        : 'Cut corner';
  }

  /* ---- undo ---- */

  function pushUndo(previous: string): void {
    undoStack.push(previous);
    if (undoStack.length > UNDO_LIMIT) {
      undoStack.shift();
    }
    redoStack = [];
  }

  function dropStaleSelection(): void {
    if (selection.room && !draft.rooms.some((room) => room.id === selection.room)) {
      selection = {};
    }
    if (selection.feat && !draft.features.some((feature) => feature.id === selection.feat)) {
      selection = {};
    }
    selection.vertex = null;
  }

  function undo(): void {
    const previous = undoStack.pop();
    if (!previous) {
      toast('Nothing to undo');
      return;
    }
    redoStack.push(JSON.stringify(draft));
    draft = JSON.parse(previous);
    dropStaleSelection();
    redraw();
  }

  function redo(): void {
    const next = redoStack.pop();
    if (!next) {
      toast('Nothing to redo');
      return;
    }
    undoStack.push(JSON.stringify(draft));
    draft = JSON.parse(next);
    dropStaleSelection();
    redraw();
  }

  /* ---- touches ---- */

  function toWorld(event: PointerEvent): { x: number; y: number } {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const world = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: world.x, y: world.y };
  }

  /** The handle under the finger: the nearest one to the touch, not the topmost. */
  function grabbedHandle(event: PointerEvent): string {
    const element = (event.target as Element).closest?.('[data-h]') as SVGElement | null;
    const touched = element?.dataset.h ?? '';
    const world = toWorld(event);
    const ppu = pixelsPerUnit();
    const candidates: Array<{ handle: string; x: number; y: number; bias: number }> = [];
    const room = selectedRoom();
    if (room) {
      const count = room.pts.length;
      room.pts.forEach((point, i) => {
        const next = room.pts[(i + 1) % count];
        candidates.push({ handle: 'v:' + i, x: point[0], y: point[1], bias: 0 });
        candidates.push({
          handle: 'e:' + i,
          x: (point[0] + next[0]) / 2,
          y: (point[1] + next[1]) / 2,
          bias: WALL_HANDLE_BIAS,
        });
      });
    }
    const feature = selection.feat
      ? draft.features.find((other) => other.id === selection.feat)
      : undefined;
    if (feature) {
      candidates.push({ handle: `fe:${feature.id}:0`, x: feature.x1, y: feature.y1, bias: 0 });
      candidates.push({ handle: `fe:${feature.id}:1`, x: feature.x2, y: feature.y2, bias: 0 });
      candidates.push({
        handle: `f:${feature.id}`,
        x: (feature.x1 + feature.x2) / 2,
        y: (feature.y1 + feature.y2) / 2,
        bias: FEATURE_BODY_BIAS,
      });
    }
    let best: { distance: number; handle: string } | null = null;
    for (const candidate of candidates) {
      const distance =
        Math.hypot(candidate.x - world.x, candidate.y - world.y) * ppu + candidate.bias;
      if (distance <= GRAB_RADIUS_PX && (!best || distance < best.distance)) {
        best = { distance, handle: candidate.handle };
      }
    }
    /* touching a different window/door than the selected one grabs that one */
    const grabsOtherFeature = touched.startsWith('f:') && touched.slice(2) !== selection.feat;
    return best && !grabsOtherFeature ? best.handle : touched;
  }

  function onPointerDown(event: PointerEvent): void {
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      /* some browsers refuse capture on synthetic events */
    }
    drag = {
      handle: grabbedHandle(event),
      start: toWorld(event),
      clientX: event.clientX,
      clientY: event.clientY,
      snapshot: JSON.stringify(draft),
      startViewBox: viewBox.slice(),
      ppu: pixelsPerUnit(),
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent): void {
    const current = drag;
    if (!current) {
      return;
    }
    const movedX = event.clientX - current.clientX;
    const movedY = event.clientY - current.clientY;
    if (!current.moved && Math.hypot(movedX, movedY) < DRAG_THRESHOLD_PX) {
      return;
    }
    current.moved = true;
    const { kind, a, b } = parseHandle(current.handle);
    const worldX = movedX / current.ppu;
    const worldY = movedY / current.ppu;
    const dx = Math.round(worldX);
    const dy = Math.round(worldY);
    const movesGeometry =
      ((kind === 'v' || kind === 'e') && selection.room) ||
      (kind === 'r' && a === selection.room) ||
      kind === 'f' ||
      kind === 'fe';
    if (!movesGeometry || placing) {
      /* pan the view */
      viewBox = [
        current.startViewBox[0] - worldX,
        current.startViewBox[1] - worldY,
        current.startViewBox[2],
        current.startViewBox[3],
      ];
      redraw();
      return;
    }
    /* always start from the plan as it was when the finger went down */
    const working: Draft = JSON.parse(current.snapshot);
    if (kind === 'f' || kind === 'fe') {
      const feature = working.features.find((other) => other.id === a);
      if (!feature) {
        return;
      }
      selection = { feat: a };
      if (kind === 'f') {
        dragFeature(feature, working.rooms, worldX, worldY);
      } else {
        dragFeatureEnd(feature, b, dx, dy);
      }
    } else {
      const room = working.rooms.find((other) => other.id === selection.room);
      if (!room) {
        return;
      }
      if (kind === 'r') {
        dragRoom(room, working.features, dx, dy);
      } else if (kind === 'e') {
        dragWall(room, working.features, Number(a), dx, dy);
      } else if (kind === 'v') {
        dragCorner(room, working.features, Number(a), dx, dy);
        selection.vertex = Number(a);
      }
    }
    draft = working;
    redraw();
  }

  function onPointerUp(): void {
    const finished = drag;
    drag = null;
    if (!finished) {
      return;
    }
    const { kind, a } = parseHandle(finished.handle);
    if (!finished.moved) {
      onTap(kind, a, finished.start);
      return;
    }
    if (JSON.stringify(draft) === finished.snapshot) {
      return;
    }
    if (!['v', 'e', 'r', 'f', 'fe'].includes(kind)) {
      return;
    }
    const revert = (message: string): void => {
      draft = JSON.parse(finished.snapshot);
      toast(message);
      redraw();
    };
    if (kind === 'f' || kind === 'fe') {
      const feature = draft.features.find((other) => other.id === a);
      if (feature && kind === 'f') {
        snapIfLoose(feature, draft.rooms);
      }
      if (feature && isTooShort(feature, kind === 'fe')) {
        revert('Too short');
        return;
      }
    } else {
      const room = selectedRoom();
      if (room) {
        const result = tidyRoom(room);
        if (!result.ok) {
          revert('That would make walls cross. Try a smaller move.');
          return;
        }
        if (result.cornersChanged) {
          selection.vertex = null;
        }
      }
    }
    pushUndo(finished.snapshot);
    redraw();
  }

  function onPointerCancel(): void {
    if (drag?.moved) {
      draft = JSON.parse(drag.snapshot);
    }
    drag = null;
    redraw();
  }

  function onTap(kind: string, a: string, point: { x: number; y: number }): void {
    if (placing) {
      const previous = JSON.stringify(draft);
      const feature = placeFeature(draft, placing, point);
      if (!feature) {
        toast('Tap closer to a wall');
        return;
      }
      pushUndo(previous);
      placing = null;
      selection = { feat: feature.id };
      redraw();
      return;
    }
    if (kind === 'v') {
      selection.vertex = selection.vertex === Number(a) ? null : Number(a);
    } else if (kind === 'e') {
      /* a tap on a wall handle does nothing; dragging it moves the wall */
    } else if (kind === 'r') {
      selection = { room: a, vertex: null };
    } else if (kind === 'f' || kind === 'fe') {
      selection = { feat: a };
    } else {
      selection = {};
    }
    redraw();
  }

  /* ---- toolbar ---- */

  function togglePlacing(type: Feature['type']): void {
    placing = placing === type ? null : type;
    redraw();
  }

  async function addRoom(): Promise<void> {
    const result = await dialog({
      title: 'New room',
      input: '',
      actions: [
        { label: 'Cancel', value: false },
        { label: 'Add room', value: true, kind: 'primary' },
      ],
    });
    if (!result.value) {
      return;
    }
    const name = result.text || 'Room';
    const cx = Math.round(viewBox[0] + viewBox[2] / 2);
    const cy = Math.round(viewBox[1] + viewBox[3] / 2);
    const previous = JSON.stringify(draft);
    const room = newRoom(makeId(name, 24, 4, 'room'), name, cx, cy);
    draft.rooms.push(room);
    pushUndo(previous);
    selection = { room: room.id };
    placing = null;
    redraw();
  }

  function cutOrFill(): void {
    const room = selectedRoom();
    if (!room || selection.vertex == null) {
      toast(room ? 'Tap a corner of the room first' : 'Select a room, then tap one of its corners');
      return;
    }
    const previous = JSON.stringify(draft);
    if (isReflexCorner(room, selection.vertex)) {
      const filled = fillCorner(room, selection.vertex);
      if (!filled) {
        toast('This corner can’t be filled in');
        return;
      }
      room.pts = filled;
      selection.vertex = null;
    } else {
      const cut = cutCorner(room, selection.vertex);
      if (!cut) {
        toast('This corner is too small to cut');
        return;
      }
      room.pts = cut.pts;
      selection.vertex = cut.vertex;
    }
    pushUndo(previous);
    redraw();
  }

  async function rename(): Promise<void> {
    const room = selectedRoom();
    if (!room) {
      toast('Select a room first');
      return;
    }
    const result = await dialog({
      title: 'Rename room',
      input: room.name,
      actions: [
        { label: 'Cancel', value: false },
        { label: 'Save', value: true, kind: 'primary' },
      ],
    });
    if (!result.value || !result.text || result.text === room.name) {
      return;
    }
    const previous = JSON.stringify(draft);
    room.name = result.text;
    pushUndo(previous);
    redraw();
  }

  async function remove(): Promise<void> {
    if (selection.feat) {
      const previous = JSON.stringify(draft);
      draft.features = draft.features.filter((feature) => feature.id !== selection.feat);
      pushUndo(previous);
      selection = {};
      redraw();
      return;
    }
    const room = selectedRoom();
    if (!room) {
      toast('Select a room, window or door first');
      return;
    }
    const taskCount = app.tasks.filter((task) => task.room === room.id).length;
    let action: RoomDeletion['action'] | null = null;
    if (taskCount) {
      const result = await dialog({
        title: `Delete ${room.name}?`,
        text: `It has ${plural(taskCount, 'task')}. What should happen to ${taskCount > 1 ? 'them' : 'it'}?`,
        actions: [
          { label: 'Cancel', value: null },
          { label: 'Move to Whole home', value: 'home' },
          { label: 'Delete tasks', value: 'delete', kind: 'danger' },
        ],
      });
      if (!result.value) {
        return;
      }
      action = result.value as RoomDeletion['action'];
    } else {
      const result = await dialog({
        title: `Delete ${room.name}?`,
        actions: [
          { label: 'Cancel', value: false },
          { label: 'Delete', value: true, kind: 'danger' },
        ],
      });
      if (!result.value) {
        return;
      }
    }
    const previous = JSON.stringify(draft);
    removeRoom(draft, room);
    if (action) {
      draft.deletions.push({ id: room.id, action });
    }
    pushUndo(previous);
    selection = {};
    redraw();
  }

  async function save(): Promise<void> {
    saving = true;
    if (await savePlan(draft, draft.deletions)) {
      ui.overlay = null;
      toast('Plan saved');
    } else {
      saving = false;
    }
  }

  async function cancel(): Promise<void> {
    if (undoStack.length) {
      const result = await dialog({
        title: 'Discard changes?',
        text: 'Your edits to the plan will be lost.',
        actions: [
          { label: 'Keep editing', value: false },
          { label: 'Discard', value: true, kind: 'danger' },
        ],
      });
      if (!result.value) {
        return;
      }
    }
    ui.overlay = null;
  }

  onMount(() => {
    requestAnimationFrame(() => {
      fit();
      redraw();
    });
  });
</script>

<svelte:window onresize={redraw} />

<!-- hidden while a question box is open, the way the original did -->
<div
  class="ed"
  role="dialog"
  aria-modal="true"
  aria-label="Edit plan"
  hidden={!!dialogState.current}
>
  <div class="ed-top">
    <button class="btn" id="ed-cancel" onclick={cancel}>Cancel</button>
    <h2>Edit plan</h2>
    <button class="btn primary" id="ed-save" disabled={saving} onclick={save}
      >{saving ? 'Saving…' : 'Save'}</button
    >
  </div>
  <div class="ed-canvas" id="ed-canvas" bind:this={canvas}>
    <svg
      id="ed-svg"
      xmlns="http://www.w3.org/2000/svg"
      bind:this={svg}
      viewBox={viewBoxText}
      role="application"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}>{@html markup}</svg
    >
    <div class="ed-zoom">
      <button id="ed-zin" aria-label="Zoom in" onclick={() => zoom(ZOOM_STEP)}>+</button>
      <button id="ed-zout" aria-label="Zoom out" onclick={() => zoom(1 / ZOOM_STEP)}>−</button>
      <button
        id="ed-fit"
        onclick={() => {
          fit();
          redraw();
        }}>Fit</button
      >
    </div>
  </div>
  <div class="ed-hint" id="ed-hint">{hint}</div>
  <div class="ed-tools">
    <button class="btn" id="ed-add" onclick={addRoom}>+ Room</button>
    <button class="btn" id="ed-cut" onclick={cutOrFill}>{cutLabel}</button>
    <button
      class="btn"
      class:on={placing === 'window'}
      id="ed-win"
      onclick={() => togglePlacing('window')}>+ Window</button
    >
    <button
      class="btn"
      class:on={placing === 'door'}
      id="ed-door"
      onclick={() => togglePlacing('door')}>+ Door</button
    >
    <button class="btn" id="ed-rename" onclick={rename}>Rename</button>
    <button class="btn" id="ed-undo" onclick={undo}>Undo</button>
    <button class="btn" id="ed-redo" onclick={redo}>Redo</button>
    <button class="btn danger" id="ed-del" onclick={remove}>Delete</button>
  </div>
</div>
