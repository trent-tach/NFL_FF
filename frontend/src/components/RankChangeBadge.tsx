// Shared by every rankings table (Redraft, Dynasty, Kickers, DST).

export default function RankChangeBadge({ change }: { change: string }) {
  if (change === "new") {
    return <span className="text-xs font-medium text-primary">NEW</span>;
  }
  if (change === "0") {
    return <span className="text-xs text-muted">—</span>;
  }
  const up = change.startsWith("+");
  return (
    <span className={`text-xs font-medium ${up ? "text-green-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {change.replace(/^[+-]/, "")}
    </span>
  );
}
