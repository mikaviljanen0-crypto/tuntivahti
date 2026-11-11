import React, { useState, useEffect, useMemo, useRef } from "react";
import { makeTimeApi } from "./time-api.js";
import {
  helsinkiToday as today,
  dateShift,
  weekDates,
  monthDates,
  monthShift,
  litterasForSite,
  entryLitteraAllowed,
  allocateDay,
  allocateEntries,
  formatHours as hours,
  grossMinutes,
  compareWorkersBySurname,
  dayState,
  validateEntry,
  filterEntries,
  csvText,
} from "./time-model.js";
import { studioText } from "./studio-i18n.js";
import { translatedLitteraName, languageLocale } from "./i18n.js";
import "./studio.css";

const paths = {
  clock: "M12 8v4l3 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  check: "m5 12 4 4L19 6",
  calendar:
    "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 2v4 M17 2v4 M3 10h18",
  alert: "M12 8v5 M12 17h.01 M12 2 2 21h20Z",
  site: "M4 21V5h12v16 M8 9h4 M8 13h4 M8 17h4 M16 11h4v10",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
  report: "M4 20V4h16v16z M8 16v-3 M12 16V8 M16 16v-6",
  plus: "M12 5v14 M5 12h14",
  arrow: "m9 5 7 7-7 7",
  back: "m15 5-7 7 7 7",
  logout: "M9 4H4v16h5 M10 12h11 m-4-4 4 4-4 4",
  download: "M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5",
  search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 m5-2 6 6",
  close: "m6 6 12 12 M6 18 18 6",
  link: "M10 3H3v18h18v-7 M14 3h7v7 M21 3 10 14",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4",
};
export const Icon = ({ name, size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d={paths[name] || paths.clock} />
  </svg>
);
const dateLabel = (
  date,
  lang = "fi",
  options = { day: "numeric", month: "numeric" },
) => {
  const value = new Date(`${date}T12:00:00Z`);
  // Some mobile/browser ICU builds do not include Albanian date names.
  if (lang === "sq") {
    const weekdays = [
      "e diel",
      "e hënë",
      "e martë",
      "e mërkurë",
      "e enjte",
      "e premte",
      "e shtunë",
    ];
    const shortDays = ["Di", "Hë", "Ma", "Më", "En", "Pr", "Sh"];
    const months = [
      "janar",
      "shkurt",
      "mars",
      "prill",
      "maj",
      "qershor",
      "korrik",
      "gusht",
      "shtator",
      "tetor",
      "nëntor",
      "dhjetor",
    ];
    let parts = [];
    if (options.weekday)
      parts.push(
        options.weekday === "short"
          ? shortDays[value.getUTCDay()]
          : weekdays[value.getUTCDay()],
      );
    if (options.day)
      parts.push(
        String(value.getUTCDate()) + (options.month === "numeric" ? "." : ""),
      );
    if (options.month)
      parts.push(
        options.month === "long"
          ? months[value.getUTCMonth()]
          : `${value.getUTCMonth() + 1}.`,
      );
    if (options.year) parts.push(String(value.getUTCFullYear()));
    return parts.join(
      options.month === "numeric" && !options.weekday ? "" : " ",
    );
  }
  return value.toLocaleDateString(languageLocale(lang), {
    timeZone: "Europe/Helsinki",
    ...options,
  });
};
const sum = (rows) =>
  rows.reduce((s, r) => s + (r.paidMinutes ?? grossMinutes(r)), 0) / 60;
function Badge({ state, lang = "fi" }) {
  return (
    <span className={`s-badge ${state}`}>
      <span />
      {studioText(lang, state)}
    </span>
  );
}
function Notice({ error, message }) {
  return (
    <>
      {error && (
        <div className="s-notice error" role="alert">
          <Icon name="alert" />
          {error}
        </div>
      )}
      {message && (
        <div className="s-notice success" role="status">
          <Icon name="check" />
          {message}
        </div>
      )}
    </>
  );
}
function Empty({ title, detail, children }) {
  return (
    <div className="s-empty">
      <span className="s-empty-icon">
        <Icon name="clock" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
function useRecords(api, from, to, net = false) {
  const [data, setData] = useState({
      entries: [],
      notes: [],
      sites: [],
      litteras: [],
      closed: [],
      workers: [],
      employers: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.bootstrap(),
      api.entries(from, to, net),
      api.notes(from, to),
    ])
      .then(([base, entries, notes]) => {
        if (active) setData({ ...base, entries, notes });
      })
      .catch((e) => {
        if (active) setError(e.message || "Tietojen haku epäonnistui.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, from, to, version, net]);
  return { ...data, loading, error, reload: () => setVersion((x) => x + 1) };
}
export function DayDialog({ children, title, onClose }) {
  const ref = useRef(null),
    previous = useRef(null);
  useEffect(() => {
    previous.current = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const first = dialog.querySelector("input,select,button");
    first?.focus();
    return () => {
      dialog.close();
      previous.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="s-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <span className="s-eyebrow">TUNTIVAHTI</span>
          <h2>{title}</h2>
        </div>
        <button
          className="s-icon-button"
          onClick={onClose}
          aria-label="Sulje / Close"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function TimeStudio({
  profile,
  db,
  onLogout,
  legacy = {},
  previewApi,
}) {
  const worker = profile.role === "worker";
  const [language, setLanguage] = useState(
    ["fi", "sq", "en", "uk"].includes(profile.language)
      ? profile.language
      : "fi",
  );
  const t = (key) => studioText(language, key);
  const available = worker
    ? ["today", "week", "attention"]
    : profile.role === "admin"
      ? [
          "review",
          "reports",
          "worksites",
          "employees",
          "translations",
          "periods",
        ]
      : ["review"];
  const initial = new URLSearchParams(window.location.search).get("view");
  const [view, setView] = useState(
    available.includes(initial) ? initial : available[0],
  );
  const api = useMemo(
    () => previewApi || makeTimeApi(db, profile),
    [db, profile, previewApi],
  );
  const items = worker
    ? [
        ["today", t("today"), "clock"],
        ["week", t("week"), "calendar"],
        ["attention", t("attention"), "alert"],
      ]
    : [
        ["review", "Tuntien tarkistus", "grid"],
        ...(profile.role === "admin"
          ? [
              ["reports", "Raportit", "report"],
              ["worksites", "Työmaat", "site"],
              ["employees", "Työntekijät", "users"],
              ["translations", "Litterakäännökset", "report"],
              ["periods", "Palkkakaudet", "lock"],
            ]
          : []),
      ];
  const portal =
    import.meta.env.VITE_PORTAL_URL ||
    "https://tjt-palvelin.tail528926.ts.net/";
  const Legacy = legacy[view];
  return (
    <div className={`studio ${worker ? "is-worker" : "is-manager"}`}>
      <aside className="s-sidebar">
        <a className="s-brand" href="?view=today">
          <span className="s-mark">
            <Icon name="clock" size={24} />
          </span>
          <span>
            Tuntivahti<small>TJT · TYÖAJAN HALLINTA</small>
          </span>
        </a>
        <div className="s-nav-caption">
          {worker ? "OMA TYÖPÄIVÄ" : "TYÖNJOHTO"}
        </div>
        <nav aria-label="Päänavigaatio">
          {items.map(([key, label, icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => setView(key)}
              aria-current={view === key ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {view === key && <i />}
            </button>
          ))}
        </nav>
        <div className="s-sidebar-bottom">
          {!worker && (portal === "/" || /^https:\/\//.test(portal)) && (
            <a className="s-portal" href={portal}>
              <Icon name="link" />
              TJT-portaali
            </a>
          )}
          <div className="s-person">
            <span className="s-avatar">
              {profile.full_name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{profile.full_name}</strong>
              <small>
                {worker
                  ? profile.employers?.name
                  : profile.role === "admin"
                    ? "Pääkäyttäjä"
                    : "Työnjohtaja"}
              </small>
            </div>
            <button
              onClick={onLogout}
              aria-label={t("logout")}
              title={t("logout")}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="s-main">
        <header className="s-topline">
          <span>
            <span className="s-mobile-brand">Tuntivahti</span>
            <span className="s-breadcrumb">
              {profile.organizations?.name || "Työajan hallinta"} <b>/</b>{" "}
              {items.find((x) => x[0] === view)?.[1]}
            </span>
          </span>
          <div className="s-top-actions">
            {worker && (
              <select
                aria-label="Kieli / Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="fi">Suomi</option>
                <option value="sq">Shqip</option>
                <option value="en">English</option>
                <option value="uk">Українська</option>
              </select>
            )}
            <span className="s-today">
              {dateLabel(today(), "fi", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              className="s-mobile-logout s-icon-button"
              onClick={onLogout}
              aria-label={t("logout")}
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        {!worker && (
          <nav
            className="s-manager-mobile-nav"
            aria-label="Työnjohdon navigaatio"
          >
            {items.map(([key, label, icon]) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => setView(key)}
                aria-current={view === key ? "page" : undefined}
              >
                <Icon name={icon} size={16} />
                {label}
              </button>
            ))}
            <a href={portal}>TJT-portaali ↗</a>
          </nav>
        )}
        {previewApi && <div className="s-preview-bar">{t("preview")}</div>}
        <main className="s-content">
          {worker ? (
            <WorkerDesk
              profile={profile}
              api={api}
              view={view}
              setView={setView}
              language={language}
            />
          ) : view === "review" ? (
            <ReviewDesk profile={profile} api={api} />
          ) : view === "reports" ? (
            <ReportDesk api={api} />
          ) : view === "worksites" && Legacy ? (
            <Legacy />
          ) : Legacy ? (
            <div className="s-legacy">
              <div className="s-page-title">
                <span className="s-eyebrow">HALLINTA</span>
                <h1>{items.find((x) => x[0] === view)?.[1]}</h1>
              </div>
              <Legacy />
            </div>
          ) : (
            <Empty title="Näkymä ei ole käytettävissä" />
          )}
        </main>
        <footer className="s-footer">
          Tuntivahti <span>Selkeä päivä. Oikeat tunnit.</span>
        </footer>
      </div>
      {worker && (
        <nav className="s-bottom-nav" aria-label="Omat tunnit">
          {items.map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function WorkerDesk({ profile, api, view, setView, language }) {
  const t = (key) => studioText(language, key),
    [date, setDate] = useState(today()),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const data = useRecords(api, "2020-01-01", dateShift(today(), 366));
  const allocated = useMemo(
    () => allocateEntries(data.entries),
    [data.entries],
  );
  const dates = weekDates(date),
    dayRows = allocated
      .filter((r) => r.work_date === date)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    weekly = allocated.filter((r) => dates.includes(r.work_date)),
    state = dayState(dayRows),
    locked = data.closed.includes(date.slice(0, 7));
  const attentionDates = [
    ...new Set(
      data.entries
        .filter((r) => ["draft", "returned"].includes(r.status))
        .map((r) => r.work_date),
    ),
  ]
    .sort()
    .reverse();
  const clear = () => {
    setError("");
    setMessage("");
  };
  const choose = (date) => {
    clear();
    setDate(date);
    setView("today");
  };
  const create = () => {
    const prior = [...data.entries]
      .filter((r) => r.work_date <= date)
      .sort(
        (a, b) =>
          b.work_date.localeCompare(a.work_date) ||
          b.end_time.localeCompare(a.end_time),
      )[0];
    setEditing({
      work_date: date,
      worksite_id: prior?.worksite_id || "",
      littera_id: litterasForSite(
        data.sites,
        data.litteras,
        prior?.worksite_id,
      ).some((l) => l.id === prior?.littera_id)
        ? prior.littera_id
        : "",
      start_time: dayRows.at(-1)?.end_time?.slice(0, 5) || "07:00",
      end_time: dayRows.length ? "" : "15:30",
      note: "",
    });
    clear();
  };
  async function act(fn, success) {
    setBusy(true);
    clear();
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      data.reload();
    }
  }
  async function save(value, submit) {
    setBusy(true);
    clear();
    let saved = false;
    try {
      const { id, ...payload } = value;
      await api.save({
        ...payload,
        ...(id ? { id } : {}),
        note: value.note?.trim() || null,
        status: "draft",
      });
      saved = true;
      setEditing(null);
      setDate(value.work_date);
      if (submit) await api.submit(value.work_date);
      setMessage(submit ? t("sent") : t("saved"));
    } catch (e) {
      setError(saved ? `${t("savedDraftOnly")} ${e.message}` : e.message);
    } finally {
      setBusy(false);
      data.reload();
    }
  }
  return (
    <>
      <div className="s-page-title">
        <div>
          <span className="s-eyebrow">
            {view === "today"
              ? t("day")
              : view === "week"
                ? t("week")
                : t("attention")}
          </span>
          <h1>
            {view === "today"
              ? `${t("hello")}, ${profile.full_name.split(" ")[0]}.`
              : view === "week"
                ? t("week")
                : t("attention")}
          </h1>
          <p>{view === "attention" ? t("attentionHelp") : t("subtitle")}</p>
        </div>
        <button
          className="s-primary"
          onClick={create}
          disabled={data.loading || Boolean(data.error) || locked}
        >
          <Icon name="plus" />
          {t("add")}
        </button>
      </div>
      <Notice error={error || data.error} message={message} />
      {data.error && (
        <button className="s-secondary" onClick={data.reload}>
          {t("retry")}
        </button>
      )}
      {data.loading ? (
        <div className="s-loading" role="status">
          {t("loading")}
        </div>
      ) : (
        !data.error && (
          <>
            <div className="s-worker-layout">
              <section>
                {view !== "attention" && (
                  <>
                    <div className="s-week-toolbar">
                      <button
                        className="s-icon-button"
                        aria-label={t("previous")}
                        onClick={() => setDate(dateShift(date, -7))}
                      >
                        <Icon name="back" />
                      </button>
                      <strong>
                        {dateLabel(dates[0], language)} –{" "}
                        {dateLabel(dates[6], language, {
                          day: "numeric",
                          month: "numeric",
                          year: "numeric",
                        })}
                      </strong>
                      <button
                        className="s-icon-button"
                        aria-label={t("next")}
                        onClick={() => setDate(dateShift(date, 7))}
                      >
                        <Icon name="arrow" />
                      </button>
                      <button
                        className="s-text-button"
                        onClick={() => setDate(today())}
                      >
                        {t("today")}
                      </button>
                    </div>
                    <div className="s-week-strip">
                      {dates.map((d) => {
                        const rows = allocated.filter((r) => r.work_date === d);
                        return (
                          <button
                            key={d}
                            onClick={() => choose(d)}
                            className={`${d === date ? "selected" : ""} ${d === today() ? "is-today" : ""}`}
                            aria-label={`${dateLabel(d, language, { weekday: "long", day: "numeric", month: "numeric" })}, ${hours(sum(rows))} ${t("hours")}`}
                            aria-pressed={d === date}
                          >
                            <span>
                              {dateLabel(d, language, { weekday: "short" })}
                            </span>
                            <strong>
                              {dateLabel(d, language, { day: "numeric" })}
                            </strong>
                            <small>
                              {rows.length ? `${hours(sum(rows))} h` : "—"}
                            </small>
                            <i className={dayState(rows)} />
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {view === "today" && (
                  <article className="s-card s-day-card">
                    <header className="s-card-head">
                      <div>
                        <span className="s-eyebrow">
                          {date === today() ? t("today") : t("day")}
                        </span>
                        <h2>
                          {dateLabel(date, language, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </h2>
                      </div>
                      <Badge state={state} lang={language} />
                    </header>
                    <div className="s-day-total">
                      <strong>
                        {hours(sum(dayRows))}
                        <small> h</small>
                      </strong>
                      <span>
                        {t("net")}
                        <small>
                          {t("gross")}{" "}
                          {hours(
                            dayRows.reduce((s, r) => s + r.grossMinutes, 0) /
                              60,
                          )}{" "}
                          h · {t("break")} −
                          {dayRows.reduce((s, r) => s + r.breakMinutes, 0)}{" "}
                          {t("min")}
                        </small>
                      </span>
                    </div>
                    {locked && (
                      <div className="s-notice">
                        <Icon name="lock" />
                        {t("locked")}
                      </div>
                    )}
                    {!dayRows.length ? (
                      <Empty title={t("noEntries")} detail={t("noEntriesHelp")}>
                        {!locked && (
                          <button className="s-secondary" onClick={create}>
                            <Icon name="plus" />
                            {t("add")}
                          </button>
                        )}
                      </Empty>
                    ) : (
                      <div className="s-periods">
                        {dayRows.map((r, i) => (
                          <article className="s-period" key={r.id}>
                            <div className="s-period-marker">
                              {String(i + 1).padStart(2, "0")}
                            </div>
                            <div className="s-period-content">
                              <div className="s-period-title">
                                <strong>
                                  {r.worksites?.number} · {r.worksites?.name}
                                </strong>
                                <span>{hours(r.paidMinutes / 60)} h</span>
                              </div>
                              <p>
                                {r.litteras?.code} ·{" "}
                                {translatedLitteraName(
                                  r.litteras || {},
                                  language,
                                ) || t("code")}
                              </p>
                              <div className="s-period-meta">
                                <span>
                                  <Icon name="clock" size={14} />
                                  {r.start_time.slice(0, 5)}–
                                  {r.end_time.slice(0, 5)}
                                </span>
                                <Badge state={r.status} lang={language} />
                                {r.breakMinutes > 0 && (
                                  <span>
                                    {t("break")} −{r.breakMinutes} min
                                  </span>
                                )}
                              </div>
                              {r.note && (
                                <p className="s-entry-note">{r.note}</p>
                              )}
                              {!locked && r.status !== "approved" && (
                                <div className="s-inline-actions">
                                  <button
                                    onClick={() => {
                                      setEditing({
                                        ...r,
                                        start_time: r.start_time.slice(0, 5),
                                        end_time: r.end_time.slice(0, 5),
                                      });
                                      clear();
                                    }}
                                  >
                                    {t("edit")}
                                  </button>
                                  <button
                                    className="s-delete"
                                    disabled={busy}
                                    onClick={() => {
                                      if (window.confirm(t("confirmRemove")))
                                        act(
                                          () => api.remove(r.id),
                                          t("removed"),
                                        );
                                    }}
                                  >
                                    {t("remove")}
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    {data.notes
                      .filter((n) => n.work_date === date)
                      .map((n) => (
                        <div key={n.id} className="s-notice s-note">
                          <Icon name="alert" />
                          <div>
                            <strong>{t("foremanNote")}</strong>
                            <p>{n.note}</p>
                          </div>
                        </div>
                      ))}
                    {dayRows.length > 0 && !locked && (
                      <div className="s-day-actions">
                        {dayRows.some((r) =>
                          ["draft", "returned"].includes(r.status),
                        ) ? (
                          <button
                            className="s-primary"
                            disabled={busy}
                            onClick={() =>
                              act(() => api.submit(date), t("sent"))
                            }
                          >
                            <Icon name="check" />
                            {busy ? t("saving") : t("send")}
                          </button>
                        ) : (
                          <span className="s-complete">
                            <Icon name="check" />
                            {state === "approved"
                              ? t("approvedHelp")
                              : t("submittedHelp")}
                          </span>
                        )}
                        <button
                          className="s-secondary"
                          onClick={create}
                          disabled={busy}
                        >
                          <Icon name="plus" />
                          {t("add")}
                        </button>
                      </div>
                    )}
                  </article>
                )}
                {view === "week" && (
                  <article className="s-card">
                    <header className="s-card-head">
                      <h2>{t("week")}</h2>
                      <strong>{hours(sum(weekly))} h</strong>
                    </header>
                    {dates.map((d) => {
                      const rows = allocated.filter((r) => r.work_date === d);
                      return (
                        <button
                          className="s-week-row"
                          key={d}
                          onClick={() => choose(d)}
                        >
                          <span>
                            <strong>
                              {dateLabel(d, language, { weekday: "long" })}
                            </strong>
                            <small>
                              {dateLabel(d, language)} ·{" "}
                              {[
                                ...new Set(
                                  rows.map((r) => r.worksites?.number),
                                ),
                              ].join(", ") || t("emptyDay")}
                            </small>
                          </span>
                          <Badge state={dayState(rows)} lang={language} />
                          <strong>{hours(sum(rows))} h</strong>
                          <Icon name="arrow" size={16} />
                        </button>
                      );
                    })}
                  </article>
                )}
                {view === "attention" &&
                  (attentionDates.length ? (
                    <article className="s-card">
                      {attentionDates.map((d) => {
                        const rows = allocated.filter((r) => r.work_date === d);
                        return (
                          <button
                            className="s-week-row"
                            onClick={() => choose(d)}
                            key={d}
                          >
                            <span>
                              <strong>
                                {dateLabel(d, language, {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "numeric",
                                })}
                              </strong>
                              <small>
                                {rows.length} {t("record")}
                              </small>
                            </span>
                            <Badge state={dayState(rows)} lang={language} />
                            <strong>{hours(sum(rows))} h</strong>
                            <Icon name="arrow" size={16} />
                          </button>
                        );
                      })}
                    </article>
                  ) : (
                    <article className="s-card">
                      <Empty
                        title={t("noAttention")}
                        detail={t("noAttentionHelp")}
                      />
                    </article>
                  ))}
              </section>
              <aside className="s-worker-aside">
                <article className="s-week-summary">
                  <span className="s-eyebrow">{t("weekTotal")}</span>
                  <strong>
                    {hours(sum(weekly))}
                    <small> h</small>
                  </strong>
                  <div className="s-summary-lines">
                    <span>
                      {t("approved")}
                      <b>
                        {hours(
                          sum(weekly.filter((r) => r.status === "approved")),
                        )}{" "}
                        h
                      </b>
                    </span>
                    <span>
                      {t("pending")}
                      <b>
                        {hours(
                          sum(weekly.filter((r) => r.status === "submitted")),
                        )}{" "}
                        h
                      </b>
                    </span>
                    <span>
                      {t("attention")}
                      <b>
                        {hours(
                          sum(
                            weekly.filter((r) =>
                              ["draft", "returned"].includes(r.status),
                            ),
                          ),
                        )}{" "}
                        h
                      </b>
                    </span>
                  </div>
                  <p>
                    <Icon name="clock" size={16} />
                    {t("lunchHint")}
                  </p>
                </article>
                <article className="s-card s-date-jump">
                  <label htmlFor="history-date">{t("history")}</label>
                  <input
                    id="history-date"
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && choose(e.target.value)}
                  />
                </article>
              </aside>
            </div>
          </>
        )
      )}
      {editing && (
        <EntryEditor
          value={editing}
          data={data}
          language={language}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          onSave={save}
        />
      )}
    </>
  );
}

function EntryEditor({ value, data, language, busy, error, onClose, onSave }) {
  const t = (key) => studioText(language, key),
    [form, setForm] = useState({
      id: value.id,
      work_date: value.work_date,
      worksite_id: value.worksite_id,
      littera_id: value.littera_id,
      start_time: value.start_time,
      end_time: value.end_time,
      note: value.note || "",
    }),
    [localError, setLocalError] = useState(""),
    [search, setSearch] = useState("");
  const initial = useRef(JSON.stringify(form)),
    endRef = useRef(null);
  const change = (key, value) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "worksite_id" ? { littera_id: "" } : {}),
    }));
    if (key === "worksite_id") setSearch("");
    setLocalError("");
  };
  function close() {
    if (busy) return;
    if (
      JSON.stringify(form) !== initial.current &&
      !window.confirm(t("unsaved"))
    )
      return;
    onClose();
  }
  const allowed = litterasForSite(data.sites, data.litteras, form.worksite_id);
  const original = data.entries.find((r) => r.id === form.id);
  const retained =
    original?.littera_id === form.littera_id &&
    !allowed.some((l) => l.id === form.littera_id);
  const options = allowed.filter((l) =>
    `${l.code} ${l.name} ${translatedLitteraName(l, language)}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const day = data.entries.filter(
    (r) => r.work_date === form.work_date && r.id !== form.id,
  );
  const valid = validateEntry(form, data.entries, data.closed);
  const projected = valid ? null : allocateDay([...day, form]);
  function save(submit) {
    const issue = validateEntry(form, data.entries, data.closed);
    if (issue) return setLocalError(t(issue));
    if (!entryLitteraAllowed(form, original, data.sites, data.litteras))
      return setLocalError(t("codeNotAllowed"));
    onSave(form, submit);
  }
  return (
    <DayDialog title={value.id ? t("edit") : t("add")} onClose={close}>
      <div className="s-dialog-body">
        <div className="s-form-grid">
          <label>
            {t("date")}
            <input
              type="date"
              value={form.work_date}
              disabled={!!value.id || busy}
              onChange={(e) => change("work_date", e.target.value)}
            />
          </label>
          <label>
            {t("site")}
            <select
              value={form.worksite_id}
              disabled={busy}
              onChange={(e) => change("worksite_id", e.target.value)}
            >
              <option value="">{t("choose")}…</option>
              {data.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} · {s.name}
                  {s.status === "closed" ? " (suljettu)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("start")}
            <input
              type="time"
              value={form.start_time}
              disabled={busy}
              onChange={(e) => change("start_time", e.target.value)}
            />
          </label>
          <label>
            {t("end")}
            <input
              ref={endRef}
              type="time"
              value={form.end_time}
              disabled={busy}
              onChange={(e) => change("end_time", e.target.value)}
            />
          </label>
        </div>
        <div className="s-time-choices">
          {["15:30", "16:30", "17:30"].map((time) => (
            <button
              key={time}
              disabled={busy}
              className={form.end_time === time ? "active" : ""}
              onClick={() => change("end_time", time)}
            >
              {time.replace(":", ".")}
            </button>
          ))}
          <button disabled={busy} onClick={() => endRef.current?.focus()}>
            {t("other")}
          </button>
        </div>
        <label className="s-form-label">
          {t("code")}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
          />
          <select
            aria-label={t("code")}
            size="4"
            value={form.littera_id}
            disabled={busy}
            onChange={(e) => change("littera_id", e.target.value)}
          >
            <option value="">{t("choose")}…</option>
            {retained && (
              <option value={form.littera_id} disabled>
                {original.litteras?.code} ·{" "}
                {translatedLitteraName(original.litteras || {}, language)} (
                {t("oldCode")})
              </option>
            )}
            {options.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {translatedLitteraName(l, language)}
              </option>
            ))}
          </select>
          {form.worksite_id && !allowed.length && (
            <small role="status">{t("noSiteCodes")}</small>
          )}
          {retained && <small>{t("oldCodeHelp")}</small>}
          <small>
            {data.litteras.find((l) => l.id === form.littera_id)?.code}{" "}
            {translatedLitteraName(
              data.litteras.find((l) => l.id === form.littera_id) || {},
              language,
            )}
          </small>
        </label>
        <label className="s-form-label">
          {t("note")} <small>({t("optional")})</small>
          <textarea
            rows="2"
            value={form.note}
            disabled={busy}
            onChange={(e) => change("note", e.target.value)}
          />
        </label>
        {projected && (
          <div className="s-calculation">
            <span>
              {t("day")} · {t("net")}
              <small>
                {t("break")} −
                {projected.reduce((s, r) => s + r.breakMinutes, 0)} min
              </small>
            </span>
            <strong>{hours(sum(projected))} h</strong>
          </div>
        )}
        <Notice error={localError || error} />
      </div>
      <footer className="s-dialog-actions">
        <button
          className="s-secondary"
          disabled={busy}
          onClick={() => save(false)}
        >
          {t("saveDraft")}
        </button>
        <button
          className="s-primary"
          disabled={busy}
          onClick={() => save(true)}
        >
          <Icon name="check" />
          {busy ? t("saving") : t("save")}
        </button>
      </footer>
    </DayDialog>
  );
}

function ReviewDesk({ profile, api }) {
  const [date, setDate] = useState(today()),
    [period, setPeriod] = useState("week"),
    [site, setSite] = useState("all"),
    [employer, setEmployer] = useState("all"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [selection, setSelection] = useState(null),
    [note, setNote] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dates = period === "month" ? monthDates(date) : weekDates(date),
    data = useRecords(api, dates[0], dates.at(-1), true);
  const sites = data.sites.filter(
      (s) => profile.role === "admin" || s.foreman_id === profile.id,
    ),
    siteIds = new Set(sites.map((s) => s.id));
  const rows = data.entries.filter(
    (r) =>
      siteIds.has(r.worksite_id) &&
      (site === "all" || r.worksite_id === site) &&
      (employer === "all" || r.profiles?.employer_id === employer),
  );
  const workers = data.workers
    .filter(
      (w) =>
        (w.active !== false || rows.some((r) => r.employee_id === w.id)) &&
        (employer === "all" || w.employer_id === employer) &&
        w.full_name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        (status === "all" ||
          rows.some((r) => r.employee_id === w.id && r.status === status)),
    )
    .sort(compareWorkersBySurname);
  const selected = selection
    ? rows.filter(
        (r) =>
          r.employee_id === selection.employee &&
          r.work_date === selection.date,
      )
    : [];
  const grouped = [...new Set(selected.map((r) => r.worksite_id))].map(
    (id) => ({
      site: sites.find((s) => s.id === id),
      rows: selected.filter((r) => r.worksite_id === id),
    }),
  );
  const pendingDays = new Set(
      rows
        .filter((r) => r.status === "submitted")
        .map((r) => `${r.employee_id}|${r.work_date}`),
    ).size,
    returnedDays = new Set(
      rows
        .filter((r) => r.status === "returned")
        .map((r) => `${r.employee_id}|${r.work_date}`),
    ).size;
  const dayTotal = (rows) =>
    hours(rows.reduce((s, r) => s + r.paidMinutes, 0) / 60);
  const noteValue = (group) =>
    note[group.rows[0].worksite_id] ??
    data.notes.find(
      (n) =>
        n.employee_id === selection.employee &&
        n.work_date === selection.date &&
        n.worksite_id === group.rows[0].worksite_id,
    )?.note ??
    "";
  async function modify(fn, message) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      data.reload();
    }
  }
  function changeLittera(row, id) {
    const next = litterasForSite(
      data.sites,
      data.litteras,
      row.worksite_id,
    ).find((l) => l.id === id);
    if (
      !next ||
      id === row.littera_id ||
      !window.confirm(`Vaihda litteraksi ${next.code} – ${next.name}?`)
    )
      return;
    modify(() => api.changeLittera(row, id), "Littera päivitetty.");
  }
  async function review(group, state) {
    const value = noteValue(group);
    if (state === "returned" && !value.trim()) {
      setError("Kirjoita palautuksen syy.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.review(group.rows, state, value);
      setMessage(
        state === "approved"
          ? "Työmaan päivän tunnit hyväksyttiin."
          : "Päivä palautettiin korjattavaksi.",
      );
      setSelection(null);
      setNote({});
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      data.reload();
    }
  }
  return (
    <>
      <div className="s-page-title">
        <div>
          <span className="s-eyebrow">TYÖNJOHDON TYÖPÖYTÄ</span>
          <h1>Hyvä työ näkyy tunneissa.</h1>
          <p>
            Tarkista {period === "month" ? "kuukausi" : "viikko"} yhdellä
            silmäyksellä. Avaa päivä nähdäksesi työvaiheet.
          </p>
        </div>
        <span className="s-live">
          <i />
          {period === "month"
            ? dateLabel(date, "fi", { month: "long", year: "numeric" })
            : `Viikko ${dateLabel(dates[0])}–${dateLabel(dates.at(-1))}`}
        </span>
      </div>
      <Notice error={error || data.error} message={message} />
      {data.error && (
        <button className="s-secondary" onClick={data.reload}>
          Yritä uudelleen
        </button>
      )}
      <div className="s-stats">
        <article>
          <span>
            <Icon name="clock" />
            Nettotunnit
          </span>
          <strong>
            {data.loading || data.error ? "—" : dayTotal(rows)}
            <small> h</small>
          </strong>
          <p>Ruokataukovähennyksen jälkeen</p>
        </article>
        <article className="accent">
          <span>
            <Icon name="calendar" />
            Odottaa hyväksyntää
          </span>
          <strong>
            {pendingDays}
            <small> päivää</small>
          </strong>
          <button onClick={() => setStatus("submitted")}>
            Näytä tarkistettavat <Icon name="arrow" size={14} />
          </button>
        </article>
        <article>
          <span>
            <Icon name="users" />
            Työntekijöitä kirjauksilla
          </span>
          <strong>
            {new Set(rows.map((r) => r.employee_id)).size}
            <small> / {data.workers.length}</small>
          </strong>
          <p>{returnedDays} päivää palautettu korjattavaksi</p>
        </article>
      </div>
      <section className="s-card">
        <div className="s-review-toolbar">
          <div className="s-week-toolbar">
            <button
              className="s-icon-button"
              onClick={() =>
                setDate(
                  period === "month"
                    ? monthShift(date, -1)
                    : dateShift(date, -7),
                )
              }
              aria-label={
                period === "month" ? "Edellinen kuukausi" : "Edellinen viikko"
              }
            >
              <Icon name="back" />
            </button>
            <input
              aria-label={
                period === "month"
                  ? "Tarkasteltava kuukausi"
                  : "Tarkasteltavan viikon päivä"
              }
              type={period === "month" ? "month" : "date"}
              value={period === "month" ? date.slice(0, 7) : date}
              onChange={(e) =>
                e.target.value &&
                setDate(
                  period === "month" ? `${e.target.value}-01` : e.target.value,
                )
              }
            />
            <button
              className="s-icon-button"
              onClick={() =>
                setDate(
                  period === "month" ? monthShift(date, 1) : dateShift(date, 7),
                )
              }
              aria-label={
                period === "month" ? "Seuraava kuukausi" : "Seuraava viikko"
              }
            >
              <Icon name="arrow" />
            </button>
            <button
              className="s-text-button s-period-button"
              aria-pressed={period === "week"}
              onClick={() => {
                setPeriod("week");
                setDate(today());
              }}
            >
              Tämä viikko
            </button>
            <button
              className="s-text-button s-period-button"
              aria-pressed={period === "month"}
              onClick={() => {
                setPeriod("month");
                setDate(today());
              }}
            >
              Tämä kuukausi
            </button>
          </div>
          <div className="s-segment">
            {[
              ["all", "Kaikki"],
              ["submitted", "Tarkistettavat"],
              ["returned", "Palautetut"],
            ].map(([v, label]) => (
              <button
                className={status === v ? "active" : ""}
                onClick={() => setStatus(v)}
                key={v}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="s-filter-row">
          <label className="s-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Hae työntekijää"
              placeholder="Hae työntekijää…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Työmaa"
            value={site}
            onChange={(e) => setSite(e.target.value)}
          >
            <option value="all">Kaikki työmaat</option>
            {sites.map((s) => (
              <option value={s.id} key={s.id}>
                {s.number} · {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Työnantaja"
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
          >
            <option value="all">Kaikki yritykset</option>
            {data.employers.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        {data.loading ? (
          <div className="s-loading" role="status">
            Ladataan {period === "month" ? "kuukauden" : "viikon"} kirjauksia…
          </div>
        ) : data.error ? null : (
          <>
            <div
              className="s-matrix-wrap"
              tabIndex={0}
              role="region"
              aria-label="Tuntitaulukko, tarvittaessa vieritä sivusuunnassa"
            >
              <table
                className={`s-matrix ${period === "month" ? "s-matrix-month" : ""}`}
                style={
                  period === "month"
                    ? { minWidth: 248 + dates.length * 34 }
                    : undefined
                }
              >
                <thead>
                  <tr>
                    <th>
                      Työntekijä{" "}
                      <small>
                        {workers.length} henkilöä · sukunimen mukaan
                      </small>
                    </th>
                    {dates.map((d) => (
                      <th
                        key={d}
                        className={`${[0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? "weekend" : ""} ${d === today() ? "today" : ""}`}
                      >
                        <span>{dateLabel(d, "fi", { weekday: "short" })}</span>
                        <strong>
                          {period === "month"
                            ? Number(d.slice(8))
                            : dateLabel(d)}
                        </strong>
                      </th>
                    ))}
                    <th>Yhteensä</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={w.id}>
                      <th>
                        <span className="s-avatar">
                          {w.full_name
                            .split(" ")
                            .map((x) => x[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          {w.full_name}
                          <small>{w.employers?.name}</small>
                        </span>
                      </th>
                      {dates.map((d) => {
                        const day = rows.filter(
                          (r) => r.employee_id === w.id && r.work_date === d,
                        );
                        const state = dayState(day),
                          highlight =
                            status === "all" ||
                            day.some((r) => r.status === status);
                        return (
                          <td
                            key={d}
                            className={`${[0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) ? "weekend" : ""} ${d === today() ? "today" : ""}`}
                          >
                            <button
                              className={`s-cell ${state} ${highlight ? "" : "dim"}`}
                              onClick={() => {
                                setSelection({ employee: w.id, date: d });
                                setNote({});
                                setError("");
                              }}
                              aria-label={`${w.full_name}, ${dateLabel(d)}, ${dayTotal(day)} nettotuntia, ${studioText("fi", state)}`}
                              title={`${dateLabel(d)} · ${day.length ? `${dayTotal(day)} h netto · ${studioText("fi", state)}` : "Ei kirjausta"}`}
                            >
                              <strong>
                                {day.length ? dayTotal(day) : "—"}
                              </strong>
                              <span>
                                {day.length
                                  ? studioText("fi", state)
                                  : "Ei kirjausta"}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="s-row-total">
                        {dayTotal(rows.filter((r) => r.employee_id === w.id))}
                        <small> h</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!workers.length && (
              <Empty
                title="Ei työntekijöitä tällä rajauksella"
                detail="Kokeile toista työmaata, yritystä tai hakusanaa."
              />
            )}
            <div className="s-matrix-foot">
              <div>
                <Badge state="approved" />
                <Badge state="submitted" />
                <Badge state="returned" />
                <Badge state="draft" />
              </div>
              <span>
                Nettotunnit ruokataukovähennyksen jälkeen. Ei kirjausta ei
                tarkoita poissaoloa.
              </span>
            </div>
          </>
        )}
      </section>
      {selection && (
        <DayDialog
          title={`${data.workers.find((w) => w.id === selection.employee)?.full_name} · ${dateLabel(selection.date)}`}
          onClose={() => {
            if (!busy) setSelection(null);
          }}
        >
          <div className="s-dialog-body">
            <Notice error={error} />
            {!selected.length ? (
              <Empty
                title="Päivältä ei ole kirjauksia"
                detail="Työntekijä voi täydentää puuttuvan päivän omassa näkymässään."
              />
            ) : (
              grouped.map((group) => (
                <article
                  className="s-review-group"
                  key={group.site?.id || group.rows[0].worksite_id}
                >
                  <h3>
                    {group.site?.number} · {group.site?.name}
                  </h3>
                  <p className="s-muted">
                    Netto {dayTotal(group.rows)} h · Kirjattu{" "}
                    {hours(
                      group.rows.reduce((sum, r) => sum + grossMinutes(r), 0) /
                        60,
                    )}{" "}
                    h{" · "}Ruokatauko{" "}
                    {hours(
                      group.rows.reduce(
                        (sum, r) => sum + grossMinutes(r) - r.paidMinutes,
                        0,
                      ),
                    )}{" "}
                    min
                  </p>
                  {group.rows.map((r) => (
                    <div className="s-review-detail" key={r.id}>
                      <strong>
                        {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                      </strong>
                      <span>
                        {data.closed.includes(selection.date.slice(0, 7)) ? (
                          <>
                            {r.litteras?.code} · {r.litteras?.name}
                          </>
                        ) : (
                          <select
                            aria-label={`Vaihda littera ${r.start_time.slice(0, 5)}`}
                            value={r.littera_id}
                            disabled={busy || data.loading}
                            onChange={(e) => changeLittera(r, e.target.value)}
                          >
                            {!litterasForSite(
                              data.sites,
                              data.litteras,
                              r.worksite_id,
                            ).some((l) => l.id === r.littera_id) && (
                              <option value={r.littera_id} disabled>
                                {r.litteras?.code} · {r.litteras?.name} (aiempi
                                kirjaus)
                              </option>
                            )}
                            {litterasForSite(
                              data.sites,
                              data.litteras,
                              r.worksite_id,
                            ).map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.code} · {l.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {r.note && <small>{r.note}</small>}
                      </span>
                      <Badge state={r.status} />
                    </div>
                  ))}
                  {data.notes
                    .filter(
                      (n) =>
                        n.employee_id === selection.employee &&
                        n.work_date === selection.date &&
                        n.worksite_id === group.rows[0].worksite_id,
                    )
                    .map((n) => (
                      <div className="s-notice" key={n.id}>
                        {n.note}
                      </div>
                    ))}
                  {data.closed.includes(selection.date.slice(0, 7)) ? (
                    <div className="s-notice">
                      <Icon name="lock" />
                      Palkkakausi on suljettu.
                    </div>
                  ) : (
                    <>
                      <label className="s-form-label">
                        Huomautus / palautuksen syy
                        <textarea
                          rows="2"
                          value={noteValue(group)}
                          onChange={(e) =>
                            setNote((current) => ({
                              ...current,
                              [group.rows[0].worksite_id]: e.target.value,
                            }))
                          }
                          disabled={busy || data.loading}
                        />
                      </label>
                      <div className="s-group-actions">
                        <button
                          className="s-secondary"
                          disabled={busy || data.loading}
                          onClick={() =>
                            modify(
                              () =>
                                api.saveNote(group.rows[0], noteValue(group)),
                              "Huomautus tallennettu.",
                            )
                          }
                        >
                          Tallenna huomautus
                        </button>
                        {group.rows.some((r) =>
                          ["submitted", "approved"].includes(r.status),
                        ) && (
                          <button
                            className="s-secondary s-return"
                            disabled={busy || data.loading}
                            onClick={() => review(group, "returned")}
                          >
                            Palauta korjattavaksi
                          </button>
                        )}
                        {group.rows.some((r) => r.status === "submitted") && (
                          <button
                            className="s-primary"
                            disabled={busy || data.loading}
                            onClick={() => review(group, "approved")}
                          >
                            <Icon name="check" />
                            Hyväksy työmaan päivä
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              ))
            )}
          </div>
        </DayDialog>
      )}
    </>
  );
}

function ReportDesk({ api }) {
  useEffect(() => {
    let previous = [];
    const before = () => {
      previous = [...document.querySelectorAll(".s-report-details")].map(
        (el) => [el, el.open],
      );
      previous.forEach(([el]) => {
        el.open = true;
      });
    };
    const after = () => {
      previous.forEach(([el, open]) => {
        el.open = open;
      });
      previous = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`),
    [to, setTo] = useState(today()),
    [filters, setFilters] = useState({
      site: "all",
      employer: "all",
      employee: "all",
      littera: "all",
      status: "all",
    }),
    [group, setGroup] = useState("employee");
  const data = useRecords(api, from, to),
    allocated = useMemo(() => allocateEntries(data.entries), [data.entries]),
    rows = filterEntries(allocated, filters);
  const groups = new Map();
  for (const r of rows) {
    const key =
      group === "employee"
        ? r.employee_id
        : group === "site"
          ? r.worksite_id
          : group === "company"
            ? r.profiles?.employer_id
            : `${r.worksite_id}|${r.littera_id}`;
    if (!groups.has(key))
      groups.set(key, {
        key,
        rows: [],
        label:
          group === "employee"
            ? r.profiles?.full_name
            : group === "site"
              ? `${r.worksites?.number} · ${r.worksites?.name}`
              : group === "company"
                ? r.profiles?.employers?.name
                : `${r.litteras?.code || "—"} · ${r.litteras?.name || "Kohdistamatta"}`,
        detail:
          group === "employee"
            ? r.profiles?.employers?.name
            : group === "littera"
              ? `${r.worksites?.number} · ${r.worksites?.name}`
              : "",
      });
    groups.get(key).rows.push(r);
  }
  const unapproved = rows.filter((r) => r.status !== "approved");
  const filter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const managerNote = (row) =>
    data.notes
      .filter(
        (n) =>
          n.employee_id === row.employee_id &&
          n.work_date === row.work_date &&
          n.worksite_id === row.worksite_id,
      )
      .map((n) => n.note)
      .join(" / ");
  function download() {
    const lines = [
      [
        "Päivä",
        "Työntekijä",
        "Työnantaja",
        "Työmaanumero",
        "Työmaa",
        "Alku",
        "Loppu",
        "Littera",
        "Työ",
        "Bruttotunnit",
        "Ruokatauko min",
        "Nettotunnit",
        "Tila",
        "Lisätieto",
        "Työnjohtajan huomautus",
      ],
      ...rows.map((r) => [
        r.work_date,
        r.profiles?.full_name,
        r.profiles?.employers?.name,
        r.worksites?.number,
        r.worksites?.name,
        r.start_time.slice(0, 5),
        r.end_time.slice(0, 5),
        r.litteras?.code,
        r.litteras?.name,
        hours(r.grossMinutes / 60),
        r.breakMinutes,
        hours(r.paidMinutes / 60),
        studioText("fi", r.status),
        r.note,
        managerNote(r),
      ]),
    ];
    const url = URL.createObjectURL(
        new Blob([csvText(lines)], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `tunnit-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="s-page-title s-no-print">
        <div>
          <span className="s-eyebrow">RAPORTOINTI</span>
          <h1>Tunnit, selkeästi koottuna.</h1>
          <p>
            Työntekijät, työmaat ja yritykset. Sama laskenta kaikissa
            raporteissa.
          </p>
        </div>
        <div className="s-group-actions">
          <button
            className="s-secondary"
            disabled={!rows.length || data.loading || !!data.error}
            onClick={download}
          >
            <Icon name="download" />
            Excel (CSV)
          </button>
          <button
            className="s-primary"
            disabled={!rows.length || data.loading || !!data.error}
            onClick={() => window.print()}
          >
            Tulosta / PDF
          </button>
        </div>
      </div>
      <Notice error={data.error} />
      <section className="s-card s-report">
        <div className="s-report-filters s-no-print">
          <label>
            Alkaen
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <label>
            Päättyen
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
          {[
            [
              "site",
              "Työmaa",
              data.sites.map((s) => [s.id, `${s.number} · ${s.name}`]),
            ],
            ["employer", "Yritys", data.employers.map((e) => [e.id, e.name])],
            [
              "employee",
              "Työntekijä",
              data.workers.map((w) => [w.id, w.full_name]),
            ],
            [
              "littera",
              "Littera",
              data.litteras.map((l) => [l.id, `${l.code} · ${l.name}`]),
            ],
            [
              "status",
              "Hyväksyntä",
              [
                ["approved", "Hyväksytyt"],
                ["submitted", "Odottaa tarkistusta"],
                ["draft", "Luonnokset"],
                ["returned", "Palautetut"],
              ],
            ],
          ].map(([key, label, options]) => (
            <label key={key}>
              {label}
              <select
                value={filters[key]}
                onChange={(e) => filter(key, e.target.value)}
              >
                <option value="all">Kaikki</option>
                {options.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="s-report-heading">
          <div>
            <span className="s-eyebrow">TUNTIRAPORTTI</span>
            <h2>
              {dateLabel(from)}–
              {dateLabel(to, "fi", {
                day: "numeric",
                month: "numeric",
                year: "numeric",
              })}
            </h2>
            <p>
              {filters.status === "all"
                ? "Kaikki hyväksyntätilat"
                : studioText("fi", filters.status)}{" "}
              ·{" "}
              {filters.site === "all"
                ? "Kaikki työmaat"
                : data.sites.find((s) => s.id === filters.site)?.name}{" "}
              ·{" "}
              {filters.employer === "all"
                ? "Kaikki yritykset"
                : data.employers.find((e) => e.id === filters.employer)?.name}
              {filters.employee !== "all" && (
                <>
                  {" "}
                  ·{" "}
                  {
                    data.workers.find((w) => w.id === filters.employee)
                      ?.full_name
                  }
                </>
              )}
              {filters.littera !== "all" && (
                <>
                  {" "}
                  · Littera{" "}
                  {data.litteras.find((l) => l.id === filters.littera)?.code}
                </>
              )}
            </p>
          </div>
          <div>
            <span>Nettotunnit yhteensä</span>
            <strong>
              {hours(sum(rows))}
              <small> h</small>
            </strong>
          </div>
        </div>
        {unapproved.length > 0 && (
          <div className="s-notice">
            <Icon name="alert" />
            Kooste sisältää {hours(sum(unapproved))} h hyväksymättömiä tunteja.
          </div>
        )}
        <div className="s-segment s-report-tabs s-no-print">
          {[
            ["employee", "Työntekijät"],
            ["site", "Työmaat"],
            ["company", "Yritykset"],
            ["littera", "Litterat"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={group === key ? "active" : ""}
              onClick={() => setGroup(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {data.loading ? (
          <div className="s-loading">Ladataan raporttia…</div>
        ) : data.error ? null : rows.length ? (
          <>
            <div className="s-table-wrap">
              <table className="s-report-table">
                <thead>
                  <tr>
                    <th>
                      {group === "employee"
                        ? "Työntekijä"
                        : group === "site"
                          ? "Työmaa"
                          : group === "company"
                            ? "Yritys"
                            : "Littera"}
                    </th>
                    <th>Työpäiviä¹</th>
                    <th>Hyväksymättä</th>
                    <th>Nettotunnit</th>
                  </tr>
                </thead>
                <tbody>
                  {[...groups.values()]
                    .sort((a, b) =>
                      (a.label || "").localeCompare(b.label || "", "fi"),
                    )
                    .map((g) => (
                      <tr key={g.key}>
                        <td>
                          <strong>{g.label || "Ei määritetty"}</strong>
                          <small>{g.detail}</small>
                        </td>
                        <td>
                          {
                            new Set(
                              g.rows.map(
                                (r) => `${r.employee_id}|${r.work_date}`,
                              ),
                            ).size
                          }
                        </td>
                        <td>
                          {hours(
                            sum(g.rows.filter((r) => r.status !== "approved")),
                          )}{" "}
                          h
                        </td>
                        <td>
                          <strong>{hours(sum(g.rows))} h</strong>
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Yhteensä</th>
                    <td>
                      {
                        new Set(
                          rows.map((r) => `${r.employee_id}|${r.work_date}`),
                        ).size
                      }
                    </td>
                    <td>{hours(sum(unapproved))} h</td>
                    <td>
                      <strong>{hours(sum(rows))} h</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="s-report-footnote">
              ¹ Työntekijäkohtaiset päivät. Sama päivä voi esiintyä usealla
              työmaalla tai litteralla. Ruokatauko lasketaan koko päivän
              perusteella ennen raportin rajauksia.
            </p>
            <details
              className="s-report-details"
              open={group === "employee" && filters.employee !== "all"}
            >
              <summary>
                Päiväkohtainen erittely · {rows.length} työjaksoa
              </summary>
              <div className="s-table-wrap">
                <table className="s-report-table">
                  <thead>
                    <tr>
                      <th>Päivä / työntekijä</th>
                      <th>Työmaa / littera</th>
                      <th>Aika</th>
                      <th>Tauko</th>
                      <th>Netto</th>
                      <th>Tila</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {dateLabel(r.work_date)}
                          <small>{r.profiles?.full_name}</small>
                        </td>
                        <td>
                          {r.worksites?.number} · {r.worksites?.name}
                          <small>
                            {r.litteras?.code} · {r.litteras?.name}
                          </small>
                          {r.note && <small>{r.note}</small>}
                          {managerNote(r) && (
                            <small>Työnjohtaja: {managerNote(r)}</small>
                          )}
                        </td>
                        <td>
                          {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                        </td>
                        <td>{r.breakMinutes} min</td>
                        <td>{hours(r.paidMinutes / 60)} h</td>
                        <td>{studioText("fi", r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <Empty
            title="Ei tunteja valitulla rajauksella"
            detail="Tarkista aikaväli ja rajaukset. Hyväksyntätilan Kaikki näyttää myös hyväksymättömät kirjaukset."
          />
        )}
      </section>
    </>
  );
}
