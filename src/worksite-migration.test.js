import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Postgres enforces site code choices without rewriting history or bypassing RLS", async (t) => {
  const db = new PGlite();
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const org = id(1),
    other = id(2),
    site = id(3),
    code = id(4),
    removed = id(5),
    foreign = id(6),
    off = id(7),
    legacy = id(8);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table worksites(id uuid primary key, organization_id uuid, name text);
      create table litteras(id uuid primary key, organization_id uuid, active boolean);
      create table time_entries(id uuid primary key default gen_random_uuid(), organization_id uuid,employee_id uuid,worksite_id uuid,littera_id uuid,work_date date,start_time time,end_time time,note text,status text);
      insert into worksites values ('${site}','${org}','Old site'),('${legacy}','${org}','Legacy'),('${id(9)}','${other}','Other org');
      insert into litteras values ('${code}','${org}',true),('${removed}','${org}',true),('${foreign}','${other}',true),('${off}','${org}',false);
      insert into time_entries(organization_id,employee_id,worksite_id,littera_id,work_date,start_time,end_time,note,status) values ('${org}','${id(10)}','${site}','${removed}','2026-11-11','07:00','15:30','history','submitted');
      alter table worksites enable row level security; alter table litteras enable row level security; alter table time_entries enable row level security;
      grant select,insert,update,delete on worksites,litteras,time_entries to authenticated;
      create policy site_read on worksites for select to authenticated using(organization_id=current_setting('test.org')::uuid);
      create policy site_admin on worksites for all to authenticated using(organization_id=current_setting('test.org')::uuid and current_setting('test.app_role')='admin') with check(organization_id=current_setting('test.org')::uuid and current_setting('test.app_role')='admin');
      create policy code_read on litteras for select to authenticated using(organization_id=current_setting('test.org')::uuid);
      create policy entry_own_org on time_entries for all to authenticated using(organization_id=current_setting('test.org')::uuid) with check(organization_id=current_setting('test.org')::uuid);
      set test.org='${org}'; set test.app_role='admin';
    `);
    const before = (await db.query("select * from time_entries")).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261111120148_worksite_littera_selection.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const insert = (s = site, c = code, o = org) =>
      db.query(
        `insert into time_entries(organization_id,employee_id,worksite_id,littera_id,work_date,start_time,end_time,status) values ($1,$2,$3,$4,'2026-11-12','07:00','15:30','draft') returning id`,
        [o, id(10), s, c],
      );
    await t.test(
      "migration leaves every historical entry and legacy setting untouched",
      async () => {
        assert.deepEqual(
          (await db.query("select * from time_entries")).rows,
          before,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from worksites where allowed_littera_ids is null",
            )
          ).rows[0].n,
          3,
        );
      },
    );
    await db.exec("set role authenticated");
    await t.test(
      "new sites require explicit valid nonempty lists",
      async () => {
        await assert.rejects(
          db.query(
            `insert into worksites(id,organization_id) values ('${id(20)}','${org}')`,
          ),
          /Valitse/,
        );
        await assert.rejects(
          db.query(
            `insert into worksites(id,organization_id,allowed_littera_ids) values ('${id(20)}','${org}','{}')`,
          ),
          /Valitse/,
        );
        await db.query(
          `insert into worksites(id,organization_id,allowed_littera_ids) values ($1,$2,$3)`,
          [id(20), org, [code]],
        );
      },
    );
    await t.test(
      "invalid cross-org, inactive, duplicate and null choices are rejected atomically",
      async () => {
        for (const codes of [[foreign], [off], [code, code], [null], [id(90)]])
          await assert.rejects(
            db.query(
              "update worksites set allowed_littera_ids=$1 where id=$2",
              [codes, site],
            ),
          );
        assert.equal(
          (
            await db.query(
              "select allowed_littera_ids from worksites where id=$1",
              [site],
            )
          ).rows[0].allowed_littera_ids,
          null,
        );
        await db.query(
          "update worksites set allowed_littera_ids=$1 where id=$2",
          [[code], site],
        );
      },
    );
    await t.test(
      "confirmed sites cannot silently revert to unrestricted legacy mode",
      async () => {
        await assert.rejects(
          db.query(
            "update worksites set allowed_littera_ids=null where id=$1",
            [site],
          ),
          /Valitse/,
        );
      },
    );
    await db.exec("set test.app_role='worker'");
    await t.test(
      "worker cannot change allowlists; valid work is allowed under invoker RLS",
      async () => {
        assert.equal(
          (
            await db.query(
              "update worksites set allowed_littera_ids=$1 where id=$2 returning id",
              [[removed], site],
            )
          ).rows.length,
          0,
        );
        assert.equal((await insert()).rows.length, 1);
      },
    );
    await t.test(
      "forbidden site code, inactive, foreign and forged site are blocked",
      async () => {
        await assert.rejects(insert(site, removed), /ei ole käytössä/);
        await assert.rejects(insert(site, off), /aktiivinen/);
        await assert.rejects(insert(site, foreign), /aktiivinen/);
        await assert.rejects(insert(id(9), code), /Työmaa/);
      },
    );
    await t.test("legacy sites keep working pending review", async () => {
      assert.equal((await insert(legacy, removed)).rows.length, 1);
    });
    await t.test(
      "old allocations may be approved or annotated but not extended or copied",
      async () => {
        await db.query(
          "update time_entries set note='checked',status='approved' where id=$1",
          [before[0].id],
        );
        for (const change of [
          "end_time='16:30'",
          "start_time='06:00'",
          "work_date='2026-11-13'",
        ])
          await assert.rejects(
            db.query(`update time_entries set ${change} where id=$1`, [
              before[0].id,
            ]),
            /ei ole käytössä/,
          );
      },
    );
    await db.exec("set test.app_role='admin'");
    await t.test("manager correction also obeys allowlist", async () => {
      await assert.rejects(
        db.query(
          "update time_entries set littera_id=$1 where worksite_id=$2 and littera_id=$3",
          [removed, site, code],
        ),
        /ei ole käytössä/,
      );
      await db.query("update time_entries set littera_id=$1 where id=$2", [
        code,
        before[0].id,
      ]);
    });
    await t.test(
      "empty confirmed list intentionally blocks new work without deleting history",
      async () => {
        await db.query(
          "update worksites set allowed_littera_ids='{}' where id=$1",
          [site],
        );
        await assert.rejects(insert(), /ei ole käytössä/);
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from time_entries where worksite_id=$1",
              [site],
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test(
      "trigger functions are not directly callable RPCs",
      async () => {
        assert.equal(
          (
            await db.query(
              "select has_function_privilege('authenticated','public.validate_time_entry_littera()','EXECUTE') allowed",
            )
          ).rows[0].allowed,
          false,
        );
      },
    );
  } finally {
    await db.close();
  }
});
