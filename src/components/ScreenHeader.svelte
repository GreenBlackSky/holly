<!--
  The top of every tab: an optional typewritten line ("DAY 214"), a big
  title, a one-line summary under it (overdue ·
  due soon · on track, unless the screen passes its own), an optional button
  on the right, and the "Hide never done" switch when there are such tasks.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, saveUi, ui, visibleTasks } from '../lib/state.svelte';
  import { groupStatus, isNew } from '../lib/tasks';

  const {
    title,
    kicker = null,
    sub = null,
    subClass = '',
    extra,
  }: {
    title: string;
    /** a small typewritten line above the title */
    kicker?: string | null;
    sub?: string | null;
    subClass?: string;
    extra?: Snippet;
  } = $props();

  const group = $derived(groupStatus(visibleTasks(), app.now));
  const anyNew = $derived(app.tasks.some(isNew));
  /* "4 overdue · 2 due soon · 20 on track", leaving out the zero counts */
  const summary = $derived(
    [
      { text: `${group.late} overdue`, className: 'late', show: group.late > 0 },
      { text: `${group.soon} due soon`, className: 'soon', show: group.soon > 0 },
      { text: `${group.ok} on track`, className: '', show: true },
    ].filter((part) => part.show),
  );

  function toggleHideNew(): void {
    ui.hideNew = !ui.hideNew;
    saveUi();
  }
</script>

<div class="head">
  <div>
    {#if kicker}<div class="kicker num">{kicker}</div>{/if}
    <h1>{title}</h1>
    <div class="sub num {subClass}">
      {#if sub !== null}
        {sub}
      {:else if !app.loaded}
        Loading your tasks…
      {:else}
        {#each summary as part, i (part.text)}{i ? ' · ' : ''}{#if part.className}<b
              class={part.className}>{part.text}</b
            >{:else}{part.text}{/if}{/each}
      {/if}
    </div>
  </div>
  {@render extra?.()}
</div>
{#if anyNew}
  <div class="filters">
    <button
      class="chip sm"
      class:sel={ui.hideNew}
      aria-pressed={ui.hideNew}
      data-togglenew
      onclick={toggleHideNew}
    >
      {ui.hideNew ? 'Never-done hidden' : 'Hide never done'}
    </button>
  </div>
{/if}
