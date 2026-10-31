<!--
  Adding or editing a task: name, room, category, how often, effort. For an
  existing task also its history — remove a wrong entry, add one done earlier
  — and deleting it. Takes over the page (so the phone keyboard cannot push a
  floating box around).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    app,
    newCategory,
    rooms,
    taskById,
    ui,
    WHOLE_HOME,
    writeTask,
  } from '../lib/state.svelte';
  import {
    doneList,
    frequencyLabel,
    makeId,
    pointsOf,
    POINT_VALUES,
    type FrequencyUnit,
    type Task,
  } from '../lib/tasks';
  import { dialog, dialogState } from '../lib/ui/dialog.svelte';
  import { toast } from '../lib/ui/toast.svelte';

  const { id }: { id: string | null } = $props();

  const NEW_CATEGORY = '__new';
  const DEFAULT_CATEGORY = 'floors';
  /** If saving hangs, give the button back after this long. */
  const SAVE_TIMEOUT_MS = 12_000;
  /** Allow a minute of clock difference when adding a past completion. */
  const FUTURE_TOLERANCE_MS = 60_000;

  /* The form is opened for one task (App re-creates it for another), so these
     are read once: the fields below edit their own copy, not the live task. */
  const original: Task | undefined = untrack(() => (id ? taskById(id) : undefined));
  const isNew = untrack(() => !id);

  function defaultRoom(): string {
    if (ui.tab === 'rooms' && ui.room) {
      return ui.room;
    }
    return rooms()[0]?.id ?? WHOLE_HOME.id;
  }

  let name = $state(original?.name ?? '');
  let room = $state(original?.room ?? defaultRoom());
  let category = $state(original?.cat ?? (ui.tab === 'cats' && ui.cat ? ui.cat : DEFAULT_CATEGORY));
  let every = $state(String(original?.every ?? 1));
  let unit = $state<FrequencyUnit>(original?.unit ?? 'w');
  let points = $state(original ? pointsOf(original) : pointsOf({} as Task));
  let saving = $state(false);
  let namePlaceholder = $state('Wipe the mirror');
  let nameInput = $state<HTMLInputElement>();

  /* the live task, so history changes show at once */
  const live = $derived(id ? taskById(id) : undefined);
  const history = $derived(live ? doneList(live).slice().reverse() : []);
  const everyCount = $derived(Math.max(1, parseInt(every, 10) || 1));
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  let pastWhen = $state(localNow);
  let pastInput = $state<HTMLInputElement>();

  $effect(() => {
    if (isNew) {
      nameInput?.focus();
    }
  });

  function close(): void {
    ui.overlay = null;
  }

  let lastCategory = untrack(() => category);
  async function onCategoryChange(): Promise<void> {
    if (category !== NEW_CATEGORY) {
      lastCategory = category;
      return;
    }
    const created = await newCategory();
    category = created ?? lastCategory;
    lastCategory = category;
  }

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      nameInput?.focus();
      namePlaceholder = 'Enter a task name';
      return;
    }
    if (saving) {
      return;
    }
    saving = true;
    const giveBack = setTimeout(() => (saving = false), SAVE_TIMEOUT_MS);
    const fields = { name: trimmed, room, cat: category, pts: points, every: everyCount, unit };
    let ok: boolean;
    if (isNew) {
      const newId = makeId(trimmed, 40, 5, 'task');
      ok = await writeTask(newId, (ref) =>
        ref.set({ ...fields, id: newId, done: [], created: Date.now() }),
      );
    } else {
      ok = await writeTask(id!, (ref) => ref.update(fields));
    }
    clearTimeout(giveBack);
    saving = false;
    if (ok) {
      close();
      toast(isNew ? 'Task added' : 'Saved');
    }
  }

  async function removeEntry(time: number): Promise<void> {
    const current = taskById(id!) ?? original!;
    await writeTask(id!, (ref) =>
      ref.update({ done: doneList(current).filter((other) => other !== time) }),
    );
  }

  async function addPast(): Promise<void> {
    const time = pastWhen ? new Date(pastWhen).getTime() : NaN;
    if (!Number.isFinite(time) || time > Date.now() + FUTURE_TOLERANCE_MS) {
      pastInput?.focus();
      return;
    }
    const current = taskById(id!) ?? original!;
    const done = [...doneList(current), time].sort((a, b) => a - b);
    if (await writeTask(id!, (ref) => ref.update({ done }))) {
      toast('Added to history');
    }
  }

  async function deleteTask(): Promise<void> {
    const result = await dialog({
      title: `Delete “${original!.name}”?`,
      text: 'Its history will be deleted too.',
      actions: [
        { label: 'Cancel', value: false },
        { label: 'Delete', value: true, kind: 'danger' },
      ],
    });
    if (result.value && (await writeTask(id!, (ref) => ref.delete()))) {
      close();
      toast('Task deleted');
    }
  }

  const formatWhen = (time: number): string =>
    new Date(time).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && !dialogState.current) {
      close();
    }
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="scrim"
  id="scrim"
  onclick={(event) => {
    if (event.target === event.currentTarget) {
      close();
    }
  }}
