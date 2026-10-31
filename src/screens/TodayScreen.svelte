<!--
  Draft the day: the tasks picked for today to fill the budget of steps, a
  note from the staff, a progress bar, and buttons to redraft the pick or add
  a task by hand.
-->
<script lang="ts">
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import StaffNote from '../components/StaffNote.svelte';
  import TaskRows from '../components/TaskRows.svelte';
  import { dayNumber, staffNote } from '../lib/house';
  import {
    app,
    askBudget,
    lamps,
    pointsSum,
    roomName,
    shuffleToday,
    taskById,
    todayBudget,
    todayIds,
    ui,
    visibleTasks,
    WHOLE_HOME,
  } from '../lib/state.svelte';
  import { sortByUrgency, statusFor, type Task } from '../lib/tasks';
  import { doneToday } from '../lib/today';

  const items = $derived(
    todayIds()
      .map(taskById)
      .filter((task): task is Task => Boolean(task)),
  );
  const budget = $derived(todayBudget());
  const doneSinceMidnight = $derived(app.tasks.filter((task) => doneToday(task, app.now)));
  const donePoints = $derived(pointsSum(doneSinceMidnight));
  const planned = $derived(pointsSum(items));
  const left = $derived(items.filter((task) => !doneToday(task, app.now)));
  const date = $derived(
    new Date(app.now).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );
  const progress = $derived(Math.min(100, budget ? (donePoints / budget) * 100 : 0));
  const day = $derived(dayNumber(app.tasks, app.now));

  /** the room of the most overdue task, for the morning note */
  const waitingRoom = $derived.by(() => {
    const worst = sortByUrgency(visibleTasks(), app.now)[0];
    if (!worst || statusFor(worst, app.now) !== 'late') {
      return null;
    }
    return worst.room === WHOLE_HOME.id ? 'The whole house' : roomName(worst.room);
  });

  const note = $derived(
    staffNote({
      day,
      hasTasks: app.tasks.length > 0,
      todayCount: items.length,
      leftCount: left.length,
      doneSinceMidnight: doneSinceMidnight.length > 0,
      waitingRoom,
      lamps: lamps(),
    }),
  );
</script>

<ScreenHeader title="Draft the day" kicker="DAY {day}" sub={date} subClass="date-sub">
  {#snippet extra()}
    <button class="btn" data-budget style="white-space:nowrap;flex:none" onclick={askBudget}
      >{budget} steps</button
    >
  {/snippet}
</ScreenHeader>

{#if app.loaded}<StaffNote {note} {day} />{/if}

<div class="prog">
  <div class="prog-bar"><span style="width:{progress}%"></span></div>
  <div class="prog-text num">
    {donePoints} of {budget} steps done{planned > budget ? ` · ${planned} planned` : ''}
  </div>
</div>

<TaskRows
  list={items}
  today
  emptyText={app.loaded ? 'Nothing drafted for today. Tap Redraft or add a task.' : 'Loading…'}
/>

<div class="actions" style="margin-top:12px">
  <button class="btn" data-shuffle onclick={shuffleToday}>Redraft</button>
  <button class="btn" data-addtoday onclick={() => (ui.overlay = { kind: 'picker' })}
    >+ Add task</button
  >
</div>
