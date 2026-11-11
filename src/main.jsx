import React from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "../styles.css";
import App from "./App.jsx";

const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

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
      <App />
    </React.StrictMode>,
  );
}
