import React, { useState, useEffect, useMemo } from "react";
import { makeWorksiteApi } from "./worksite-api.js";
import { DayDialog, Icon } from "./TimeStudio.jsx";

export default function Worksites({ db, orgId, apiOverride }) {
  const api = useMemo(
    () => apiOverride || makeWorksiteApi(db, orgId),
    [db, orgId, apiOverride],
  );
  const [data, setData] = useState({ sites: [], litteras: [], foremen: [] });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [version, setVersion] = useState(0),
    [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .load()
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, version]);
  const reload = () => setVersion((v) => v + 1);
  async function toggle(site) {
    if (
      !window.confirm(
        `${site.status === "active" ? "Suljetaanko" : "Avataanko"} työmaa ${site.number} – ${site.name}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.toggle(site);
      setMessage("Työmaan tila päivitetty.");
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const unreviewed = data.sites.filter(
    (s) => s.status === "active" && s.allowed_littera_ids == null,
  ).length;
  const sites = data.sites.filter((s) =>
    `${s.number} ${s.name}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="s-page-title">
        <div>
          <span className="s-eyebrow">TYÖMAAREKISTERI</span>
          <h1>Oikeat tunnit oikealle litteralle.</h1>
          <p>Valitse kullekin työmaalle sen tavoitearvion mukaiset litterat.</p>
        </div>
        <button
          className="s-primary"
          disabled={loading || !!error || busy}
          onClick={() => setEditing({})}
        >
          <Icon name="plus" size={18} /> Lisää työmaa
        </button>
      </div>
      {error && (
        <div className="s-notice error" role="alert">
          {error} <button onClick={reload}>Päivitä luettelo</button>
        </div>
      )}
      {message && (
        <div className="s-notice" role="status">
          {message}
        </div>
      )}
      {!!unreviewed && (
        <div className="s-site-warning">
          <Icon name="alert" />
          <div>
            <strong>{unreviewed} työmaan litterat tarkistamatta</strong>
            <p>
              Vanhoilla työmailla nykyiset litterat pysyvät käytössä, kunnes
              vahvistat työmaakohtaiset valinnat. Aiemmat kirjaukset säilyvät
              muuttumattomina.
            </p>
          </div>
        </div>
      )}
      <section className="s-card">
        <div className="s-worksite-search">
          <label className="s-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Hae työmaata"
              placeholder="Hae numerolla tai nimellä…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <div className="s-loading" role="status">
            Ladataan työmaita…
          </div>
        ) : (
          <div className="s-worksite-list">
            {sites.map((site) => (
              <article key={site.id} className="s-worksite-row">
                <div>
                  <span className="s-eyebrow">{site.number}</span>
                  <h3>{site.name}</h3>
                  <p>
                    {data.foremen.find((f) => f.id === site.foreman_id)
                      ?.full_name || "Vastuullista työnjohtajaa ei valittu"}
                  </p>
                </div>
                <div className="s-worksite-actions">
                  <span className={`s-site-state ${site.status}`}>
                    {site.status === "active" ? "Aktiivinen" : "Suljettu"}
                  </span>
                  <button
                    className={`s-secondary ${site.allowed_littera_ids == null ? "s-needs-review" : ""}`}
                    disabled={busy}
                    onClick={() => setEditing(site)}
                  >
                    {site.allowed_littera_ids == null
                      ? "Valitse litterat"
                      : `Litterat · ${site.allowed_littera_ids.length}`}{" "}
                    <Icon name="arrow" size={14} />
                  </button>
                  <button
                    className="s-text-button"
                    disabled={busy}
                    onClick={() => toggle(site)}
                  >
                    {site.status === "active" ? "Sulje" : "Avaa"}
                  </button>
                </div>
              </article>
            ))}
            {!sites.length && (
              <p className="s-loading">Työmaita ei löytynyt.</p>
            )}
          </div>
        )}
      </section>
      {editing && (
        <SiteEditor
          key={editing.id || "new"}
          site={editing}
          data={data}
          api={api}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage("Työmaa ja litteravalinnat tallennettu.");
            reload();
          }}
        />
      )}
    </>
  );
}

