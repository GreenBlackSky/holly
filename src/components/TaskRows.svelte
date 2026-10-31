<!--
  A list of tasks, most urgent first. Each row: a coloured stripe for its
  status, the name and effort points, where/what/how often, when it is due,
  and the round tick button. Tapping the row opens the task.
-->
<script lang="ts">
  import { app, categoryName, markDone, removeFromToday, roomName, ui } from '../lib/state.svelte';
  import {
    dueText,
    frequencyLabel,
    pointsOf,
    sortByUrgency,
    statusFor,
    type Task,
  } from '../lib/tasks';
  import { doneToday } from '../lib/today';

  const {
    list,
    emptyText = 'No tasks here.',
    today = false,
    hideRoom = false,
    hideCat = false,
  }: {
    list: Task[];
    emptyText?: string;
    /** the Today list: struck through when done, with a remove button */
    today?: boolean;
    hideRoom?: boolean;
    hideCat?: boolean;
  } = $props();

  const rows = $derived(sortByUrgency(list, app.now));
  /* ticks shown right away, before the save comes back */
  const ticked = $state<Record<string, boolean>>({});

  function meta(task: Task): string {
    return [
      hideRoom ? null : roomName(task.room),
      hideCat ? null : categoryName(task.cat),
      frequencyLabel(task),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  async function tick(task: Task): Promise<void> {
    ticked[task.id] = true;
    await markDone(task.id);
    delete ticked[task.id];
  }

  function open(task: Task): void {
    ui.overlay = { kind: 'task', id: task.id };
  }

  const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7.5';
</script>

<div class="list">
  {#each rows as task (task.id)}
    {@const done = today && doneToday(task, app.now)}
    <div class="task s-{statusFor(task, app.now)}" class:is-done={done}>
      <span class="stripe" aria-hidden="true"></span>
      <button class="t-main" data-open={task.id} onclick={() => open(task)}>
        <span class="t-name">{task.name}<span class="pts num">{pointsOf(task)}</span></span>
        <span class="t-meta">{meta(task)}</span>
        <span class="t-due">{dueText(task, app.now)}</span>
      </button>
      {#if today}
        <button
          class="rm"
          data-untoday={task.id}
          aria-label="Remove {task.name} from today"
          onclick={() => removeFromToday(task.id)}>×</button
        >
      {/if}
      <button
        class="check"
        class:done={done || ticked[task.id]}
        data-done={task.id}
        aria-label="Mark {task.name} done"
        onclick={() => tick(task)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"><path d={CHECK_PATH} /></svg
        >
      </button>
    </div>
  {:else}
    <div class="empty">{emptyText}</div>
  {/each}
</div>
