import test from "node:test";
import assert from "node:assert/strict";
import { previewRequestAllowed, createPreviewFetch } from "./preview-guard.js";
const base = "https://example.supabase.co";
test("preview permits table reads and normal login/refresh/logout", () => {
  assert.equal(
    previewRequestAllowed(`${base}/rest/v1/time_entries`, {}, base),
    true,
  );
  for (const path of [
    "/auth/v1/token?grant_type=password",
    "/auth/v1/token?grant_type=refresh_token",
    "/auth/v1/logout",
    "/functions/v1/login-with-phone",
  ])
    assert.equal(
      previewRequestAllowed(base + path, { method: "POST" }, base),
      true,
    );
});
test("preview blocks all table, RPC, storage and admin function writes", () => {
  for (const path of [
    "/rest/v1/time_entries",
    "/rest/v1/payroll_periods",
    "/rest/v1/day_notes",
    "/rest/v1/rpc/close_payroll_period",
    "/functions/v1/create-user",
    "/storage/v1/object/files/test",
  ])
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      assert.equal(previewRequestAllowed(base + path, { method }, base), false);
});
test("preview blocks password/account changes and foreign destinations", () => {
  assert.equal(
    previewRequestAllowed(`${base}/auth/v1/user`, { method: "PUT" }, base),
    false,
  );
  assert.equal(
    previewRequestAllowed(`${base}/auth/v1/recover`, { method: "POST" }, base),
    false,
  );
  assert.equal(
    previewRequestAllowed(
      "https://other.example/auth/v1/token",
      { method: "POST" },
      base,
    ),
    false,
  );
});
test("Request objects retain their method unless explicitly overridden", () => {
  const request = new Request(`${base}/rest/v1/time_entries`, {
    method: "DELETE",
  });
  assert.equal(previewRequestAllowed(request, undefined, base), false);
  assert.equal(previewRequestAllowed(request, { method: "GET" }, base), true);
});
test("blocked preview writes never reach the underlying transport", async () => {
  let requests = 0;
  const fetcher = createPreviewFetch(base, async () => {
    requests++;
    return new Response("{}");
  });
  const response = await fetcher(`${base}/rest/v1/time_entries`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "PREVIEW_READ_ONLY");
  assert.equal(requests, 0);
  await fetcher(`${base}/rest/v1/time_entries`);
  assert.equal(requests, 1);
});
