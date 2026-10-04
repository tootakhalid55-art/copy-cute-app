export function selectScannedOriginals<T extends { filename?: string; meta?: unknown }>(attachments: T[], expectedFilename?: string): T[] {
  const marked = attachments.filter(a => (a.meta as { purpose?: string } | null)?.purpose === "scanned-original");
  if (marked.length) return marked;
  if (expectedFilename) return attachments.filter(a => a.filename === expectedFilename);
  return attachments; // Older invoices predate the original-file marker.
}
