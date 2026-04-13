export type VersionSelectionMode = 'latest' | 'approved-active';

export interface VersionedRecord {
  id: string;
  status: string;
  created_at: string;
}

export function pickApprovedActive<T extends VersionedRecord>(
  approvedRecord: T | null,
  latestRecord: T | null
): T | null {
  if (approvedRecord) return approvedRecord;
  return latestRecord;
}

export function describeVersionSelection(
  mode: VersionSelectionMode
): string {
  if (mode === 'approved-active') {
    return 'Use the approved record as active truth when it exists; otherwise fall back to the latest record.';
  }

  return 'Use the latest record for current working context.';
}
