const relation =
  "id,employee_id,worksite_id,littera_id,work_date,start_time,end_time,note,status,worksites(number,name),litteras(code,name,name_sq,name_en,name_uk),profiles!time_entries_employee_id_fkey(id,full_name,employer_id,employers(name))";
export async function allPages(makeQuery) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await makeQuery().range(
      page * 500,
      page * 500 + 499,
    );
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}
export function makeTimeApi(db, profile) {
  const org = (query) => query.eq("organization_id", profile.organization_id);
  return {
    async bootstrap() {
      const results = await Promise.all([
        org(
          db
            .from("worksites")
            .select("id,number,name,status,foreman_id,allowed_littera_ids"),
        ).order("number"),
        org(db.from("litteras").select("id,code,name,name_sq,name_en,name_uk"))
          .eq("active", true)
          .order("code"),
        org(db.from("payroll_periods").select("period_month,status")).eq(
          "status",
          "closed",
        ),
        profile.role === "worker"
          ? Promise.resolve({ data: [] })
          : org(
              db
                .from("profiles")
                .select("id,full_name,active,employer_id,employers(name)"),
            )
              .eq("role", "worker")
              .order("full_name"),
        org(db.from("employers").select("id,name"))
          .eq("active", true)
          .order("name"),
      ]);
      for (const r of results) if (r.error) throw r.error;
      return {
        sites: results[0].data || [],
        litteras: results[1].data || [],
        closed: (results[2].data || []).map((r) => r.period_month.slice(0, 7)),
        workers: results[3].data || [],
        employers: results[4].data || [],
      };
    },
    entries(from, to) {
      return allPages(() => {
        let q = org(db.from("time_entries").select(relation))
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date")
          .order("id");
        if (profile.role === "worker") q = q.eq("employee_id", profile.id);
        return q;
      });
    },
    notes(from, to) {
      return allPages(() => {
        let q = org(
          db
            .from("day_notes")
            .select("id,employee_id,work_date,worksite_id,note"),
        )
          .gte("work_date", from)
          .lte("work_date", to)
          .order("id");
        if (profile.role === "worker") q = q.eq("employee_id", profile.id);
        return q;
      });
    },
    async save(value) {
      const {
        id,
        work_date,
        worksite_id,
        littera_id,
        start_time,
        end_time,
        note,
      } = value;
      const payload = {
        work_date,
        worksite_id,
        littera_id,
        start_time,
        end_time,
        note,
        status: "draft",
        employee_id: profile.id,
        organization_id: profile.organization_id,
        updated_at: new Date().toISOString(),
      };
      let q = id
        ? org(db.from("time_entries").update(payload))
            .eq("id", id)
            .eq("employee_id", profile.id)
            .in("status", ["draft", "returned", "submitted"])
        : db.from("time_entries").insert(payload);
      const r = await q.select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1)
        throw new Error(
          "Kirjausta ei voitu tallentaa. Päivitä näkymä ja tarkista lukitus.",
        );
      return r.data[0];
    },
    async submit(date) {
      const r = await org(
        db.from("time_entries").update({
          status: "submitted",
          updated_at: new Date().toISOString(),
        }),
      )
        .eq("employee_id", profile.id)
        .eq("work_date", date)
        .in("status", ["draft", "returned"])
        .select("id");
      if (r.error) throw r.error;
      if (!r.data?.length)
        throw new Error("Päivässä ei ole lähetettäviä kirjauksia.");
    },
    async remove(id) {
      const r = await org(db.from("time_entries").delete())
        .eq("id", id)
        .eq("employee_id", profile.id)
        .in("status", ["draft", "returned", "submitted"])
        .select("id");
      if (r.error) throw r.error;
      if (!r.data?.length)
        throw new Error("Kirjaus on lukittu tai se on jo poistettu.");
    },
    async changeLittera(row, litteraId) {
      const r = await org(
        db.from("time_entries").update({
          littera_id: litteraId,
          updated_at: new Date().toISOString(),
        }),
      )
        .eq("id", row.id)
        .select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1)
        throw new Error(
          "Litteraa ei voitu muuttaa. Tarkista lukitus ja käyttöoikeudet.",
        );
    },
    async saveNote(row, note) {
      const r = note.trim()
        ? await db.from("day_notes").upsert(
            {
              organization_id: profile.organization_id,
              employee_id: row.employee_id,
              worksite_id: row.worksite_id,
              work_date: row.work_date,
              author_id: profile.id,
              note: note.trim(),
            },
            { onConflict: "employee_id,work_date,worksite_id" },
          )
        : await org(db.from("day_notes").delete())
            .eq("employee_id", row.employee_id)
            .eq("worksite_id", row.worksite_id)
            .eq("work_date", row.work_date);
      if (r.error) throw r.error;
    },
    async review(rows, status, note) {
      if (!["approved", "returned"].includes(status))
        throw new Error("Virheellinen hyväksyntätila.");
      const allowed =
        status === "returned" ? ["submitted", "approved"] : ["submitted"];
      const ids = rows
        .filter((r) => allowed.includes(r.status))
        .map((r) => r.id);
      if (!ids.length) throw new Error("Ei käsiteltäviä kirjauksia.");
      if (status === "returned" && !note.trim())
        throw new Error("Kirjoita palautuksen syy.");
      if (note.trim()) {
        const first = rows[0];
        const r = await db.from("day_notes").upsert(
          {
            organization_id: profile.organization_id,
            employee_id: first.employee_id,
            worksite_id: first.worksite_id,
            work_date: first.work_date,
            author_id: profile.id,
            note: note.trim(),
          },
          { onConflict: "employee_id,work_date,worksite_id" },
        );
        if (r.error) throw r.error;
      }
      const r = await org(
        db
          .from("time_entries")
          .update({ status, updated_at: new Date().toISOString() }),
      )
        .in("id", ids)
        .in("status", allowed)
        .select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== ids.length)
        throw new Error(
          "Kaikkia rivejä ei päivitetty. Tarkista päivän ajantasainen tila.",
        );
    },
  };
}
