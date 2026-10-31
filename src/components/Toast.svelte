<!-- The message at the bottom of the screen, with Undo when there is one. -->
<script lang="ts">
  import { dismissToast, toastState } from '../lib/ui/toast.svelte';

  function undo(): void {
    const action = toastState.current?.undo;
    dismissToast();
    action?.();
  }
</script>

{#if toastState.current}
  <div class="toast" role="status">
    <span>{toastState.current.message}</span>
    {#if toastState.current.undo}<button id="undo-btn" onclick={undo}>Undo</button>{/if}
  </div>
{/if}
