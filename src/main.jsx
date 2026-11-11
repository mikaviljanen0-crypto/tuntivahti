import React from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "../styles.css";
import App from "./App.jsx";
import { createPreviewFetch } from "./preview-guard.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;
const readOnlyPreview = import.meta.env.VITE_READ_ONLY_PREVIEW === "true";
export const supabase =
  url && key
    ? createClient(
        url,
        key,
        readOnlyPreview
          ? {
              global: {
                fetch: createPreviewFetch(url, window.fetch.bind(window)),
              },
            }
          : undefined,
      )
    : null;

const preview = new URLSearchParams(window.location.search).get("preview");
if (import.meta.env.DEV && ["worker", "manager"].includes(preview)) {
  import("./studio-preview.jsx").then(({ default: Preview }) =>
    createRoot(document.getElementById("root")).render(
      <Preview role={preview} />,
    ),
  );
} else {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      {readOnlyPreview && (
        <div className="s-preview-bar s-live-preview-warning" role="status">
          Tarkistusversio · nykyiset tiedot · tallennus estetty. Kirjaudu
          nykyisellä Tuntivahti-tunnuksellasi.
        </div>
      )}
      <App />
    </React.StrictMode>,
  );
}
