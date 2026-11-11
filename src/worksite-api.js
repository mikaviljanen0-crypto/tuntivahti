import { allPages } from "./time-api.js";

export function makeWorksiteApi(db, orgId) {
  const org = (q) => q.eq("organization_id", orgId);
  return {
    async load() {
      const [sites, litteras, foremen] = await Promise.all([
        allPages(() =>
          org(
            db
              .from("worksites")
              .select(
                "id,number,name,status,foreman_id,allowed_littera_ids,updated_at",
              ),
          )
            .order("number")
            .order("id"),
        ),
        allPages(() =>
          org(db.from("litteras").select("id,code,name,active"))
            .order("code")
            .order("id"),
        ),
        allPages(() =>
          org(db.from("profiles").select("id,full_name"))
            .or("role.eq.foreman,is_foreman.eq.true")
            .eq("active", true)
            .order("full_name")
            .order("id"),
        ),
      ]);
      return { sites, litteras, foremen };
    },
    async save(value, original = null) {
      const payload = {
        number: value.number.trim(),
        name: value.name.trim(),
        foreman_id: value.foreman_id || null,
        allowed_littera_ids: [...new Set(value.allowed_littera_ids || [])],
        updated_at: new Date().toISOString(),
      };
      if (!payload.number || !payload.name)
        throw new Error("Anna työmaan numero ja nimi.");
      if (!original && !payload.allowed_littera_ids.length)
        throw new Error("Valitse uudelle työmaalle vähintään yksi littera.");
      const q = original
        ? org(db.from("worksites").update(payload))
            .eq("id", original.id)
            .eq("updated_at", original.updated_at)
        : db
            .from("worksites")
            .insert({ ...payload, organization_id: orgId, status: "active" });
      const result = await q.select("id");
      if (result.error)
        throw new Error(
          result.error.code === "23505"
            ? "Työmaanumero on jo käytössä."
            : result.error.message,
        );
      if (result.data?.length !== 1)
        throw new Error(
          "Työmaan tiedot ovat muuttuneet tai oikeutesi eivät riitä. Sulje lomake ja päivitä luettelo ennen uutta tallennusta.",
        );
    },
    async toggle(site) {
      const r = await org(
        db
          .from("worksites")
          .update({
            status: site.status === "active" ? "closed" : "active",
            updated_at: new Date().toISOString(),
          }),
      )
        .eq("id", site.id)
        .eq("updated_at", site.updated_at)
        .select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1)
        throw new Error(
          "Työmaan tiedot muuttuivat. Päivitä luettelo ja yritä uudelleen.",
        );
    },
  };
}
