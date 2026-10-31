<!--
  The question box opened by dialog() (lib/ui/dialog.svelte.ts). Tapping
  outside or pressing Escape dismisses it; Enter in the text field picks the
  primary button.
-->
<script lang="ts">
  import { answerDialog, dialogState } from '../lib/ui/dialog.svelte';

  let text = $state('');
  let selected = $state('');
  let input = $state<HTMLInputElement>();

  /* each time a dialog opens, start from its own values */
  $effect(() => {
    const open = dialogState.current;
    if (open) {
      text = open.input ?? '';
      selected = open.select?.value ?? '';
    }
  });

  $effect(() => {
    if (input) {
      input.focus();
      input.select();
    }
  });

  function answer(value: unknown): void {
    const open = dialogState.current;
    answerDialog({
      value,
      text: open?.input !== undefined && open?.input !== null ? text.trim() : '',
      selected: open?.select ? selected : null,
    });
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const primary = dialogState.current?.actions.find((action) => action.kind === 'primary');
      if (primary) {
        answer(primary.value);
      }
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && dialogState.current) {
      answer(null);
    }
  }}
/>

{#if dialogState.current}
  {@const open = dialogState.current}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="scrim center"
    id="dlg-scrim"
    onclick={(event) => {
      if (event.target === event.currentTarget) {
        answer(null);
      }
    }}
  >
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <h2 id="dlg-t">{open.title}</h2>
      {#if open.text}<p>{open.text}</p>{/if}
      {#if open.input !== undefined && open.input !== null}
        <input
          id="dlg-in"
          bind:this={input}
          bind:value={text}
          autocomplete="off"
          onkeydown={onKey}
        />
      {/if}
      {#if open.select}
        <select id="dlg-sel" style="margin-top:12px" bind:value={selected}>
          {#each open.select.options as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      {/if}
      <div class="dlg-actions">
        {#each open.actions as action, i (i)}
          <button class="btn {action.kind ?? ''}" data-i={i} onclick={() => answer(action.value)}
            >{action.label}</button
          >
        {/each}
      </div>
    </div>
  </div>
{/if}
