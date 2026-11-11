export const helsinkiToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
export const dateShift = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const weekDates = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  const first = dateShift(date, -((d.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => dateShift(first, i));
};
export const monthDates = (date) => {
  const first = `${date.slice(0, 7)}-01`;
  const last = new Date(`${first}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return Array.from({ length: last.getUTCDate() }, (_, i) =>
    dateShift(first, i),
  );
};
export const monthShift = (date, months) => {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  const first = d.toISOString().slice(0, 10);
  return dateShift(
    first,
    Math.min(Number(date.slice(8, 10)), monthDates(first).length) - 1,
  );
};
// NULL is a deliberate, visible transition state for existing sites only.
// Missing site data must never silently allow a code.
export function litterasForSite(sites, litteras, siteId) {
  const site = sites.find((s) => s.id === siteId);
  if (!site) return [];
  return litteras.filter(
    (l) =>
      l.active !== false &&
      (site.allowed_littera_ids == null ||
        site.allowed_littera_ids.includes(l.id)),
  );
}
export function entryLitteraAllowed(value, original, sites, litteras) {
  const allocation = [
    "organization_id",
    "employee_id",
    "worksite_id",
    "littera_id",
    "work_date",
    "start_time",
    "end_time",
  ];
  const same =
    original &&
    value.id === original.id &&
    allocation.every((key) => {
      if (key === "organization_id" || key === "employee_id")
        return value[key] == null || value[key] === original[key];
      if (key.endsWith("_time"))
        return value[key]?.slice(0, 5) === original[key]?.slice(0, 5);
      return value[key] === original[key];
    });
  // Notes / approval of history are allowed; extending or moving that work is not.
  return (
    !!same ||
    litterasForSite(sites, litteras, value.worksite_id).some(
      (l) => l.id === value.littera_id,
    )
  );
}
export const minutes = (value) => {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value || "")) return NaN;
  const [h, m] = value.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
};
export const grossMinutes = (row) =>
  Math.max(0, minutes(row.end_time) - minutes(row.start_time));
export const formatHours = (value) =>
  Number(value).toLocaleString("fi-FI", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
const nameCollator = new Intl.Collator("fi", { sensitivity: "base" });
export function compareWorkersBySurname(a, b) {
  const parts = (name) =>
    String(name || "")
      .trim()
      .split(/\s+/);
  const left = parts(a.full_name),
    right = parts(b.full_name);
  return (
    nameCollator.compare(left.at(-1), right.at(-1)) ||
    nameCollator.compare(
      left.slice(0, -1).join(" "),
      right.slice(0, -1).join(" "),
    ) ||
    String(a.id).localeCompare(String(b.id))
  );
}
export function allocateDay(rows) {
  const result = rows.map((row) => ({
    ...row,
    grossMinutes: grossMinutes(row),
    breakMinutes: 0,
    paidMinutes: grossMinutes(row),
  }));
  if (result.reduce((s, r) => s + r.grossMinutes, 0) <= 360) return result;
  let remaining = 30;
  for (const row of [...result].sort(
    (a, b) =>
      a.start_time.localeCompare(b.start_time) ||
      String(a.id || "").localeCompare(String(b.id || "")),
  )) {
    const overlap = Math.max(
      0,
      Math.min(minutes(row.end_time), 690) -
        Math.max(minutes(row.start_time), 660),
    );
    const cut = Math.min(remaining, overlap, row.paidMinutes);
    row.breakMinutes += cut;
    row.paidMinutes -= cut;
    remaining -= cut;
  }
  for (const row of [...result].sort(
    (a, b) =>
      b.end_time.localeCompare(a.end_time) ||
      String(a.id || "").localeCompare(String(b.id || "")),
  )) {
    const cut = Math.min(remaining, row.paidMinutes);
    row.breakMinutes += cut;
    row.paidMinutes -= cut;
    remaining -= cut;
    if (!remaining) break;
  }
  return result;
}
export function allocateEntries(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.employee_id}|${row.work_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap(allocateDay);
}
export function dayState(rows) {
  if (!rows.length) return "empty";
  if (rows.some((r) => r.status === "returned")) return "returned";
  if (rows.some((r) => r.status === "draft")) return "draft";
  if (rows.every((r) => r.status === "approved")) return "approved";
  return "submitted";
}
export function validateEntry(value, rows, closedMonths = []) {
  if (!value.work_date || !value.worksite_id || !value.littera_id)
    return "required";
  if (
    !Number.isFinite(minutes(value.start_time)) ||
    !Number.isFinite(minutes(value.end_time)) ||
    minutes(value.end_time) <= minutes(value.start_time)
  )
    return "time";
  if (closedMonths.includes(value.work_date.slice(0, 7))) return "locked";
  if (
    rows.some(
      (r) =>
        r.id !== value.id &&
        r.work_date === value.work_date &&
        minutes(value.start_time) < minutes(r.end_time) &&
        minutes(value.end_time) > minutes(r.start_time),
    )
  )
    return "overlap";
  return null;
}
// Allocate the full employee-day before any site, company or status filtering.
export function filterEntries(rows, filters) {
  return rows.filter(
    (r) =>
      (!filters.site ||
        filters.site === "all" ||
        r.worksite_id === filters.site) &&
      (!filters.employer ||
        filters.employer === "all" ||
        r.profiles?.employer_id === filters.employer) &&
      (!filters.employee ||
        filters.employee === "all" ||
        r.employee_id === filters.employee) &&
      (!filters.littera ||
        filters.littera === "all" ||
        r.littera_id === filters.littera) &&
      (!filters.status ||
        filters.status === "all" ||
        r.status === filters.status),
  );
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export const csvText = (rows) =>
  "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