>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <h2 id="sheet-title">{isNew ? 'New task' : original?.name}</h2>
    <div class="field">
      <label for="f-name">Task</label>
      <input
        id="f-name"
        bind:this={nameInput}
        bind:value={name}
        placeholder={namePlaceholder}
        autocomplete="off"
      />
    </div>
    <div class="row2">
      <div class="field">
        <label for="f-room">Room</label>
        <select id="f-room" bind:value={room}>
          {#each rooms() as option (option.id)}<option value={option.id}>{option.name}</option
            >{/each}
        </select>
      </div>
      <div class="field">
        <label for="f-cat">Category</label>
        <select id="f-cat" bind:value={category} onchange={onCategoryChange}>
          {#each app.categories as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
          <option value={NEW_CATEGORY}>+ New category…</option>
        </select>
      </div>
    </div>
    <div class="field">
      <span class="lbl">How often</span>
      <div class="freq">
        <input
          id="f-every"
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          bind:value={every}
          aria-label="Number"
        />
        <select id="f-unit" bind:value={unit} aria-label="Unit">
          <option value="d">days between</option>
          <option value="w">weeks between</option>
          <option value="m">months between</option>
          <option value="y">times a year</option>
        </select>
      </div>
      <span class="hint" id="f-hint">Shown as: {frequencyLabel({ every: everyCount, unit })}</span>
    </div>
    <div class="field">
      <span class="lbl">Effort</span>
      <div class="pick" id="f-pts" role="group" aria-label="Steps">
        {#each POINT_VALUES as value (value)}
          <button
            type="button"
            class="pbtn"
            class:on={points === value}
            data-pts={value}
            onclick={() => (points = value)}>{value}</button
          >
        {/each}
      </div>
      <span class="hint"
        >Steps: 1 is about 5 to 10 minutes. 0 means it never uses up a day's steps.</span
      >
    </div>
    <div class="actions">
      <button class="btn primary grow" id="f-save" disabled={saving} onclick={save}>
        {#if saving}Saving…{:else}{isNew ? 'Add task' : 'Save'}{/if}
      </button>
      <button class="btn" id="f-cancel" onclick={close}>Close</button>
    </div>

    {#if !isNew}
      <div class="hist">
        <div class="section-title" style="margin-top:0">
          <h2>History</h2>
          <span class="sub num">{history.length} times</span>
        </div>
        {#each history as time (time)}
          <div class="hi num">
            <span>{formatWhen(time)}</span>
            <button data-rm={time} aria-label="Remove this entry" onclick={() => removeEntry(time)}
              >Remove</button
            >
          </div>
        {:else}
          <div class="hint">Not done yet.</div>
        {/each}
        <div class="lbl" style="margin-top:14px">Did it earlier?</div>
        <div class="addpast">
          <input
            type="datetime-local"
            id="f-past"
            bind:this={pastInput}
            bind:value={pastWhen}
            max={localNow}
            aria-label="When it was done"
          />
          <button class="btn" id="f-addpast" onclick={addPast}>Add</button>
        </div>
        <div class="actions" style="margin-top:22px">
          <button class="btn danger" id="f-del" onclick={deleteTask}>Delete task</button>
        </div>
      </div>
    {/if}
  </div>
</div>
