<!--
  A note from the house's staff, handwritten on cream paper. On the rare day
  every lamp is lit, it is a sealed letter instead.
-->
<script lang="ts">
  import type { StaffNote } from '../lib/house';

  const { note, day }: { note: StaffNote; day: number } = $props();
</script>

<div class="note" class:letter={note.sealed} data-note role="note">
  {#if note.sealed}
    <span class="wax" aria-hidden="true"></span>
    <span class="no">NO. 46 · DAY {day}</span>
  {/if}
  {note.text}
  <span class="by">— {note.by}</span>
</div>
