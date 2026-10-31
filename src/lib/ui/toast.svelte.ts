/* The little message at the bottom of the screen ("Saved", "Task deleted"),
   optionally with an Undo button. One at a time; a new one replaces the old. */

const TOAST_MS = 5000;

interface Toast {
  message: string;
  undo?: () => void;
}

export const toastState = $state<{ current: Toast | null }>({ current: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, undo?: () => void): void {
  toastState.current = { message, undo };
  clearTimeout(timer);
  timer = setTimeout(() => {
    toastState.current = null;
  }, TOAST_MS);
}

export function dismissToast(): void {
  clearTimeout(timer);
  toastState.current = null;
}
