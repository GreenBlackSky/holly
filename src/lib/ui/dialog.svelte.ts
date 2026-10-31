/* A small question box ("Delete this task?", "New category" with a text
   field). `await dialog({...})` shows it and resolves with what was chosen —
   like the browser's prompt(), but the page keeps running while it waits. */

export interface DialogAction<V = unknown> {
  label: string;
  value: V;
  kind?: 'primary' | 'danger';
}

export interface DialogOptions {
  title: string;
  text?: string;
  /** show a text field with this starting value */
  input?: string | null;
  /** show a drop-down list */
  select?: { options: Array<{ id: string; name: string }>; value: string };
  actions: DialogAction[];
}

export interface DialogResult {
  /** the chosen action's value; null if dismissed */
  value: unknown;
  /** the text field, trimmed ('' without one) */
  text: string;
  /** the drop-down's value (null without one) */
  selected: string | null;
}

interface OpenDialog extends DialogOptions {
  resolve: (result: DialogResult) => void;
}

export const dialogState = $state<{ current: OpenDialog | null }>({ current: null });

export function dialog(options: DialogOptions): Promise<DialogResult> {
  return new Promise((resolve) => {
    dialogState.current = { ...options, resolve };
  });
}

/** Close the open dialog with an answer (called by Dialog.svelte). */
export function answerDialog(result: DialogResult): void {
  const open = dialogState.current;
  dialogState.current = null;
  open?.resolve(result);
}
