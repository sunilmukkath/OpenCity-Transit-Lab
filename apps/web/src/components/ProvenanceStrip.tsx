export function ProvenanceStrip({
  source,
  fetchedAt,
  kind = "Static",
}: {
  source: string;
  fetchedAt?: string;
  kind?: string;
}) {
  return (
    <p className="text-xs text-[var(--ink-muted)]">
      Source: {source}
      {fetchedAt ? ` · Fetched: ${new Date(fetchedAt).toLocaleString()}` : ""} · {kind}
    </p>
  );
}
