import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateDay,
  allocateEntries,
  filterEntries,
  weekDates,
  validateEntry,
  dayState,
  csvCell,
} from "./time-model.js";
const row = (start, end, extra = {}) => ({
  id: start,
  employee_id: "a",
  work_date: "2026-11-09",
  start_time: start,
  end_time: end,
  worksite_id: "one",
  littera_id: "code",
  status: "submitted",
  ...extra,
});
test("7–15:30 yields eight hours and one lunch", () =>
  assert.equal(allocateDay([row("07:00", "15:30")])[0].paidMinutes, 480));
test("exactly six hours does not deduct lunch", () =>
  assert.equal(allocateDay([row("07:00", "13:00")])[0].paidMinutes, 360));
test("multiple sites allocate lunch to site occupied at eleven", () => {
  const r = allocateDay([
    row("07:00", "10:00"),
    row("10:30", "15:30", { worksite_id: "two" }),
  ]);
  assert.deepEqual(
    r.map((x) => x.breakMinutes),
    [0, 30],
  );
});
test("partial overlap and tiny last entry never lose a deduction", () => {
  const r = allocateDay([
    row("06:00", "11:10"),
    row("12:00", "13:30"),
    row("14:00", "14:05"),
  ]);
  assert.equal(
    r.reduce((s, r) => s + r.breakMinutes, 0),
    30,
  );
  assert.ok(r.every((r) => r.paidMinutes >= 0));
  assert.deepEqual(
    r.map((x) => x.breakMinutes),
    [10, 15, 5],
  );
});
test("lunch allocation is independent of approval filter", () => {
  const r = allocateEntries([
    row("07:00", "11:00", { status: "approved" }),
    row("11:00", "15:30"),
  ]);
  assert.equal(filterEntries(r, { status: "approved" })[0].paidMinutes, 240);
});
test("employees and dates receive independent lunch deductions", () => {
  const r = allocateEntries([
    row("07:00", "15:30"),
    row("07:00", "15:30", { employee_id: "b" }),
    row("07:00", "15:30", { work_date: "2026-11-10" }),
  ]);
  assert.equal(
    r.reduce((s, x) => s + x.paidMinutes, 0),
    1440,
  );
});
test("week crosses year and DST without date shifts", () => {
  assert.deepEqual(weekDates("2027-01-01"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  assert.equal(weekDates("2026-10-25")[6], "2026-10-25");
});
test("overlapping periods blocked, adjacent periods allowed", () => {
  assert.equal(
    validateEntry(row("09:00", "11:00"), [row("07:00", "10:00")]),
    "overlap",
  );
  assert.equal(
    validateEntry(row("10:00", "11:00"), [row("07:00", "10:00")]),
    null,
  );
});
test("closed month and invalid times are blocked", () => {
  assert.equal(validateEntry(row("07:00", "15:30"), [], ["2026-11"]), "locked");
  assert.equal(validateEntry(row("25:00", "26:00"), []), "time");
});
test("returned entries take precedence in day status", () =>
  assert.equal(
    dayState([
      row("07:00", "10:00", { status: "approved" }),
      row("10:00", "15:30", { status: "returned" }),
    ]),
    "returned",
  ));
test("CSV quotes and formula injection are handled", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('A "B"'), '"A ""B"""');
});
