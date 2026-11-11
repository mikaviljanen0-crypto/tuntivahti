// Development-only fictional fixtures. Not bundled into production.
import React, { useMemo } from "react";
import TimeStudio from "./TimeStudio.jsx";
import { helsinkiToday, weekDates } from "./time-model.js";
export default function Preview({ role }) {
  const [profile, api] = useMemo(() => {
    const days = weekDates(helsinkiToday()),
      sites = [
        {
          id: "site1",
          number: "2701",
          name: "Esimerkkipiha 10",
          status: "active",
          foreman_id: "manager",
        },
        {
          id: "site2",
          number: "2609",
          name: "Mallitalon julkisivut",
          status: "active",
          foreman_id: "manager",
        },
      ];
    const employers = [
      { id: "e1", name: "Esimerkki Rakennus Oy" },
      { id: "e2", name: "Malli Saneeraus Oy" },
    ];
    const workers = [
      "Elias Esimerkki",
      "Arben Mallinen",
      "Leo Testilä",
      "Matti Mallikas",
      "Eero Esimerkkinen",
      "Adrian Mallila",
    ].map((name, i) => ({
      id: `w${i}`,
      full_name: name,
      employer_id: i % 2 ? "e2" : "e1",
      employers: employers[i % 2],
    }));
    const litteras = [
      {
        id: "l1",
        code: "1100",
        name: "Purkutyöt",
        name_sq: "Punime prishjeje",
        name_en: "Demolition",
      },
      {
        id: "l2",
        code: "3620",
        name: "Parvekkeiden korjaus",
        name_sq: "Riparimi i ballkoneve",
        name_en: "Balcony repairs",
      },
      {
        id: "l3",
        code: "8160",
        name: "Aputyöt ja siivous",
        name_sq: "Punë ndihmëse dhe pastrim",
        name_en: "Assistance and cleaning",
      },
      {
        id: "l4",
        code: "5560",
        name: "Julkisivutyöt",
        name_sq: "Punime fasade",
        name_en: "Façade work",
      },
    ];
    let entries = [];
    workers.forEach((w, i) =>
      days.slice(0, 5).forEach((day, j) => {
        if ((i === 2 && j === 2) || (i === 4 && j > 1)) return;
        const status =
          j === 0
            ? "approved"
            : i === 1 && j === 1
              ? "returned"
              : j === 4
                ? "draft"
                : "submitted";
        entries.push({
          id: `r${i}-${j}`,
          employee_id: w.id,
          worksite_id: "site1",
          littera_id: "l2",
          work_date: day,
          start_time: "07:00",
          end_time: "15:30",
          status,
          note: "",
          profiles: w,
          worksites: sites[0],
          litteras: litteras[1],
        });
      }),
    );
    let notes = [
      {
        id: "note1",
        employee_id: "w1",
        work_date: days[1],
        worksite_id: "site1",
        note: "Tarkistaisitko loppuajan ja työvaiheen?",
      },
    ];
    const profile = {
      ...workers[0],
      id: role === "worker" ? "w0" : "manager",
      role: role === "worker" ? "worker" : "admin",
      full_name: role === "worker" ? "Elias Esimerkki" : "Mika · esikatselu",
      organization_id: "preview",
      language: "fi",
      organizations: { name: "Esimerkki Rakennus Oy" },
    };
    const visible = () =>
      role === "worker"
        ? entries.filter((r) => r.employee_id === "w0")
        : entries;
    return [
      profile,
      {
        bootstrap: async () => ({
          sites,
          litteras,
          workers,
          employers,
          closed: [],
        }),
        entries: async (from, to) =>
          visible().filter((r) => r.work_date >= from && r.work_date <= to),
        notes: async () =>
          role === "worker"
            ? notes.filter((r) => r.employee_id === "w0")
            : notes,
        save: async (r) => {
          const id = r.id || `demo-${Date.now()}`;
          entries = entries.filter((x) => x.id !== id);
          entries.push({
            ...r,
            id,
            employee_id: "w0",
            profiles: workers[0],
            worksites: sites.find((s) => s.id === r.worksite_id),
            litteras: litteras.find((l) => l.id === r.littera_id),
          });
          return { id };
        },
        submit: async (date) => {
          entries = entries.map((r) =>
            r.employee_id === "w0" &&
            r.work_date === date &&
            ["draft", "returned"].includes(r.status)
              ? { ...r, status: "submitted" }
              : r,
          );
        },
        remove: async (id) => {
          entries = entries.filter((r) => r.id !== id);
        },
        changeLittera: async (row, id) => {
          entries = entries.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  littera_id: id,
                  litteras: litteras.find((l) => l.id === id),
                }
              : r,
          );
        },
        saveNote: async (row, note) => {
          notes = notes.filter(
            (n) =>
              !(
                n.employee_id === row.employee_id &&
                n.work_date === row.work_date &&
                n.worksite_id === row.worksite_id
              ),
          );
          if (note.trim())
            notes.push({
              id: String(Date.now()),
              employee_id: row.employee_id,
              work_date: row.work_date,
              worksite_id: row.worksite_id,
              note,
            });
        },
        review: async (rows, status, note) => {
          entries = entries.map((r) =>
            rows.some((x) => x.id === r.id) &&
            (r.status === "submitted" ||
              (status === "returned" && r.status === "approved"))
              ? { ...r, status }
              : r,
          );
          if (note)
            notes.push({
              id: String(Date.now()),
              employee_id: rows[0].employee_id,
              worksite_id: rows[0].worksite_id,
              work_date: rows[0].work_date,
              note,
            });
        },
      },
    ];
  }, [role]);
  return (
    <TimeStudio
      profile={profile}
      previewApi={api}
      onLogout={() => location.assign("?preview=worker")}
    />
  );
}
