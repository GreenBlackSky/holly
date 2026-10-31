<!-- "+ Add task" on Today: every task not yet in today's list, most urgent first. -->
<script lang="ts">
  import {
    addToToday,
    app,
    pointsSum,
    roomName,
    taskById,
    todayBudget,
    todayIds,
    ui,
    visibleTasks,
  } from '../lib/state.svelte';
  import {
    dueText,
    frequencyLabel,
    pointsOf,
    sortByUrgency,
    statusFor,
    type Task,
  } from '../lib/tasks';
  import { doneToday } from '../lib/today';

  const inToday = $derived(new Set(todayIds()));
  const candidates = $derived(
    sortByUrgency(
      visibleTasks().filter((task) => !inToday.has(task.id) && !doneToday(task, app.now)),
      app.now,
    ),
  );
  const planned = $derived(
    pointsSum(
      todayIds()
        .map(taskById)
        .filter((task): task is Task => Boolean(task)),
    ),
  );

  function close(): void {
    ui.overlay = null;
  }

  function pick(task: Task): void {
    addToToday(task.id);
    close();
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      close();
    }
  }}
/>

<div class="scrim" id="scrim">
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pick-t">
    <div class="head">
      <div>
        <h2 id="pick-t">Add to today</h2>
        <div class="sub num">{planned} of {todayBudget()} steps planned</div>
      </div>
      <button class="btn" id="pick-close" onclick={close}>Close</button>
    </div>
    <div class="list">
      {#each candidates as task (task.id)}
        <div class="task s-{statusFor(task, app.now)}">
          <span class="stripe" aria-hidden="true"></span>
          <button class="t-main" data-totoday={task.id} onclick={() => pick(task)}>
            <span class="t-name">{task.name}<span class="pts num">{pointsOf(task)}</span></span>
            <span class="t-meta">{[roomName(task.room), frequencyLabel(task)].join(' · ')}</span>
            <span class="t-due">{dueText(task, app.now)}</span>
          </button>
        </div>
      {:else}
        <div class="empty">Everything is either done or already in today.</div>
      {/each}
    </div>
  </div>
</div>
