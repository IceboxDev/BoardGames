// The single file-size formatter. Three copies of this used to live in the D&D
// tool (CampaignTome, DndGameScreen, PdfDropField) and they had already
// diverged: PdfDropField's copy had no KB branch, so every character sheet
// under ~1 MiB rendered as "0.0 MB" in the upload field while the very same
// file showed "12 KB" on the Sources screen.
//
// Binary units (1 MiB = 1024 KiB), labelled with the familiar KB/MB — matching
// what the OS file picker shows the user on the other side of the upload.

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  // Never round a real file down to "0 KB" — the smallest thing a user can
  // pick still occupies a page on disk.
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
