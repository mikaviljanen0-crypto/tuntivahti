import test from "node:test";
import assert from "node:assert/strict";
import { makeWorksiteApi } from "./worksite-api.js";
function fakeDb(response) {
  const calls = [];
  return {
    calls,
    db: {
      from(table) {
        const steps = [];
        calls.push({ table, steps });
        const q = {
          then: (resolve, reject) =>
            Promise.resolve(response).then(resolve, reject),
        };
        for (const k of ["select", "eq", "insert", "update"])
          q[k] = (...args) => {
            steps.push([k, ...args]);
            return q;
          };
        return q;
      },
    },
  };
}
test("new site and selected codes save atomically in the authorized org", async () => {
  const { db, calls } = fakeDb({ data: [{ id: "s" }] });
  await makeWorksiteApi(db, "org").save({
    number: " 2601 ",
    name: " Site ",
    allowed_littera_ids: ["a", "a", "b"],
    organization_id: "bad",
    status: "closed",
  });
  assert.equal(calls.length, 1);
  const payload = calls[0].steps.find((s) => s[0] === "insert")[1];
  assert.deepEqual(payload.allowed_littera_ids, ["a", "b"]);
  assert.equal(payload.organization_id, "org");
  assert.equal(payload.status, "active");
  assert.equal(payload.number, "2601");
});
test("new sites cannot be saved without selected codes", async () => {
  const { db, calls } = fakeDb({ data: [] });
  await assert.rejects(
    () =>
      makeWorksiteApi(db, "org").save({
        number: "2601",
        name: "Site",
        allowed_littera_ids: [],
      }),
    /vähintään/,
  );
  assert.equal(calls.length, 0);
});
test("editing guards against concurrent changes and never reports RLS zero writes as success", async () => {
  const { db, calls } = fakeDb({ data: [] });
  await assert.rejects(
    () =>
      makeWorksiteApi(db, "org").save(
        { number: "1", name: "Site", allowed_littera_ids: ["a"] },
        { id: "s", updated_at: "before" },
      ),
    /muuttuneet/,
  );
  assert.ok(
    calls[0].steps.some(
      (s) => s[0] === "eq" && s[1] === "updated_at" && s[2] === "before",
    ),
  );
  assert.ok(
    calls[0].steps.some(
      (s) => s[0] === "eq" && s[1] === "organization_id" && s[2] === "org",
    ),
  );
});
test("a reviewed site may be intentionally configured to allow no new work", async () => {
  const { db, calls } = fakeDb({ data: [{ id: "s" }] });
  await makeWorksiteApi(db, "org").save(
    { number: "1", name: "Site", allowed_littera_ids: [] },
    { id: "s", updated_at: "before" },
  );
  assert.deepEqual(
    calls[0].steps.find((s) => s[0] === "update")[1].allowed_littera_ids,
    [],
  );
});
