import type { LocalDatabase } from './local';
import type { Backup } from './types';

/* Saving everything to a file and reading it back. The same format the data
   was exported in from the original claude.ai artifact, so that file imports
   as is. */

/** Download the whole database as a .json file. */
export function downloadBackup(db: LocalDatabase, fileStem: string): void {
  const backup = db.exportAll();
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileStem}-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Check a parsed file really is a backup of this app; returns a reason if not. */
export function backupProblem(value: unknown, appId: string): string | null {
  const backup = value as Partial<Backup> | null;
  if (!backup || typeof backup !== 'object' || backup.format !== 'local-db-backup') {
    return 'This file is not a backup.';
  }
  if (backup.app !== appId) {
    return `This is a backup of ${backup.app ?? 'another app'}, not this one.`;
  }
  if (!backup.collections || typeof backup.collections !== 'object') {
    return 'This backup is empty or damaged.';
  }
  return null;
}

/** Read a chosen file; resolves to the backup, or rejects with a readable reason. */
export async function readBackupFile(file: File, appId: string): Promise<Backup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This file could not be read as JSON.');
  }
  const problem = backupProblem(parsed, appId);
  if (problem) {
    throw new Error(problem);
  }
  return parsed as Backup;
}

/** How many documents a backup holds, for the confirmation question. */
export function countDocs(backup: Backup): number {
  return Object.values(backup.collections).reduce((sum, docs) => sum + Object.keys(docs).length, 0);
}
