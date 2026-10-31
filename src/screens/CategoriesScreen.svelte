<!--
  Categories: a tile per category with a bar showing how its tasks are doing
  (red overdue, amber soon, green fine), and the chosen category's tasks below.
-->
<script lang="ts">
  import AddButton from '../components/AddButton.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import TaskRows from '../components/TaskRows.svelte';
  import {
    app,
    categoryName,
    deleteCategory,
    newCategory,
    renameCategory,
    saveUi,
    ui,
    visibleTasks,
  } from '../lib/state.svelte';
  import { countLabel, groupStatus, sortKey } from '../lib/tasks';
  import { plural } from '../lib/text';
  import { toast } from '../lib/ui/toast.svelte';

  const NO_TASKS_KEY = -2;

  /* if nothing valid is chosen, open the category with the most urgent task */
  $effect(() => {
    if (ui.cat && app.categories.some((category) => category.id === ui.cat)) {
      return;
    }
    let best: string | null = null;
    let bestKey = -1;
    for (const category of app.categories) {
      const key = Math.max(
        NO_TASKS_KEY,
        ...visibleTasks()
          .filter((task) => task.cat === category.id)
          .map((task) => sortKey(task, app.now)),
      );
      if (key > bestKey) {
        bestKey = key;
        best = category.id;
      }
    }
    ui.cat = best ?? 'floors';
  });

  const tiles = $derived(
    app.categories.map((category) => {
      const group = groupStatus(
        visibleTasks().filter((task) => task.cat === category.id),
        app.now,
      );
      return { category, group, total: group.total || 1 };
    }),
  );
  const list = $derived(visibleTasks().filter((task) => task.cat === ui.cat));

  function choose(id: string): void {
    ui.cat = id;
    saveUi();
  }

  async function addCategory(): Promise<void> {
    const id = await newCategory();
    if (id) {
      choose(id);
      toast('Category added');
    }
  }
</script>

<ScreenHeader title="Kinds of work">
  {#snippet extra()}<AddButton />{/snippet}
</ScreenHeader>

<div class="tiles">
  {#each tiles as { category, group, total } (category.id)}
    <button
      class="tile"
      class:sel={ui.cat === category.id}
      data-cat={category.id}
      onclick={() => choose(category.id)}
    >
      <span class="tn">{category.name}</span>
      <span class="tc num">{countLabel(group)} · {group.total}</span>
      <span class="bar" aria-hidden="true">
        <span style="width:{(group.late / total) * 100}%"></span>
        <span style="width:{(group.soon / total) * 100}%"></span>
        <span style="width:{(group.ok / total) * 100}%"></span>
        <span style="width:{(group.new / total) * 100}%"></span>
      </span>
    </button>
  {/each}
  <button class="tile tile-new" data-newcat onclick={addCategory}>
    <span class="tn">+ New category</span>
    <span class="tc">Group tasks your way</span>
  </button>
</div>

<div class="section-title">
  <h2>{categoryName(ui.cat ?? '')}</h2>
  <span class="sub num">{plural(list.length, 'task')}</span>
</div>
<div class="cat-tools">
  <button class="btn" onclick={() => ui.cat && renameCategory(ui.cat)}>Rename</button>
  <button class="btn danger" onclick={() => ui.cat && deleteCategory(ui.cat)}
    >Delete category</button
  >
</div>
<TaskRows {list} hideCat emptyText="No tasks in this category yet." />
