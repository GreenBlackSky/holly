<!-- "+ Add" in a screen header: opens a new, empty task. -->
<script lang="ts">
  import { ui } from '../lib/state.svelte';
</script>

<button
  class="btn"
  data-new
  aria-label="Add task"
  style="white-space:nowrap;flex:none"
  onclick={() => (ui.overlay = { kind: 'task', id: null })}>+ Add</button
>
