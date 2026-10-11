// FantaMotoGP - service worker: rete prima, cache solo per l'uso offline.
// Cosi' dopo ogni pubblicazione si vedono subito i dati nuovi.
const CACHE = "fantamotogp-v6";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "icons/logo.png", "icons/icon-192.png", "icons/favicon-32.png", "data/league.json", "data/standings.json", "data/season.json",
  "data/config.json"];

self.addEventListener("install", (e) => {
  // anche qui niente copie vecchie: ogni file viene richiesto al server
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: "no-cache" })
      .then((r) => r.ok ? c.put(u, r) : null).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;          // formazioni: sempre live
  // file dell'app (pagina, dati, codice): chiedo sempre al server se sono cambiati
  // (cache "no-cache"), cosi' la copia del browser non puo' restare vecchia
  const daRete = url.origin === location.origin
    ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
    : fetch(req);
  e.respondWith(
    daRete
      .then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.includes("cdnjs") ||
            url.hostname.includes("fonts."))) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

// notifiche push (inviate dal PC con notifica.py): titolo, testo e pagina da aprire
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "FantaMotoGP", {
    body: d.body || "",
    icon: "icons/icon-192.png",
    tag: d.tag || "fantamotogp",     // una notifica nuova sostituisce la precedente
    renotify: true,
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
    const w = finestre.find((c) => c.url.startsWith(self.registration.scope));
    if (!w) return clients.openWindow(url);
    // app gia' aperta: in primo piano e ricaricata sulla pagina giusta (dati nuovi);
    // il ?n= forza il ricaricamento anche se cambia solo la parte dopo #
    const nuovo = new URL(url);
    nuovo.searchParams.set("n", Date.now());
    return w.focus().then((c) => (c || w).navigate(nuovo.href)).catch(() => clients.openWindow(url));
  }));
});
