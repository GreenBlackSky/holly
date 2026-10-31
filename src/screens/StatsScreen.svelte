<!--
  The ledger: six headline numbers (steps, on time, overdue, lamps lit,
  keys), steps per week, a calendar of cleaning days, rooms × kinds of work,
  steps by kind, the tasks most often late — and, at the bottom, saving and
  restoring a backup.
-->
<script lang="ts">
  import DataCard from '../components/DataCard.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import { keysEarned } from '../lib/house';
  import { plural } from '../lib/text';
  import { app, lamps, roomName, rooms, todayBudget, visibleTasks } from '../lib/state.svelte';
  import {
    axisFor,
    CHART_WEEKS,
    heatmap,
    HEATMAP_WEEKS,
    mostOftenLate,
    pointsByCategory,
    roomCategoryMatrix,
    shortDate,
    summary,
    weeklyPoints,
  } from '../lib/stats';
  import { countLabel } from '../lib/tasks';

  const numbers = $derived(summary(app.tasks, visibleTasks(), app.now));
  const lampCount = $derived(lamps());
  const keys = $derived(keysEarned(app.tasks, todayBudget()));
  const delta = $derived(numbers.thisWeek - numbers.lastWeek);
  const deltaText = $derived.by(() => {
    if (delta === 0) {
      return 'same as';
    }
    return Math.abs(delta) + (delta > 0 ? ' more than' : ' fewer than');
  });

  /* ---- points per week: a bar chart 360 × 148 ---- */
  const CHART = { x0: 28, x1: 352, y0: 12, y1: 128 };
  const MIN_CHART_MAX = 4;
  const weeks = $derived(weeklyPoints(app.tasks, app.now));
  const axis = $derived(axisFor(Math.max(MIN_CHART_MAX, ...weeks.map((week) => week.points))));
  const gridValues = $derived(
    Array.from({ length: axis.top / axis.step + 1 }, (_, i) => i * axis.step),
  );
  const barSlot = (CHART.x1 - CHART.x0) / CHART_WEEKS;
  const barWidth = barSlot - 6;
  const yOf = (value: number): number => CHART.y1 - (value / axis.top) * (CHART.y1 - CHART.y0);

  /* ---- calendar heatmap ---- */
  const CELL = 15;
  const GAP = 2.5;
  const HEAT_LEFT = 22;
  const HEAT_TOP = 14;
  const MIN_WEEKS_BETWEEN_MONTH_LABELS = 3;
  const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
  const cells = $derived(heatmap(app.tasks, app.now));
  const monthLabels = $derived.by(() => {
    const labels: Array<{ x: number; text: string }> = [];
    let lastMonth = -1;
    let lastLabelWeek = -9;
    for (const cell of cells) {
      const month = new Date(cell.day).getMonth();
      if (cell.weekday !== 0 || month === lastMonth) {
        continue;
      }
      lastMonth = month;
      if (cell.week - lastLabelWeek >= MIN_WEEKS_BETWEEN_MONTH_LABELS) {
        lastLabelWeek = cell.week;
        labels.push({
          x: HEAT_LEFT + cell.week * (CELL + GAP),
          text: new Date(cell.day).toLocaleDateString(undefined, { month: 'short' }),
        });
      }
    }
    return labels;
  });

  /* ---- rooms × categories ---- */
  const COLUMN = 30;
  const LABEL_WIDTH = 92;
  const ROW = 24;
  const roomList = $derived(rooms());
  const matrix = $derived(roomCategoryMatrix(app.tasks, app.categories, roomList, app.now));
  const matrixWidth = $derived(LABEL_WIDTH + roomList.length * COLUMN);

  /* ---- by category, most often late ---- */
  const byCategory = $derived(pointsByCategory(app.tasks, app.categories, app.now));
  const categoryMax = $derived(Math.max(1, ...byCategory.map((entry) => entry.points)));
  const late = $derived(mostOftenLate(app.tasks));
</script>

<ScreenHeader title="The ledger" />

<div class="kpis">
  <div class="kpi">
    <div class="kl">Steps this week</div>
    <div class="kv num">{numbers.thisWeek}</div>
    <div class="kd num">{numbers.thisWeekCount} tasks · {deltaText} last week</div>
  </div>
  <div class="kpi">
    <div class="kl">Steps in 30 days</div>
    <div class="kv num">{numbers.last30}</div>
    <div class="kd num">
      {numbers.last30Count} tasks · ≈ {(numbers.last30 / 30).toFixed(1)} a day
    </div>
  </div>
  <div class="kpi">
    <div class="kl">On time</div>
    <div class="kv num">{numbers.onTimePercent === null ? '—' : numbers.onTimePercent + '%'}</div>
    <div class="kd">
      {numbers.onTimePercent === null ? 'needs repeat completions' : 'of repeats, last 90 days'}
    </div>
  </div>
  <div class="kpi">
    <div class="kl">Overdue now</div>
    <div class="kv num" style="color:{numbers.overdue.late ? 'var(--late)' : 'var(--ok)'}">
      {numbers.overdue.late}
    </div>
    <div class="kd num">of {numbers.overdue.total} tasks</div>
  </div>
  <div class="kpi" data-lamps>
    <div class="kl">Lamps lit</div>
    <div class="kv num">
      {lampCount.lit}<span style="color:var(--ink-3)">/{lampCount.total}</span>
    </div>
    <div class="kd">rooms with nothing overdue</div>
  </div>
  <div class="kpi" data-keys>
    <div class="kl">Keys</div>
    <div class="kv num" style="color:var(--accent)">{keys}</div>
    <div class="kd num">{plural(keys, 'day')} with all {todayBudget()} steps walked</div>
  </div>
