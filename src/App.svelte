<!--
  Holly: one tab's screen at a time, the tab bar at the bottom, and
  whatever covers the page (a task form, the today picker, the plan editor,
  a question box, a toast). Which tab shows is just ui.tab — changing it
  re-draws this file.
-->
<script lang="ts">
  import Dialog from './components/Dialog.svelte';
  import PlanEditor from './components/PlanEditor.svelte';
  import TaskSheet from './components/TaskSheet.svelte';
  import Toast from './components/Toast.svelte';
  import TodayPicker from './components/TodayPicker.svelte';
  import { ensureToday, saveUi, ui, type Tab } from './lib/state.svelte';
  import { dialogState } from './lib/ui/dialog.svelte';
  import CategoriesScreen from './screens/CategoriesScreen.svelte';
  import ListScreen from './screens/ListScreen.svelte';
  import RoomsScreen from './screens/RoomsScreen.svelte';
  import StatsScreen from './screens/StatsScreen.svelte';
  import TodayScreen from './screens/TodayScreen.svelte';

  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    {
      id: 'today',
      label: 'Today',
      icon: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
    },
    {
      id: 'list',
      label: 'List',
      icon: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    },
    {
      id: 'cats',
      label: 'Kinds',
      icon: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    },
    {
      id: 'rooms',
      label: 'Estate',
      icon: '<path d="M3 4h18v16H3z"/><path d="M11 4v7H3M11 15v5M15 11h6"/>',
    },
    { id: 'stats', label: 'Stats', icon: '<path d="M5 20V11M12 20V5M19 20v-6"/>' },
  ];

  /* on a new day (or once the data is in), pick today's list */
  $effect(() => {
    ensureToday();
  });

  /* While something covers the page, the page itself is hidden (not just
     covered), so it cannot scroll underneath. Its scroll position is put
     back when the cover goes. */
  const pageHidden = $derived(ui.overlay !== null || dialogState.current !== null);
  let savedScroll = 0;
  let wasHidden = false;
  $effect(() => {
    if (pageHidden && !wasHidden) {
      savedScroll = window.scrollY;
      window.scrollTo(0, 0);
    } else if (!pageHidden && wasHidden) {
      const y = savedScroll;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
    wasHidden = pageHidden;
  });

  function openTab(tab: Tab): void {
    ui.tab = tab;
    saveUi();
    window.scrollTo(0, 0);
  }
</script>

<main id="app" hidden={pageHidden}>
  {#if ui.tab === 'rooms'}<RoomsScreen />
  {:else if ui.tab === 'cats'}<CategoriesScreen />
  {:else if ui.tab === 'stats'}<StatsScreen />
  {:else if ui.tab === 'list'}<ListScreen />
  {:else}<TodayScreen />
  {/if}
</main>

<nav class="tabs" aria-label="Sections" hidden={pageHidden}>
  <div class="in" role="tablist">
    {#each TABS as tab (tab.id)}
      <button
        class="tab"
        role="tab"
        id="tab-{tab.id}"
        data-tab={tab.id}
        aria-selected={ui.tab === tab.id}
        onclick={() => openTab(tab.id)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round">{@html tab.icon}</svg
        >{tab.label}
      </button>
    {/each}
  </div>
</nav>

<!-- a question box hides whatever it was asked from, and brings it back after -->
<div hidden={dialogState.current !== null}>
  {#if ui.overlay?.kind === 'task'}
    {#key ui.overlay.id}<TaskSheet id={ui.overlay.id} />{/key}
  {:else if ui.overlay?.kind === 'picker'}
    <TodayPicker />
  {:else if ui.overlay?.kind === 'editor'}
    <PlanEditor />
  {/if}
</div>
<Dialog />
<Toast />
