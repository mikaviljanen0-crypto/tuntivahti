import test from "node:test";
import assert from "node:assert/strict";
import { allPages, makeTimeApi } from "./time-api.js";
const profile = { id: "worker-1", organization_id: "org-1", role: "worker" };
function fakeDb(responses) {
  const calls = [];
  const db = {
    from(table) {
      const call = { table, steps: [] };
      calls.push(call);
      const builder = {
        then(resolve, reject) {
          return Promise.resolve(responses.shift() || { data: [] }).then(
            resolve,
            reject,
          );
        },
      };
      for (const method of [
        "select",
        "update",
        "insert",
        "delete",
        "upsert",
        "eq",
        "in",
        "gte",
        "lte",
        "order",
        "range",
      ])
        builder[method] = (...args) => {
          call.steps.push([method, ...args]);
          return builder;
        };
      return builder;
    },
  };
  return { db, calls };
}
test("pagination retrieves every row beyond Supabase default cap", async () => {
  const source = Array.from({ length: 1201 }, (_, id) => ({ id })),
    ranges = [];
  const rows = await allPages(() => ({
    range: async (start, end) => {
      ranges.push([start, end]);
      return { data: source.slice(start, end + 1) };
    },
  }));
  assert.equal(rows.length, 1201);
  assert.deepEqual(ranges, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});
test("pagination fails instead of returning an incomplete report", async () => {
  let page = 0;
  await assert.rejects(
    () =>
      allPages(() => ({
        range: async () =>
          ++page === 1
            ? { data: Array(500).fill({ id: 1 }) }
            : { error: new Error("offline") },
      })),
    /offline/,
  );
});
test("worker read scopes by organization, worker and dates", async () => {
  const { db, calls } = fakeDb([{ data: [{ id: "a" }] }]);
  await makeTimeApi(db, profile).entries("2026-11-01", "2026-11-30");
  for (const step of [
    ["eq", "organization_id", "org-1"],
    ["eq", "employee_id", "worker-1"],
    ["gte", "work_date", "2026-11-01"],
    ["lte", "work_date", "2026-11-30"],
  ])
    assert.ok(
      calls[0].steps.some((s) => JSON.stringify(s) === JSON.stringify(step)),
    );
});
test("review requests server-calculated net minutes, without fetching unauthorized days", async () => {
  const { db, calls } = fakeDb([{ data: [{ id: "a", paidMinutes: 480 }] }]);
  const rows = await makeTimeApi(db, { ...profile, role: "foreman" }).entries(
    "2026-11-01",
    "2026-11-30",
    true,
  );
  assert.equal(rows[0].paidMinutes, 480);
  assert.ok(
    calls[0].steps
      .find((s) => s[0] === "select")[1]
      .includes("paidMinutes:review_net_minutes"),
  );
  assert.equal(calls.length, 1);
});
test("net reads fail visibly for missing or invalid totals instead of falling back to gross", async () => {
  for (const paidMinutes of [undefined, null, -1, 480.5, "480"]) {
    const { db } = fakeDb([{ data: [{ id: "a", paidMinutes }] }]);
    await assert.rejects(
      makeTimeApi(db, profile).entries("2026-11-01", "2026-11-30", true),
      /Nettotunteja/,
    );
  }
});
test("save whitelists payload and cannot impersonate another employee", async () => {
  const { db, calls } = fakeDb([{ data: [{ id: "x" }] }]);
  await makeTimeApi(db, profile).save({
    work_date: "2026-11-11",
    worksite_id: "site",
    littera_id: "l",
    start_time: "07:00",
    end_time: "15:30",
    employee_id: "other",
    organization_id: "other",
    status: "approved",
    paidMinutes: 999,
  });
  const payload = calls[0].steps.find((s) => s[0] === "insert")[1];
  assert.equal(payload.employee_id, "worker-1");
  assert.equal(payload.organization_id, "org-1");
  assert.equal(payload.status, "draft");
  assert.equal(payload.paidMinutes, undefined);
});
test("save reports zero updated rows as failure, not success", async () => {
  const { db } = fakeDb([{ data: [] }]);
  await assert.rejects(
    () => makeTimeApi(db, profile).save({ id: "x" }),
    /ei voitu tallentaa/,
  );
});
test("empty submission and locked deletion fail visibly", async () => {
  const { db } = fakeDb([{ data: [] }, { data: [] }]);
  const api = makeTimeApi(db, profile);
  await assert.rejects(() => api.submit("2026-11-11"), /ei ole/);
  await assert.rejects(() => api.remove("x"), /lukittu/);
});
test("return requires a reason and no request is sent without it", async () => {
  const { db, calls } = fakeDb([]);
  await assert.rejects(
    () =>
      makeTimeApi(db, profile).review(
        [{ id: "a", status: "approved" }],
        "returned",
        "",
      ),
    /syy/,
  );
  assert.equal(calls.length, 0);
});
test("approval targets submitted entries, never drafts or approved entries", async () => {
  const { db, calls } = fakeDb([{ data: [{ id: "a" }] }]);
  await makeTimeApi(db, profile).review(
    [
      { id: "a", status: "submitted" },
      { id: "b", status: "draft" },
      { id: "c", status: "approved" },
    ],
    "approved",
    "",
  );
  assert.deepEqual(
    calls[0].steps.find((s) => s[0] === "in" && s[1] === "id"),
    ["in", "id", ["a"]],
  );
  assert.deepEqual(
    calls[0].steps.find((s) => s[0] === "in" && s[1] === "status"),
    ["in", "status", ["submitted"]],
  );
});
test("partial approval is surfaced, including concurrent changes", async () => {
  const { db } = fakeDb([{ data: [{ id: "a" }] }]);
  await assert.rejects(
    () =>
      makeTimeApi(db, profile).review(
        [
          { id: "a", status: "submitted" },
          { id: "b", status: "submitted" },
        ],
        "approved",
        "",
      ),
    /Kaikkia rivejä/,
  );
});
test("approved day can be returned with a reason in an open period", async () => {
  const { db, calls } = fakeDb([{ data: [] }, { data: [{ id: "a" }] }]);
  await makeTimeApi(db, profile).review(
    [
      {
        id: "a",
        employee_id: "w",
        worksite_id: "s",
        work_date: "2026-11-11",
        status: "approved",
      },
    ],
    "returned",
    "Tarkista loppuaika",
  );
  assert.equal(calls[0].table, "day_notes");
  assert.deepEqual(
    calls[1].steps.find((s) => s[0] === "in" && s[1] === "status"),
    ["in", "status", ["submitted", "approved"]],
  );
});
