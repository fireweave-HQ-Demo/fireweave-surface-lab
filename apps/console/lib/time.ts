export function ago(value?: string, now = Date.now()) {
  if (!value) return "—";
  const ms = now - new Date(value).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function clock(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function todayLabel(now = new Date()) {
  return now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function weekRange(now = new Date()) {
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(monday).replace(/, \d{4}/, "")} – ${fmt(friday)}`;
}

export function shortName(name?: string) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}
