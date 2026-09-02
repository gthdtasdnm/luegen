// LÜGEN – Client. Der Server hält die Wahrheit; hier wird nur gezeichnet.

import { starteSprache, t, uebersetze } from "./sprache.js";
import { WOERTER } from "./texte.js";

// Vor allem, was zeichnet: der Warteraum soll gleich in der richtigen
// Sprache dastehen. Deutsch steht im HTML und in den Aufrufen hier.
starteSprache(WOERTER);
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const S = {
  ws: null, me: null, token: null, code: null,
  room: null, runde: null, isPublic: true, gewaehlt: new Set(), ansage: null,
};

// ---------------------------------------------------------------- Verbindung
function wsUrl() {
  const u = new URL("ws", location.href);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.href;
}

// Wartezeit bis zum naechsten Versuch: waechst mit jedem Fehlschlag, faellt
// beim ersten Erfolg zurueck. Ein fester Takt von 1500 ms waeren genau 40
// neue Verbindungen je Minute - und `bremse.js` laesst 40 je Minute und IP
// zu. Wem der Dienst kurz wegbrach, der sperrte sich damit selbst aus. Der
// Zufallsanteil verhindert, dass nach einem Neustart alle Clients in
// derselben Millisekunde wiederkommen. Ebenso in `gemeinsam/schale.js`.
const WARTE_ANFANG = 500;
const WARTE_MAX = 8000;
// Zurueckgesetzt wird erst nach drei Sekunden Bestand: ein `onopen` allein
// reicht nicht, weil ein Dienst in der Absturzschleife die Verbindung annimmt
// und sofort wieder abwirft. Ebenso in `gemeinsam/schale.js`.
const BEWAEHRT_NACH = 3000;
let warte = WARTE_ANFANG;
let bewaehrung = null;

function verbinde(dann) {
  if (S.ws && S.ws.readyState === WebSocket.OPEN) return dann?.();
  S.ws = new WebSocket(wsUrl());
  S.ws.onopen = () => {
    clearTimeout(bewaehrung);
    bewaehrung = setTimeout(() => { warte = WARTE_ANFANG; }, BEWAEHRT_NACH);
    $("status").textContent = "";
    dann?.();
  };
  S.ws.onmessage = (ev) => empfange(JSON.parse(ev.data));
  S.ws.onclose = () => {
    clearTimeout(bewaehrung);
    $("status").textContent = t("schale.weg", {}, "Verbindung weg – neu verbinden …");
    const gleich = warte * (0.8 + Math.random() * 0.4);
    warte = Math.min(warte * 1.8, WARTE_MAX);
    setTimeout(() => verbinde(() => {
      if (S.code) schicke({ t: "join", code: S.code, token: S.token, name: nameFeld() });
      else schicke({ t: "browse" });
    }), gleich);
  };
}
const schicke = (m) => S.ws?.readyState === WebSocket.OPEN && S.ws.send(JSON.stringify(m));

const nameFeld = () => $("name").value.trim() || t("schale.spieler", {}, "Spieler");

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2600);
}

function zeige(name) {
  for (const s of document.querySelectorAll(".screen")) {
    s.classList.toggle("active", s.id === "screen-" + name);
  }
}

// ------------------------------------------------------------------ Kennung
// Gleiche Regel wie in `gemeinsam/schale.js`, hier von Hand – dieser Client
// hat die Schale nicht.
//
// Bis zum 17.08.2026 lag die Kennung im `sessionStorage` und starb mit dem
// Tab. Auf dem Handy schließt Safari Tabs von sich aus; wer zurückkam, war für
// den Server ein neuer Spieler, während sein alter Platz mit dem Hostzeichen
// stehenblieb – und niemand mehr starten konnte. Das war Bugreport 4.
//
// Jetzt `localStorage` plus Herzschlag: der Tab, dem die Kennung gehört,
// frischt sie alle vier Sekunden auf. Ein zweiter Tab sieht den frischen
// Herzschlag und lässt die Kennung liegen – sonst zögen sich die beiden
// abwechselnd den Platz weg. Nach zwei Stunden verfällt der Eintrag.
const SITZ_KEY = "luegen";
const HERZ_MS = 4000;
const HERZ_TOT = 12_000;
const SITZ_VERFALL = 2 * 60 * 60 * 1000;
const TAB = (() => {
  try {
    const t = sessionStorage.getItem("spiele_tab") ??
      (crypto.randomUUID?.() ?? String(Date.now()) + String(Math.random()).slice(2));
    sessionStorage.setItem("spiele_tab", t);
    return t;
  } catch {
    return "tab";
  }
})();
let herzUhr = null;

