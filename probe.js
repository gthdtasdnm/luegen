// Spielt Lügen mit drei Clients durch: Geben, Ansageleiter, verdeckt legen,
// die Wahrheit sagen und angezweifelt werden, lügen und erwischt werden, das
// Ass als Leiterende, eine Partie leerspielen bis zum Endstand, Abgang mitten
// im Zug, Neustart.
//
// Kein Testrahmen, keine Abhaengigkeit – das Skript wirft, wenn etwas nicht
// stimmt, und schreibt sonst mit, was passiert ist. Der Server muss dafuer
// laufen:
//
//   deno task dev            (in einer zweiten Sitzung)
//   deno task probe
// Gegen die Live-Fassung statt gegen den lokalen Server:
//   WS_URL=wss://inf-zeus.de/luegen/ws deno task probe
//
// Die Karten sind zufaellig, der Ausgang aber nicht: die Probe kennt ihre
// eigenen Haende und entscheidet selbst, wann gelogen wird. Gerechnet wird mit
// derselben `blatt.js`, die auch der Server benutzt. Der erste Teil laeuft ganz
// ohne Server.

import { istGelogen, naechsterRang, neuesDeck, RAENGE } from "./blatt.js";

const PORT = Deno.env.get("PORT") ?? "8069";
const URL_WS = Deno.env.get("WS_URL") ?? `ws://127.0.0.1:${PORT}/ws`;

const muss = (bedingung, text) => { if (!bedingung) throw new Error(text); };
const karte = (k) => k.f + k.r;

// --- Erst das Blatt, ohne Server --------------------------------------------

const deck = neuesDeck();
muss(deck.length === 52, "Ein volles Blatt hat 52 Karten, hier: " + deck.length);
muss(new Set(deck.map(karte)).size === 52, "Im Deck liegt eine Karte doppelt");
muss(RAENGE.length === 13, "Die Leiter hat nicht dreizehn Sprossen");

for (let i = 0; i < RAENGE.length - 1; i++) {
  muss(naechsterRang(RAENGE[i]) === RAENGE[i + 1],
    `Nach ${RAENGE[i]} müsste ${RAENGE[i + 1]} kommen, kommt aber ${naechsterRang(RAENGE[i])}`);
}
muss(naechsterRang("A") === null, "Nach dem Ass müsste die Ansage frei sein");
console.log("ok  52 Karten, Leiter von der 2 bis zum Ass, danach frei");

muss(istGelogen([{ r: "9", f: "♠" }], "10"), "Eine falsche Karte ist eine Lüge");
muss(!istGelogen([{ r: "9", f: "♠" }, { r: "9", f: "♥" }], "9"), "Zwei richtige sind keine Lüge");
muss(istGelogen([{ r: "9", f: "♠" }, { r: "8", f: "♥" }], "9"),
  "Eine falsche unter zwei richtigen ist immer noch eine Lüge");
console.log("ok  gelogen ist, wenn auch nur eine Karte nicht stimmt");

// --- Jetzt der Server -------------------------------------------------------

function client(name) {
  const c = {
    name, ws: new WebSocket(URL_WS), you: null, room: null, runde: null,
    final: null, fehler: [],
  };
  c.ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "joined") c.you = m.you;
    if (m.t === "room") c.room = m;
    if (m.t === "runde") { c.runde = m; c.final = null; }
    if (m.t === "final") c.final = m;
    if (m.t === "error") c.fehler.push(m.msg);
  };
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.offen = new Promise((res) => { c.ws.onopen = res; });
  return c;
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function bis(bedingung, was, ms = 9000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (bedingung()) return;
    await warte(25);
  }
  throw new Error("Zeitüberschreitung: " + was);
}

const A = client("Anna"), B = client("Ben"), C = client("Cem");
const alleC = [A, B, C];
await Promise.all(alleC.map((c) => c.offen));

// Nicht oeffentlich: die Probe laeuft auch gegen live, und dort soll kein
// Geisterraum in der Liste stehen.
A.send({ t: "create", name: "Anna", isPublic: false });
await bis(() => A.room, "Raum angelegt");
console.log("Raum:", A.room.code);

for (const c of [B, C]) c.send({ t: "join", code: A.room.code, name: c.name });
await bis(() => A.room.players.length === 3, "drei Spieler");

A.send({ t: "start" });
await warte(150);
muss(A.room.phase === "lobby", "Start ging ohne Bereit durch");
console.log("ok  Start blockiert, solange nicht alle bereit sind");

for (const c of [B, C]) c.send({ t: "ready", value: true });
await bis(() => A.room.players.every((p) => p.ready || p.host), "alle bereit");
A.send({ t: "start" });
await bis(() => alleC.every((c) => c.runde?.hand?.length), "gegeben");

// --- Was gegeben wurde ------------------------------------------------------

const alleHand = alleC.flatMap((c) => c.runde.hand.map(karte));
muss(alleHand.length === 52, "Es wurden nicht alle 52 Karten verteilt: " + alleHand.length);
muss(new Set(alleHand).size === 52, "Eine Karte wurde doppelt gegeben");
const groessen = alleC.map((c) => c.runde.hand.length).sort();
muss(JSON.stringify(groessen) === "[17,17,18]", "Ungleich gegeben: " + groessen.join("/"));
console.log(`ok  52 Karten auf drei Hände verteilt (${groessen.join("/")}), keine doppelt`);