function SiteEditor({ site, data, api, onClose, onSaved }) {
  const [form, setForm] = useState({
    number: site.number || "",
    name: site.name || "",
    foreman_id: site.foreman_id || "",
    allowed_littera_ids: site.allowed_littera_ids || [],
  });
  const [search, setSearch] = useState(""),
    [selectedOnly, setSelectedOnly] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setError("");
  };
  const toggle = (id) =>
    set(
      "allowed_littera_ids",
      form.allowed_littera_ids.includes(id)
        ? form.allowed_littera_ids.filter((x) => x !== id)
        : [...form.allowed_littera_ids, id],
    );
  const options = data.litteras.filter(
    (l) =>
      (l.active !== false || form.allowed_littera_ids.includes(l.id)) &&
      (!selectedOnly || form.allowed_littera_ids.includes(l.id)) &&
      `${l.code} ${l.name}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const close = () => {
    if (
      !busy &&
      (!dirty ||
        window.confirm("Hylätäänkö tallentamattomat työmaan muutokset?"))
    )
      onClose();
  };
  async function save(e) {
    e.preventDefault();
    if (!site.id && !form.allowed_littera_ids.length)
      return setError("Valitse vähintään yksi littera.");
    if (
      site.id &&
      !form.allowed_littera_ids.length &&
      !window.confirm(
        "Yhtään litteraa ei ole valittu. Uusien tuntien kirjaaminen tälle työmaalle estyy. Vahvistetaanko tyhjä valinta?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api.save(form, site.id ? site : null);
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <DayDialog
      title={site.id ? `${site.number} · Työmaan litterat` : "Lisää työmaa"}
      onClose={close}
    >
      <form onSubmit={save}>
        <div className="s-dialog-body s-site-editor">
          <div className="s-form-grid">
            <label>
              Työmaanumero
              <input
                value={form.number}
                required
                disabled={busy}
                onChange={(e) => set("number", e.target.value)}
                placeholder="Esim. 2612"
              />
            </label>
            <label>
              Työmaan nimi
              <input
                value={form.name}
                required
                disabled={busy}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
          </div>
          <label className="s-form-label">
            Vastuullinen työnjohtaja
            <select
              value={form.foreman_id}
              disabled={busy}
              onChange={(e) => set("foreman_id", e.target.value)}
            >
              <option value="">Ei valittu</option>
              {data.foremen.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="s-littera-heading">
            <div>
              <h3>Työmaalla käytettävät litterat</h3>
              <p>
                Valitse vain tälle työmaalle budjetoidut työvaiheet. Lisätyön
                litteran voit avata myöhemmin. Valinta ei tuo tai muuta
                kustannusarviota.
              </p>
            </div>
            <strong>{form.allowed_littera_ids.length} valittu</strong>
          </div>
          {site.id && site.allowed_littera_ids == null && (
            <p className="s-site-warning">
              Valintoja ei ole vielä vahvistettu. Yhtään litteraa ei ole valittu
              automaattisesti aiempien kirjausten perusteella.
            </p>
          )}
          <div className="s-littera-filters">
            <input
              type="search"
              aria-label="Hae litteraa"
              placeholder="Hae litteran numerolla tai nimellä…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={selectedOnly}
                onChange={(e) => setSelectedOnly(e.target.checked)}
              />{" "}
              Vain valitut
            </label>
          </div>
          <fieldset className="s-littera-options" disabled={busy}>
            <legend className="sr-only">Aktivoitavat litterat</legend>
            {options.map((l) => (
              <label
                key={l.id}
                className={
                  form.allowed_littera_ids.includes(l.id) ? "selected" : ""
                }
              >
                <input
                  type="checkbox"
                  checked={form.allowed_littera_ids.includes(l.id)}
                  onChange={() => toggle(l.id)}
                />
                <strong>{l.code}</strong>
                <span>
                  {l.name}
                  {l.active === false ? " (ei enää aktiivinen)" : ""}
                </span>
              </label>
            ))}
            {!options.length && <p>Ei litteroita tällä haulla.</p>}
          </fieldset>
          <p className="s-site-hint">
            Tallennus rajaa uudet kirjaukset ja litterakorjaukset valittuihin
            litteroihin. Vanhat tunnit, hyväksynnät ja raportit säilyvät.
          </p>
          {error && (
            <div className="s-notice error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="s-dialog-actions">
          <button
            type="button"
            className="s-secondary"
            disabled={busy}
            onClick={close}
          >
            Peruuta
          </button>
          <button className="s-primary" disabled={busy}>
            {busy
              ? "Tallennetaan…"
              : site.id
                ? "Vahvista litterat ja tallenna"
                : "Tallenna työmaa"}
          </button>
        </footer>
      </form>
    </DayDialog>
  );
}
