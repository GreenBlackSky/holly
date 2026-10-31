<!--
  "Your data": everything is saved in this browser only (until Firebase is
  set up), so this is where a backup file is saved and restored. The backup
  exported from the original claude.ai app imports here too.
-->
<script lang="ts">
  import { db, APP_ID, OLD_APP_ID, type Backup } from '../lib/db';
  import { countDocs, downloadBackup, readBackupFile } from '../lib/db/backup';
  import { dialog } from '../lib/ui/dialog.svelte';
  import { toast } from '../lib/ui/toast.svelte';

  let fileInput: HTMLInputElement;

  /** A backup of this app, or of Home Rounds (the app's old name). */
  async function readEitherBackup(file: File): Promise<Backup> {
    try {
      return await readBackupFile(file, APP_ID);
    } catch (e) {
      try {
        return await readBackupFile(file, OLD_APP_ID);
      } catch {
        throw e;
      }
    }
  }

  async function restore(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const backup = await readEitherBackup(file);
      const when = new Date(backup.exportedAt).toLocaleString();
      const result = await dialog({
        title: 'Replace everything?',
        text: `Everything on this device will be replaced by the backup from ${when} (${countDocs(backup)} items).`,
        actions: [
          { label: 'Cancel', value: false },
          { label: 'Replace', value: true, kind: 'danger' },
        ],
      });
      if (result.value) {
        db.importAll(backup);
        toast('Backup restored');
      }
    } catch (e) {
      toast((e as Error).message);
    }
  }
</script>

<div class="section-title">
  <h2>Your data</h2>
  <span class="sub">{db.name}</span>
</div>
<div class="card">
  <p class="hint" style="margin:0 0 12px">
    Everything is saved in this browser only. Save a backup now and then — and before clearing
    browser data.
  </p>
  <div class="actions">
    <button class="btn" data-export onclick={() => downloadBackup(db, APP_ID)}>Save backup</button>
    <button class="btn" data-import onclick={() => fileInput.click()}>Restore backup…</button>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      onchange={restore}
    />
  </div>
</div>