for (const c of alleC) {
  muss(c.runde.spieler.every((s) => s.hand === undefined),
    `${c.name} sieht fremde Karten in der Spielerliste`);
  muss(c.runde.stapel === 0, "Vor dem ersten Zug liegt schon etwas auf dem Stapel");
  muss(c.runde.rang === null, "Der erste Zug müsste eine freie Ansage sein");
  muss(c.runde.letzte === null, "Vor dem ersten Zug gibt es schon eine letzte Ablage");
}
console.log("ok  jeder sieht nur die eigene Hand, der Stapel ist leer, die Ansage frei");

const amZug = () => alleC.find((c) => c.you === A.runde.amZug);
const kartenGesamt = () =>
  alleC.reduce((n, c) => n + c.runde.hand.length, 0) + A.runde.stapel;

/** Legt `n` Karten und sagt `rang` an – gelogen oder nicht, wie gewünscht. */
async function legt(d, { luegen = false, rang = null, n = 1 } = {}) {
  const m = d.runde;
  const ansage = rang ?? m.rang ?? m.hand[0].r;
  let idx;
  if (luegen) {
    idx = m.hand.map((k, i) => [k, i]).filter(([k]) => k.r !== ansage).slice(0, n).map(([, i]) => i);
    muss(idx.length === n, `${d.name} hat keine ${n} Karten, die nicht ${ansage} sind`);
  } else {
    idx = m.hand.map((k, i) => [k, i]).filter(([k]) => k.r === ansage).slice(0, n).map(([, i]) => i);
    if (idx.length < n) return null;   // die Wahrheit geht gerade nicht
  }
  const gelegt = idx.map((i) => m.hand[i]);
  const stapelVor = m.stapel;
  d.send({ t: "legen", karten: idx, rang: ansage });
  await bis(() => A.runde.stapel === stapelVor + n, `${d.name} legt ${n}× ${ansage}`);
  return { ansage, gelegt };
}

// --- Wer nicht dran ist, legt nicht ------------------------------------------

{
  const d = amZug();
  const fremd = alleC.find((c) => c !== d);
  fremd.send({ t: "legen", karten: [0], rang: "5" });
  d.send({ t: "legen", karten: [], rang: "5" });                 // gar keine Karte
  d.send({ t: "legen", karten: [0, 1, 2, 3, 4], rang: "5" });    // fünf sind zu viel
  d.send({ t: "legen", karten: [99], rang: "5" });               // die es nicht gibt
  d.send({ t: "legen", karten: [0], rang: "1" });                // den Rang gibt es nicht
  await warte(250);
  muss(A.runde.stapel === 0, "Eine dieser fünf ungültigen Ablagen ist durchgegangen");
  console.log("ok  abgelehnt: fremder Zug, keine Karte, fünf Karten, falscher Index, falscher Rang");
}

// --- Die Wahrheit sagen und angezweifelt werden -----------------------------

let d = amZug();
const wahr = await legt(d, { luegen: false, rang: d.runde.hand[0].r, n: 1 }) ??
  await legt(d, { luegen: true, n: 1 });
muss(A.runde.rang === naechsterRang(wahr.ansage),
  `Nach ${wahr.ansage} müsste ${naechsterRang(wahr.ansage)} angesagt sein, angesagt ist ${A.runde.rang}`);
muss(A.runde.letzte.anzahl === 1 && A.runde.letzte.rang === wahr.ansage, "Die letzte Ablage stimmt nicht");
for (const c of alleC) {
  muss(c.runde.letzte.karten === undefined, `${c.name} sieht die verdeckten Karten`);
}
console.log(`ok  ${d.name} legt 1× ${wahr.ansage} verdeckt – niemand sieht, was es wirklich ist`);

d.send({ t: "luege" });
await warte(200);
muss(A.runde.schritt === "legen", "Man konnte die eigene Ablage anzweifeln");
console.log("ok  die eigene Ablage kann niemand anzweifeln");

const zweifler = alleC.find((c) => c !== d);
const legerVor = d.runde.hand.length, zweiflerVor = zweifler.runde.hand.length;
zweifler.send({ t: "luege" });
await bis(() => A.runde.schritt === "aufdecken", "aufgedeckt");

let auf = A.runde.aufdeckung;
muss(auf.gelogen === false, "Die Wahrheit wurde als Lüge gewertet");
muss(auf.nehmer === zweifler.name, `Nehmen müsste ${zweifler.name}, nimmt aber ${auf.nehmer}`);
muss(auf.leger === d.name && auf.zweifler === zweifler.name, "Leger oder Zweifler falsch benannt");
muss(JSON.stringify(auf.karten.map(karte)) === JSON.stringify(wahr.gelegt.map(karte)),
  "In der Aufdeckung liegen andere Karten als gelegt");
