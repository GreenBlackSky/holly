<!--
  The estate: the floor plan drawn as a blueprint, each room lit like a lamp
  by how its tasks are doing; tap a room to list its tasks. "Edit plan"
  opens the plan editor.
-->
<script lang="ts">
  import AddButton from '../components/AddButton.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import TaskRows from '../components/TaskRows.svelte';
  import { boundingBox } from '../lib/plan/geometry';
  import { renderPlan } from '../lib/plan/render';
  import {
    app,
    lamps,
    roomName,
    rooms,
    saveUi,
    ui,
    visibleTasks,
    WHOLE_HOME,
  } from '../lib/state.svelte';
  import { countLabel, groupStatus, sortKey } from '../lib/tasks';
  import { plural } from '../lib/text';

  const NO_TASKS_KEY = -2;
  /** Space around the plan, in plan units. */
  const PLAN_PADDING = 0.8;
  const MAX_CONTENT_WIDTH = 560;
  /** page gutters (2 × 16); the card's padding and border, plus the blueprint's padding */
  const PAGE_GUTTERS = 32;
  const CARD_INSET = 26 + 16;

  let windowWidth = $state(document.documentElement.clientWidth);

  const tasksIn = (roomId: string) => visibleTasks().filter((task) => task.room === roomId);

  /* if nothing valid is chosen, open the room with the most urgent task */
  $effect(() => {
    const all = rooms();
    if (ui.room && all.some((room) => room.id === ui.room)) {
      return;
    }
    let best: string | null = null;
    let bestKey = -1;
    for (const room of all) {
      const key = Math.max(NO_TASKS_KEY, ...tasksIn(room.id).map((task) => sortKey(task, app.now)));
      if (key > bestKey) {
        bestKey = key;
        best = room.id;
      }
    }
    ui.room = best ?? WHOLE_HOME.id;
  });

  const planRooms = $derived(app.plan?.rooms ?? []);
  const homeGroup = $derived(groupStatus(tasksIn(WHOLE_HOME.id), app.now));
  const list = $derived(tasksIn(ui.room ?? WHOLE_HOME.id));
  const lampCount = $derived(lamps());
  const lampLine = $derived(
    lampCount.total
      ? `Lamps lit in ${lampCount.lit} of ${lampCount.total} rooms`
      : 'No lamps lit yet',
  );

  const drawing = $derived.by(() => {
    /* re-measure the labels once the real font is in */
    void app.fontsLoaded;
    if (!planRooms.length) {
      return null;
    }
    const box = boundingBox(planRooms);
    const viewBox = [
      box.x0 - PLAN_PADDING,
      box.y0 - PLAN_PADDING,
      box.x1 - box.x0 + 2 * PLAN_PADDING,
      box.y1 - box.y0 + 2 * PLAN_PADDING,
    ];
    const ppu = (Math.min(MAX_CONTENT_WIDTH, windowWidth - PAGE_GUTTERS) - CARD_INSET) / viewBox[2];
    const svg = renderPlan({
      mode: 'view',
      rooms: planRooms,
      features: app.plan?.features ?? [],
      viewBox,
      ppu,
      selectedRoom: ui.room,
      status: (id) => groupStatus(tasksIn(id), app.now),
    });
    return { viewBox: viewBox.join(' '), svg };
  });

  function choose(id: string): void {
    ui.room = id;
    saveUi();
  }

  function onPlanClick(event: MouseEvent): void {
    const room = (event.target as Element).closest<SVGElement>('[data-room]');
    if (room?.dataset.room) {
      choose(room.dataset.room);
    }
  }

  function onPlanKey(event: KeyboardEvent): void {
    const target = event.target as SVGElement;
    if ((event.key === 'Enter' || event.key === ' ') && target.matches('g.room')) {
      event.preventDefault();
      choose(target.dataset.room ?? WHOLE_HOME.id);
    }
  }
</script>

<svelte:window onresize={() => (windowWidth = document.documentElement.clientWidth)} />

{#snippet footer()}
  <div class="plan-foot">
    <button
      class="chip"
      class:sel={ui.room === WHOLE_HOME.id}
      data-room={WHOLE_HOME.id}
      onclick={() => choose(WHOLE_HOME.id)}
    >
      <span class="dot s-{homeGroup.status}"></span>Whole home · {countLabel(homeGroup)}
    </button>
    <button class="btn" data-edit-plan onclick={() => (ui.overlay = { kind: 'editor' })}
      >Edit plan</button
    >
  </div>
{/snippet}

<ScreenHeader title="The estate" sub={app.loaded ? lampLine : null}>
  {#snippet extra()}<AddButton />{/snippet}
</ScreenHeader>

<div class="plan-card">
  {#if drawing}
    <div class="blueprint">
      <!-- the rooms inside are the buttons (role, tabindex, Enter); the svg only
           listens for them, so taps and keys are handled in one place -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <svg
        class="plan"
        viewBox={drawing.viewBox}
        role="group"
        aria-label="Floor plan"
        onclick={onPlanClick}
        onkeydown={onPlanKey}
      >
        {@html drawing.svg}
      </svg>
    </div>
    <div class="legend">
      <span><i class="swatch" style="background:var(--lamp-lit)"></i>lit</span>
      <span><i class="swatch" style="background:var(--lamp-low)"></i>burning low</span>
      <span><i class="swatch" style="background:var(--care)"></i>needs care</span>
      <span><i class="swatch"></i>dark</span>
      <span><i style="width:14px;height:4px;background:var(--window)"></i>window</span>
      <span><i style="width:14px;height:4px;background:var(--door)"></i>door</span>
    </div>
  {:else}
    <div class="empty">
      {app.planLoaded ? 'Draw your floor plan to see each room at a glance.' : 'Loading your plan…'}
    </div>
  {/if}
  {@render footer()}
</div>

<div class="section-title">
  <h2>{roomName(ui.room ?? WHOLE_HOME.id)}</h2>
  <span class="sub num">{plural(list.length, 'task')}</span>
</div>
<TaskRows {list} hideRoom emptyText="No tasks in this room yet." />
