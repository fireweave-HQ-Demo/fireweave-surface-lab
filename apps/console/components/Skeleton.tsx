export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skel" key={index} />
      ))}
    </div>
  );
}
