export function canUseAField(endMinutes, sunsetMinutes) {
  return endMinutes <= sunsetMinutes - 15;
}

export function capacityFor(allocation) {
  return allocation === "halb" ? 0.5 : allocation === "vorplatz" ? 0 : 1;
}
