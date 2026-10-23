const MORNING = ["08:00", "09:00", "10:00"];
const END_OF_DAY = ["15:00", "16:00"];

export function nextSlot(
  timeOfDay: "morning" | "end_of_day",
  taken: string[],
  day = "2026-10-24",
): { day: string; time: string } | null {
  const slots = timeOfDay === "end_of_day" ? END_OF_DAY : MORNING;
  const time = slots.find((slot) => !taken.includes(slot));
  if (!time) return null;
  return { day, time };
}