function sitz() {
  try {
    const s = JSON.parse(localStorage.getItem(SITZ_KEY) ?? "null");
    if (!s || !s.code || !s.token) return null;
    const alter = Date.now() - (s.herz ?? 0);
    if (alter > SITZ_VERFALL) { localStorage.removeItem(SITZ_KEY); return null; }
    if (s.tab !== TAB && alter < HERZ_TOT) return null;
    return s;
  } catch {
    return null;
  }
}

/** Token für genau diesen Raum – sonst nichts, damit kein fremder mitfährt. */
const tokenFuer = (code) => (sitz()?.code === code ? sitz().token : undefined);

function sitzHalten(code, token) {
  try {
    clearInterval(herzUhr);
    const schreibe = () => localStorage.setItem(
      SITZ_KEY,
      JSON.stringify({ code, token, tab: TAB, herz: Date.now() }),
    );
    schreibe();
    herzUhr = setInterval(schreibe, HERZ_MS);
  } catch { /* Privatmodus – dann eben ohne Wiedereinstieg */ }
}

function sitzLoeschen() {
  clearInterval(herzUhr);
  herzUhr = null;
  try { localStorage.removeItem(SITZ_KEY); } catch { /* egal */ }
}

// ---------------------------------------------------------------- Nachrichten
function empfange(m) {
  switch (m.t) {
    case "rooms": zeichneRaeume(m.rooms); break;
    case "joined":
      S.me = m.you; S.token = m.token; S.code = m.code;
      sitzHalten(m.code, m.token);
      history.replaceState(null, "", "#" + m.code);
      break;
    case "room": S.room = m; zeichneRaum(); break;
    case "runde": S.runde = m; zeichneSpiel(); break;
    case "final": zeichneFinal(m); break;
    case "error": toast(m.msg); break;
  }
}

function zeichneRaeume(liste) {
  const box = $("roomList");
  box.innerHTML = "";
  $("roomsCount").textContent = liste.length ? `(${liste.length})` : "";
  if (!liste.length) return box.append(el("div", "rooms-empty", t("schale.keineRaeume", {}, "Gerade keine offenen Räume.")));
  for (const r of liste) {
    const row = el("div", "roomrow");
    row.append(el("span", "roomrow-code", r.code));
    row.append(el("span", "roomrow-name", r.host));
    row.append(el("span", "roomrow-count", `${r.count}/${r.max}`));
    row.onclick = () =>
      schicke({ t: "join", code: r.code, token: tokenFuer(r.code), name: nameFeld() });
    box.append(row);
  }
}

function zeichneRaum() {
  const r = S.room;
  if (r.phase === "lobby") zeige("lobby");
  else if (r.phase === "playing") zeige("game");
  $("roomCode").textContent = r.code;
  $("roomVis").textContent = r.isPublic ? t("schale.oeffentlich", {}, "öffentlich") : t("schale.privat", {}, "privat");
  $("lobbyCount").textContent = `${r.players.length}/${r.maxPlayers}`;

  const liste = $("playerList");
  liste.innerHTML = "";
  for (const p of r.players) {
    const s = el("div", "seat" + (p.ready ? " ready" : "") + (p.connected ? "" : " off"));
    s.append(el("div", "av", (p.name[0] ?? "?").toUpperCase()));
    s.append(el("div", "nm", p.name));
    s.append(el("div", "st", p.ready
        ? t("schale.bereit", {}, "bereit")
        : p.connected
        ? t("schale.wartet", {}, "wartet")
        : t("schale.fort", {}, "weg")));
    if (p.host) s.append(el("div", "host", t("schale.host", {}, "Host")));
    liste.append(s);
  }

  const binHost = r.hostId === S.me;
  $("hostControls").hidden = !binHost;
  $("guestControls").hidden = binHost;
  $("endeBtn").hidden = !binHost;
  for (const b of document.querySelectorAll("[data-lobbyvis]")) {
    b.classList.toggle("sel", (b.dataset.lobbyvis === "public") === r.isPublic);
  }
  const da = r.players.filter((p) => p.connected).length;
  const alleBereit = r.players.filter((p) => p.connected && p.id !== r.hostId).every((p) => p.ready);
  $("startBtn").disabled = da < r.minPlayers || !alleBereit;
  $("startHint").textContent = da < r.minPlayers
    ? t("schale.mindestens", { min: r.minPlayers, da }, `Mindestens ${r.minPlayers} Leute – ihr seid ${da}.`)
    : alleBereit ? "" : t("schale.nichtBereit", {}, "Noch nicht alle sind bereit.");
  const ich = r.players.find((p) => p.id === S.me);
  $("readyBtn").classList.toggle("on", !!ich?.ready);
}

