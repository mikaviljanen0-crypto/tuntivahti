// A client-side preview safeguard, not a replacement for Supabase RLS.
// Normal production builds do not install this fetch wrapper.
export const previewReadOnlyMessage =
  "Tarkistusversiossa tietoja voi katsella, mutta muutoksia ei tallenneta. Käytä nykyistä Tuntivahtia varsinaisiin kirjauksiin.";

export function previewRequestAllowed(input, init = {}, supabaseUrl) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.origin !== new URL(supabaseUrl).origin) return false;
  const method = (init.method || input.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  // Authentication must still work; no profile/password or business writes.
  return (
    method === "POST" &&
    [
      "/auth/v1/token",
      "/auth/v1/logout",
      "/functions/v1/login-with-phone",
    ].includes(url.pathname)
  );
}

export function createPreviewFetch(supabaseUrl, fetcher) {
  return (input, init) => {
    if (previewRequestAllowed(input, init, supabaseUrl))
      return fetcher(input, init);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          message: previewReadOnlyMessage,
          code: "PREVIEW_READ_ONLY",
          details: null,
          hint: null,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
  };
}
