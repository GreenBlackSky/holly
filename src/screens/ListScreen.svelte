<!-- List: every task, most urgent first. -->
<script lang="ts">
  import AddButton from '../components/AddButton.svelte';
  import ScreenHeader from '../components/ScreenHeader.svelte';
  import TaskRows from '../components/TaskRows.svelte';
  import { visibleTasks } from '../lib/state.svelte';
</script>

<ScreenHeader title="All tasks">
  {#snippet extra()}<AddButton />{/snippet}
</ScreenHeader>
<TaskRows list={visibleTasks()} emptyText="Add your first task to start tracking." />