// ---------------------------------------------------------------- Spiel
const KARTE = (k) => `${k.r}${k.f}`;

function zeichneSpiel() {
  const m = S.runde;
  if (!m) return;
  zeige("game");
  $("stapelZahl").textContent = m.stapel;
  $("ansageTag").textContent = m.rang
    ? t("lg.dran", { rang: m.rang }, "Dran: " + m.rang)
    : t("lg.freieAnsage", {}, "freie Ansage");

  // Mitspieler
  const g = $("gegner");
  g.innerHTML = "";
  for (const p of m.spieler) {
    const b = el("div", "gs" + (p.id === m.amZug ? " zug" : "") + (p.weg ? " off" : ""));
    b.append(el("span", "gs-nm", p.name));
    b.append(el("span", "gs-kt", p.karten + " 🂠"));
    g.append(b);
  }

  // Mitte
  const mi = $("mitte");
  mi.innerHTML = "";
  if (m.letzte) {
    mi.append(el("p", "mitte-txt", t(
      "lg.sagt",
      { name: m.letzte.von, n: m.letzte.anzahl, rang: m.letzte.rang },
      `${m.letzte.von} sagt: ${m.letzte.anzahl}× ${m.letzte.rang}`,
    )));
  } else {
    mi.append(el("p", "mitte-txt", t("lg.neueAnsage", {}, "Neue Ansage – der Stapel ist frei.")));
  }

  // Aufdeckung
  const auf = $("aufdeckung");
  if (m.aufdeckung) {
    auf.hidden = false;
    auf.innerHTML = "";
    const a = m.aufdeckung;
    auf.append(el("p", "auf-kopf",
      a.gelogen ? t("lg.gelogen", {}, "Gelogen!") : t("lg.wahrheit", {}, "Die Wahrheit.")));
    const row = el("div", "auf-karten");
    for (const k of a.karten) {
      row.append(el("span", "karte " + (k.f === "♥" || k.f === "♦" ? "rot" : ""), KARTE(k)));
    }
    auf.append(row);
    auf.append(el("p", "auf-txt", t(
      "lg.angesagtWar",
      { rang: a.rang, name: a.nehmer, n: a.anzahl },
      `Angesagt war ${a.rang}. ${a.nehmer} nimmt ${a.anzahl} Karten.`,
    )));
  } else {
    auf.hidden = true;
  }

  // Eigene Hand
  const hb = $("handBereich");
  hb.innerHTML = "";
  const binDran = m.amZug === S.me && m.schritt === "legen";
  m.hand.forEach((k, i) => {
    const c = el("button", "karte hand" + (k.f === "♥" || k.f === "♦" ? " rot" : "")
      + (S.gewaehlt.has(i) ? " sel" : ""), KARTE(k));
    c.disabled = !binDran;
    c.onclick = () => {
      if (S.gewaehlt.has(i)) S.gewaehlt.delete(i);
      else if (S.gewaehlt.size < 4) S.gewaehlt.add(i);
      zeichneSpiel();
    };
    hb.append(c);
  });

  // Aktionen
  const akt = $("aktionen");
  akt.innerHTML = "";
  if (m.schritt === "aufdecken") {
    $("rundenHint").textContent = t("lg.aufgedeckt", {}, "Aufgedeckt – gleich geht es weiter.");
    S.gewaehlt.clear();
    return;
  }
  if (binDran) {
    if (m.rang === null) {
      const wahl = el("div", "segmented ansage");
      for (const r of ["2","3","4","5","6","7","8","9","10","B","D","K","A"]) {
        const b = el("button", "seg" + (S.ansage === r ? " sel" : ""), r);
        b.onclick = () => { S.ansage = r; zeichneSpiel(); };
        wahl.append(b);
      }
      akt.append(wahl);
    }
    const legen = el("button", "btn primary big", t("lg.legen", {}, "Legen"));
    legen.disabled = !S.gewaehlt.size || (m.rang === null && !S.ansage);
    legen.onclick = () => {
      schicke({ t: "legen", karten: [...S.gewaehlt], rang: m.rang ?? S.ansage });
      S.gewaehlt.clear(); S.ansage = null;
    };
    akt.append(legen);
    $("rundenHint").textContent = m.rang
      ? t("lg.duDranRang", { rang: m.rang }, `Du bist dran: ${m.rang} ansagen – ehrlich oder nicht.`)
      : t("lg.duDranFrei", {}, "Du bist dran: Rang wählen und legen.");
  } else {
    $("rundenHint").textContent = m.letzte
      ? t("lg.glaubstDu", {}, "Glaubst du das?")
      : t("lg.warteDran", {}, "Warte, bis du dran bist.");
  }
  if (m.letzte && m.letzte.vonId !== S.me && m.schritt === "legen") {
    const l = el("button", "btn big luege", t("lg.luege", {}, "Lüge!"));
    l.onclick = () => schicke({ t: "luege" });
    akt.append(l);
  }
}

