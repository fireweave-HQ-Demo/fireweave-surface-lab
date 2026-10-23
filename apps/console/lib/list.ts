export function inFlight(rows: { status: string }[]) {
  return rows.some((row) => row.status === "extracting" || row.status === "writing");
}

export function listSignature(rows: Record<string, unknown>[]) {
  return JSON.stringify(
    rows.map((row) => {
      const next = { ...row };
      delete next.updatedAt;
      return next;
    }),
  );
}
