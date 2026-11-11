import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  allocateEntries,
  compareWorkersBySurname,
  filterEntries,
} from "./time-model.js";

test("surname order uses Finnish collation, given names break ties, input is not mutated", () => {
  const workers = [
    "Afrim Tafili",
    "Zeno Gashi",
    "Alban Gashi",
    "Leo Örn",
    "Anna Ääri",
    "Arto Åberg",
    "Ari Zeta",
    "  Mika   Viljanen  ",
    "Esa Laine-Kivi",
    "Alban  Gashi",
  ].map((full_name, id) => ({ id: String(id).padStart(2, "0"), full_name }));
  const original = structuredClone(workers);
  assert.deepEqual(
    [...workers].sort(compareWorkersBySurname).map((w) => w.id),
    ["02", "09", "01", "08", "00", "07", "06", "05", "04", "03"],
  );
  assert.deepEqual(workers, original);
  assert.ok(
    Number.isFinite(
      compareWorkersBySurname(
        { id: "1", full_name: "Alban" },
        { id: "2", full_name: null },
      ),
    ),
  );
});

test("Postgres net minutes match lunch allocation and never disclose other sites or organizations", async (t) => {
  const db = new PGlite();
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const org = id(1),
    otherOrg = id(2),
    worker = id(10),
    otherWorker = id(11),
    admin = id(12),
    foreman = id(13),
    outsider = id(14),
    inactive = id(15),
    site = id(20),
    otherSite = id(21),
    foreignSite = id(22);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      create table profiles(id uuid primary key,organization_id uuid,role text,active boolean);
      create table worksites(id uuid primary key,organization_id uuid,foreman_id uuid);
      create table time_entries(id uuid primary key,organization_id uuid,employee_id uuid,worksite_id uuid,work_date date,start_time time,end_time time,status text);
      create index on time_entries(employee_id,work_date);
      insert into profiles values ('${worker}','${org}','worker',true),('${otherWorker}','${org}','worker',true),('${admin}','${org}','admin',true),('${foreman}','${org}','foreman',true),('${outsider}','${otherOrg}','admin',true),('${inactive}','${org}','admin',false);
      insert into worksites values ('${site}','${org}','${foreman}'),('${otherSite}','${org}',null),('${foreignSite}','${otherOrg}',null);
      alter table time_entries enable row level security;
      grant select on time_entries,profiles,worksites to authenticated;
      create policy entry_read on time_entries for select to authenticated using (
        exists(select 1 from profiles p where p.id=auth.uid() and p.organization_id=time_entries.organization_id
          and (time_entries.employee_id=p.id or p.role='admin' or exists(select 1 from worksites w where w.id=time_entries.worksite_id and w.foreman_id=p.id)))
      );
    `);
    const cases = [
      [["07:00", "15:30"]],
      [["07:00", "13:00"]],
      [["07:00", "13:01"]],
      [
        ["07:00", "10:00"],
        ["10:00", "15:30"],
      ],
      [
        ["07:00", "11:15"],
        ["11:15", "15:30"],
      ],
      [
        ["05:00", "10:00"],
        ["12:00", "14:00"],
      ],
      [
        ["05:00", "11:10"],
        ["12:00", "12:05"],
      ],
      [
        ["07:00", "11:00"],
        ["11:30", "14:30"],
      ],
      [
        ["07:00", "10:00"],
        ["12:00", "15:00"],
        ["15:00", "15:10"],
      ],
      [
        ["07:00", "12:00"],
        ["11:00", "14:00"],
      ], // historical overlap: same deterministic rule
      [
        ["07:00", "12:00"],
        ["07:00", "12:00"],
      ],
      [
        ["07:00", "11:00"],
        ["12:00", "12:00"],
      ],
      [["07:00:30", "15:30:45"]],
    ];
    for (let k = 0; k < 35; k++) {
      const clock = (n) =>
        `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
      let s = 240 + k * 7;
      const parts = [];
      for (let j = 0; j < 1 + (k % 5); j++) {
        const end = s + 20 + ((k * 31 + j * 37) % 200);
        parts.push([clock(s), clock(end)]);
        s = end + ((k + j) % 3) * 17;
      }
      cases.push(parts);
    }
    const rows = [];
    for (const [d, parts] of cases.entries())
      for (const [i, [start_time, end_time]] of parts.entries()) {
        const row = {
          id: id(1000 + rows.length),
          organization_id: org,
          employee_id: worker,
          worksite_id: i % 2 ? otherSite : site,
          work_date: `2026-${String(1 + Math.floor(d / 28)).padStart(2, "0")}-${String((d % 28) + 1).padStart(2, "0")}`,
          start_time,
          end_time,
          status: ["draft", "submitted", "approved", "returned"][i % 4],
        };
        rows.push(row);
        await db.query(
          "insert into time_entries values ($1,$2,$3,$4,$5,$6,$7,$8)",
          Object.values(row),
        );
      }
    const before = (await db.query("select * from time_entries order by id"))
      .rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261111125513_review_net_minutes.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await t.test("migration does not write history or change RLS", async () => {
      assert.deepEqual(
        (await db.query("select * from time_entries order by id")).rows,
        before,
      );
      assert.equal(
        (
          await db.query(
            "select relrowsecurity from pg_class where oid='public.time_entries'::regclass",
          )
        ).rows[0].relrowsecurity,
        true,
      );
    });
    const asUser = async (uid) => {
      await db.exec(
        `set role authenticated; set request.jwt.claim.sub='${uid}';`,
      );
    };
    const query = () =>
      db.query(
        "select id,public.review_net_minutes(e) as paid from public.time_entries e order by id",
      );
    const expected = allocateEntries(rows).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    await t.test(
      "all normal, short, split, fallback and historical days agree with the existing rule",
      async () => {
        await asUser(admin);
        assert.deepEqual(
          (await query()).rows,
          expected.map((r) => ({ id: r.id, paid: r.paidMinutes })),
        );
        await asUser(worker);
        assert.deepEqual(
          (await query()).rows,
          expected.map((r) => ({ id: r.id, paid: r.paidMinutes })),
        );
      },
    );
    await t.test(
      "foreman gets the correct share of lunch without receiving hidden entries",
      async () => {
        await asUser(foreman);
        const actual = (await query()).rows;
        assert.deepEqual(
          actual,
          filterEntries(expected, { site }).map((r) => ({
            id: r.id,
            paid: r.paidMinutes,
          })),
        );
        assert.equal(
          actual.length,
          rows.filter((r) => r.worksite_id === site).length,
        );
        const hidden = rows.find((r) => r.worksite_id === otherSite);
        await assert.rejects(
          db.query("select private.time_entry_net_minutes($1)", [hidden.id]),
          /Kirjausta ei voi lukea/,
        );
        await assert.rejects(
          db.query(
            "select public.review_net_minutes(jsonb_populate_record(null::public.time_entries,$1::jsonb))",
            [
              JSON.stringify({
                ...hidden,
                worksite_id: site,
                employee_id: foreman,
                organization_id: org,
              }),
            ],
          ),
          /Kirjausta ei voi lukea/,
        );
      },
    );
    await t.test(
      "other workers, foreign admins, inactive accounts and missing identity are denied",
      async () => {
        for (const uid of [otherWorker, outsider, inactive]) {
          await asUser(uid);
          await assert.rejects(
            db.query("select private.time_entry_net_minutes($1)", [rows[0].id]),
            /Kirjausta ei voi lukea/,
          );
        }
        await asUser("");
        await assert.rejects(
          db.query("select private.time_entry_net_minutes($1)", [rows[0].id]),
          /Kirjaudu/,
        );
        await db.exec("reset role; set role anon");
        await assert.rejects(
          db.query(
            "select public.review_net_minutes(null::public.time_entries)",
          ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "computed field has no named RPC argument, public wrapper is invoker, helper has fixed search path",
      async () => {
        await db.exec("reset role");
        const functions = (
          await db.query(
            "select n.nspname,p.proname,p.prosecdef,p.proargnames,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('review_net_minutes','time_entry_net_minutes') order by p.proname",
          )
        ).rows;
        assert.equal(functions[0].nspname, "public");
        assert.equal(functions[0].prosecdef, false);
        assert.equal(functions[0].proargnames, null);
        assert.equal(functions[1].nspname, "private");
        assert.equal(functions[1].prosecdef, true);
        for (const f of functions)
          assert.deepEqual(f.proconfig, ['search_path=""']);
        assert.deepEqual(
          (await db.query("select * from time_entries order by id")).rows,
          before,
        );
      },
    );
  } finally {
    await db.close();
  }
});