</div>

<div class="section-title">
  <h2>Steps per week</h2>
  <span class="sub">last 12 weeks</span>
</div>
<div class="card">
  <svg
    viewBox="0 0 360 148"
    width="100%"
    role="img"
    aria-label="Steps done per week, last 12 weeks"
  >
    {#each gridValues as value (value)}
      <line class="grid" x1={CHART.x0} x2={CHART.x1} y1={yOf(value)} y2={yOf(value)} />
      <text class="ax num" x={CHART.x0 - 6} y={yOf(value) + 3.5} text-anchor="end">{value}</text>
    {/each}
    {#each weeks as week, i (week.start)}
      {@const x = CHART.x0 + i * barSlot + 3}
      {@const isThisWeek = i === CHART_WEEKS - 1}
      <rect
        class="barf"
        {x}
        y={yOf(week.points)}
        width={barWidth}
        height={CHART.y1 - yOf(week.points)}
        rx="3"
        opacity={isThisWeek ? 1 : 0.75}
        ><title>Week of {shortDate(week.start)}: {week.points}</title></rect
      >
      {#if week.points && isThisWeek}
        <text
          class="ax num"
          x={x + barWidth / 2}
          y={yOf(week.points) - 4}
          text-anchor="middle"
          style="fill:var(--ink)">{week.points}</text
        >
      {/if}
      {#if i % 3 === 2 || i === 0}
        <text class="ax" x={x + barWidth / 2} y={CHART.y1 + 15} text-anchor="middle"
          >{isThisWeek ? 'this wk' : shortDate(week.start)}</text
        >
      {/if}
    {/each}
  </svg>
</div>

<div class="section-title">
  <h2>Cleaning days</h2>
  <span class="sub">darker = more tasks</span>
</div>
<div class="card">
  <svg
    viewBox="0 0 {HEAT_LEFT + HEATMAP_WEEKS * (CELL + GAP)} {HEAT_TOP + 7 * (CELL + GAP) + 4}"
    width="100%"
    style="max-width:340px"
    role="img"
    aria-label="Cleaning days calendar"
  >
    {#each DAY_LABELS as label, i (i)}
      {#if label}<text class="ax" x="0" y={HEAT_TOP + i * (CELL + GAP) + 11}>{label}</text>{/if}
    {/each}
    {#each monthLabels as label (label.x)}
      <text class="ax" x={label.x} y="10">{label.text}</text>
    {/each}
    {#each cells as cell (cell.day)}
      <rect
        class="hm{cell.level}"
        x={HEAT_LEFT + cell.week * (CELL + GAP)}
        y={HEAT_TOP + cell.weekday * (CELL + GAP)}
        width={CELL}
        height={CELL}
        rx="3"><title>{shortDate(cell.day)}: {cell.count}</title></rect
      >
    {/each}
  </svg>
</div>

<div class="section-title">
  <h2>Rooms × kinds of work</h2>
  <span class="sub">number = overdue</span>
</div>
<div class="card scroll-x">
  <svg
    viewBox="0 0 {matrixWidth} {22 + matrix.length * ROW}"
    width={matrixWidth}
    role="img"
    aria-label="Rooms by category"
  >
    {#each roomList as room, i (room.id)}
      <text class="ax" x={LABEL_WIDTH + i * COLUMN + COLUMN / 2 - 1} y="12" text-anchor="middle"
        >{room.short}</text
      >
    {/each}
    {#each matrix as row, j (row.category.id)}
      {@const y = 20 + j * ROW}
      <text class="ax" x="0" y={y + 15} style="fill:var(--ink-2);font-size:11px"
        >{row.category.name.replace(' and ', ' & ')}</text
      >
      {#each row.cells as cell, i (cell.room.id)}
        {@const x = LABEL_WIDTH + i * COLUMN}
        {#if cell.group}
          <rect
            class="mx-{cell.group.status}"
            x={x + 1}
            y={y + 1}
            width={COLUMN - 4}
            height={ROW - 3}
            rx="4"
            ><title>{roomName(cell.room.id)} · {row.category.name}: {countLabel(cell.group)}</title
            ></rect
          >
          <text
            class="mxt-{cell.group.status} num"
            x={x + COLUMN / 2 - 1}
            y={y + ROW / 2 + 4}
            text-anchor="middle"
            style="font-size:11px;font-weight:600">{cell.group.late || cell.group.soon || '✓'}</text
          >
        {:else}
          <circle class="mx-empty" cx={x + COLUMN / 2 - 1} cy={y + ROW / 2} r="1.6" />
        {/if}
      {/each}
    {/each}
  </svg>
</div>

<div class="section-title">
  <h2>Steps by kind of work</h2>
  <span class="sub">last 30 days</span>
</div>
<div class="card">
  {#each byCategory as entry (entry.category.id)}
    <div class="hbar">
      <span>{entry.category.name}</span>
      <span class="tr"><span style="width:{(entry.points / categoryMax) * 100}%"></span></span>
      <span class="v num">{entry.points}</span>
    </div>
  {/each}
</div>

<div class="section-title"><h2>Most often late</h2></div>
<div class="card">
  {#each late as entry (entry.task.id)}
    <div class="nl">
      <span
        >{entry.task.name}
        <span style="color:var(--ink-3)">· {roomName(entry.task.room)}</span></span
      >
      <span class="r num"
        >late {entry.late} of {entry.repeats} · avg {entry.averageRatio.toFixed(1)}×</span
      >
    </div>
  {:else}
    <div class="empty" style="padding:8px">
      Nothing yet. This fills in once tasks have been repeated a few times.
    </div>
  {/each}
</div>

<DataCard />