function zeichneFinal(m) {
  zeige("final");
  $("finalSub").textContent = m.verlierer.length
    ? t("lg.bleibtSitzen", { name: m.verlierer.join(", ") },
      `${m.verlierer.join(", ")} bleibt auf den Karten sitzen.`)
    : "";
  const ol = $("podium");
  ol.innerHTML = "";
  for (const z of m.tabelle) {
    const li = el("li");
    li.append(el("span", "pd-name", z.name));
    li.append(el("span", "pd-pt", z.karten
      ? t("lg.nKarten", { n: z.karten }, z.karten + " Karten")
      : t("lg.durch", {}, "durch")));
    ol.append(li);
  }
  $("againBtn").hidden = S.room?.hostId !== S.me;
}

// ---------------------------------------------------------------- Bedienung
for (const b of document.querySelectorAll("[data-vis]")) {
  b.onclick = () => {
    S.isPublic = b.dataset.vis === "public";
    for (const x of document.querySelectorAll("[data-vis]")) x.classList.toggle("sel", x === b);
  };
}
for (const b of document.querySelectorAll("[data-lobbyvis]")) {
  b.onclick = () => schicke({ t: "settings", isPublic: b.dataset.lobbyvis === "public" });
}
$("createBtn").onclick = () =>
  verbinde(() => schicke({ t: "create", name: nameFeld(), isPublic: S.isPublic }));
$("joinBtn").onclick = () => {
  const code = $("codeInput").value.toUpperCase().trim();
  if (code) {
    verbinde(() => schicke({ t: "join", code, token: tokenFuer(code), name: nameFeld() }));
  }
};
$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname + "#" + S.code);
    toast(t("schale.kopiert", {}, "Link kopiert"));
  } catch { toast(location.href); }
};
$("readyBtn").onclick = () => {
  const ich = S.room?.players.find((p) => p.id === S.me);
  schicke({ t: "ready", value: !ich?.ready });
};
$("startBtn").onclick = () => schicke({ t: "start" });
$("endeBtn").onclick = () => schicke({ t: "ende" });
$("againBtn").onclick = () => schicke({ t: "again" });
function verlassen() {
  schicke({ t: "leave" });
  S.code = null; S.room = null;
  sitzLoeschen();
  history.replaceState(null, "", location.pathname);
  zeige("home");
  schicke({ t: "browse" });
}
$("leaveBtn").onclick = verlassen;
// Derselbe Weg hinaus von überall: Lobby, Spielbildschirm, Endstand.
for (const b of document.querySelectorAll("[data-raus]")) b.onclick = verlassen;
$("helpBtn").onclick = () => { $("help").hidden = false; };
$("helpClose").onclick = () => { $("help").hidden = true; };

// Start
const gespeichert = sitz();
const hash = location.hash.replace("#", "").toUpperCase();
$("name").value = localStorage.getItem("spiele_name") ?? "";
$("name").onchange = () => localStorage.setItem("spiele_name", nameFeld());
verbinde(() => {
  if (hash && gespeichert?.code === hash) {
    schicke({ t: "join", code: hash, token: gespeichert.token, name: nameFeld() });
  } else if (hash) {
    $("codeInput").value = hash;
    schicke({ t: "browse" });
  } else {
    schicke({ t: "browse" });
  }
});
setInterval(() => schicke({ t: "ping", c: Date.now() }), 25000);
