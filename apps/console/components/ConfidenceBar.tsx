export function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">—</span>;
  const tone = value > 90 ? "" : value >= 70 ? "warn" : "low";
  return (
    <span className={`conf ${tone}`}>
      <i>
        <em style={{ width: `${Math.min(100, value)}%` }} />
      </i>
      <b>{value}%</b>
    </span>
  );
}