muss(zweifler.runde.hand.length === zweiflerVor + 1, "Der Zweifler hat den Stapel nicht bekommen");
muss(d.runde.hand.length === legerVor, "Der Leger hat Karten verloren, obwohl er recht hatte");
muss(A.runde.stapel === 0 && A.runde.rang === null, "Der Stapel wurde nicht abgeräumt");
muss(A.runde.amZug === d.you, "Wer recht hatte, müsste neu anfangen");
console.log(`ok  wer zu Unrecht zweifelt, nimmt den Stapel (${zweifler.name}, +1)`);

await bis(() => A.runde.schritt === "legen", "weiter nach der Aufdeckung");
muss(A.runde.aufdeckung === null, "Die Aufdeckung bleibt stehen");

// --- Lügen und erwischt werden ----------------------------------------------

d = amZug();
const gelogen = await legt(d, { luegen: true, rang: naechsterRang(d.runde.hand[0].r) ?? "3", n: 2 });
const legerVor2 = d.runde.hand.length;
const zweifler2 = alleC.find((c) => c !== d);
zweifler2.send({ t: "luege" });
await bis(() => A.runde.schritt === "aufdecken", "die Lüge ist aufgedeckt");

auf = A.runde.aufdeckung;
muss(auf.gelogen === true, "Eine Lüge wurde als Wahrheit gewertet");
muss(auf.nehmer === d.name, `Nehmen müsste ${d.name}, nimmt aber ${auf.nehmer}`);
muss(d.runde.hand.length === legerVor2 + 2, "Der Lügner hat den Stapel nicht bekommen");
muss(A.runde.amZug === zweifler2.you, "Wer recht hatte, müsste neu anfangen");
console.log(`ok  wer beim Lügen erwischt wird, nimmt den Stapel (${d.name}, +2)`);
await bis(() => A.runde.schritt === "legen", "weiter nach der Aufdeckung");

// --- Das Ass beendet die Leiter ---------------------------------------------

d = amZug();
await legt(d, { luegen: true, rang: "A", n: 1 });
muss(A.runde.rang === null, "Nach dem Ass müsste die Ansage wieder frei sein");
console.log("ok  nach dem Ass fängt die Ansage von vorn an");

// --- Leerspielen bis zum Endstand -------------------------------------------

muss(kartenGesamt() === 52, "Vor dem Leerspielen fehlen Karten: " + kartenGesamt());

for (let zug = 0; zug < 200 && !A.final; zug++) {
  const spieler = amZug();
  if (!spieler) break;
  const m = spieler.runde;
  const ansage = m.rang ?? m.hand[0].r;
  const n = Math.min(4, m.hand.length);
  const idx = Array.from({ length: n }, (_, i) => i);
  const stapelVor = m.stapel;
  spieler.send({ t: "legen", karten: idx, rang: ansage });
  await bis(() => A.runde.stapel === stapelVor + n || A.final, `${spieler.name} legt ${n}`);
  if (A.final) break;
  muss(kartenGesamt() === 52, "Beim Leerspielen ist eine Karte verschwunden: " + kartenGesamt());
}

muss(A.final, "Die Partie wurde nicht fertig – niemand konnte sie beenden");
const f = A.final;
muss(f.tabelle.length === 3, "Im Endstand fehlt jemand");
muss(f.tabelle[0].platz === 1, "Ganz oben steht nicht der Erste");
muss(f.tabelle.filter((z) => z.karten === 0).length >= 2, "Es sind nicht mindestens zwei leer geworden");
console.log("Endstand: " + f.tabelle.map((z) => `${z.name} Platz ${z.platz} (${z.karten})`).join(" · "));
console.log("ok  die Partie endet von allein, sobald nur noch einer Karten hat");

A.send({ t: "again" });
await bis(() => A.room.phase === "lobby", "zurück im Warteraum");
console.log("ok  Nochmal setzt alles zurück");

// --- Abgang mitten im Zug ---------------------------------------------------

for (const c of [B, C]) c.send({ t: "ready", value: true });
await bis(() => A.room.players.every((p) => p.ready || p.host), "wieder alle bereit");
A.send({ t: "start" });
await bis(() => alleC.every((c) => c.runde && !c.final), "neue Partie");

const geht = amZug();
const bleibt = alleC.filter((c) => c !== geht);
geht.send({ t: "leave" });
await bis(() => bleibt[0].runde.spieler.length === 2 || bleibt[0].final, "einer ist raus");
muss(!bleibt[0].final, "Bei zwei Übriggebliebenen ist noch nicht Schluss");
muss(bleibt[0].runde.amZug !== geht.you, `Der Zug hängt an ${geht.name} – weg, aber noch dran`);
console.log(`ok  ${geht.name} geht mitten im eigenen Zug – die Runde läuft weiter`);

bleibt[1].send({ t: "leave" });
await bis(() => bleibt[0].final, "unter zwei Leuten ist Schluss");
console.log("ok  unter zwei Leuten endet die Partie von allein");

if (alleC.some((c) => c.fehler.length)) {
  throw new Error("Fehlermeldungen: " + JSON.stringify(alleC.map((c) => c.fehler)));
}
console.log("\nALLES GRÜN");
Deno.exit(0);
