// LÜGEN – Client. Der Server hält die Wahrheit; hier wird nur gezeichnet.
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

function verbinde(dann) {
  if (S.ws && S.ws.readyState === WebSocket.OPEN) return dann?.();
  S.ws = new WebSocket(wsUrl());
  S.ws.onopen = () => { $("status").textContent = ""; dann?.(); };
  S.ws.onmessage = (ev) => empfange(JSON.parse(ev.data));
  S.ws.onclose = () => {
    $("status").textContent = "Verbindung weg – neu verbinden …";
    setTimeout(() => verbinde(() => {
      if (S.code) schicke({ t: "join", code: S.code, token: S.token, name: nameFeld() });
      else schicke({ t: "browse" });
    }), 1500);
  };
}
const schicke = (m) => S.ws?.readyState === WebSocket.OPEN && S.ws.send(JSON.stringify(m));

const nameFeld = () => $("name").value.trim() || "Spieler";

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

// ---------------------------------------------------------------- Nachrichten
function empfange(m) {
  switch (m.t) {
    case "rooms": zeichneRaeume(m.rooms); break;
    case "joined":
      S.me = m.you; S.token = m.token; S.code = m.code;
      sessionStorage.setItem("luegen", JSON.stringify({ code: m.code, token: m.token }));
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
  if (!liste.length) return box.append(el("div", "rooms-empty", "Gerade keine offenen Räume."));
  for (const r of liste) {
    const row = el("div", "roomrow");
    row.append(el("span", "roomrow-code", r.code));
    row.append(el("span", "roomrow-name", r.host));
    row.append(el("span", "roomrow-count", `${r.count}/${r.max}`));
    row.onclick = () => schicke({ t: "join", code: r.code, name: nameFeld() });
    box.append(row);
  }
}

function zeichneRaum() {
  const r = S.room;
  if (r.phase === "lobby") zeige("lobby");
  else if (r.phase === "playing") zeige("game");
  $("roomCode").textContent = r.code;
  $("roomVis").textContent = r.isPublic ? "öffentlich" : "privat";
  $("lobbyCount").textContent = `${r.players.length}/${r.maxPlayers}`;

  const liste = $("playerList");
  liste.innerHTML = "";
  for (const p of r.players) {
    const s = el("div", "seat" + (p.ready ? " ready" : "") + (p.connected ? "" : " off"));
    s.append(el("div", "av", (p.name[0] ?? "?").toUpperCase()));
    s.append(el("div", "nm", p.name));
    s.append(el("div", "st", p.ready ? "bereit" : p.connected ? "wartet" : "weg"));
    if (p.host) s.append(el("div", "host", "Host"));
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
    ? `Mindestens ${r.minPlayers} Leute – ihr seid ${da}.`
    : alleBereit ? "" : "Noch nicht alle sind bereit.";
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
  $("ansageTag").textContent = m.rang ? "Dran: " + m.rang : "freie Ansage";

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
    mi.append(el("p", "mitte-txt",
      `${m.letzte.von} sagt: ${m.letzte.anzahl}× ${m.letzte.rang}`));
  } else {
    mi.append(el("p", "mitte-txt", "Neue Ansage – der Stapel ist frei."));
  }

  // Aufdeckung
  const auf = $("aufdeckung");
  if (m.aufdeckung) {
    auf.hidden = false;
    auf.innerHTML = "";
    const a = m.aufdeckung;
    auf.append(el("p", "auf-kopf", a.gelogen ? "Gelogen!" : "Die Wahrheit."));
    const row = el("div", "auf-karten");
    for (const k of a.karten) {
      row.append(el("span", "karte " + (k.f === "♥" || k.f === "♦" ? "rot" : ""), KARTE(k)));
    }
    auf.append(row);
    auf.append(el("p", "auf-txt",
      `Angesagt war ${a.rang}. ${a.nehmer} nimmt ${a.anzahl} Karten.`));
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
    $("rundenHint").textContent = "Aufgedeckt – gleich geht es weiter.";
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
    const legen = el("button", "btn primary big", "Legen");
    legen.disabled = !S.gewaehlt.size || (m.rang === null && !S.ansage);
    legen.onclick = () => {
      schicke({ t: "legen", karten: [...S.gewaehlt], rang: m.rang ?? S.ansage });
      S.gewaehlt.clear(); S.ansage = null;
    };
    akt.append(legen);
    $("rundenHint").textContent = m.rang
      ? `Du bist dran: ${m.rang} ansagen – ehrlich oder nicht.`
      : "Du bist dran: Rang wählen und legen.";
  } else {
    $("rundenHint").textContent = m.letzte
      ? "Glaubst du das?"
      : "Warte, bis du dran bist.";
  }
  if (m.letzte && m.letzte.vonId !== S.me && m.schritt === "legen") {
    const l = el("button", "btn big luege", "Lüge!");
    l.onclick = () => schicke({ t: "luege" });
    akt.append(l);
  }
}

function zeichneFinal(m) {
  zeige("final");
  $("finalSub").textContent = m.verlierer.length
    ? `${m.verlierer.join(", ")} bleibt auf den Karten sitzen.`
    : "";
  const ol = $("podium");
  ol.innerHTML = "";
  for (const z of m.tabelle) {
    const li = el("li");
    li.append(el("span", "pd-name", z.name));
    li.append(el("span", "pd-pt", z.karten ? z.karten + " Karten" : "durch"));
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
  if (code) verbinde(() => schicke({ t: "join", code, name: nameFeld() }));
};
$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname + "#" + S.code);
    toast("Link kopiert");
  } catch { toast(location.href); }
};
$("readyBtn").onclick = () => {
  const ich = S.room?.players.find((p) => p.id === S.me);
  schicke({ t: "ready", value: !ich?.ready });
};
$("startBtn").onclick = () => schicke({ t: "start" });
$("endeBtn").onclick = () => schicke({ t: "ende" });
$("againBtn").onclick = () => schicke({ t: "again" });
$("leaveBtn").onclick = () => {
  schicke({ t: "leave" });
  S.code = null; S.room = null;
  sessionStorage.removeItem("luegen");
  history.replaceState(null, "", location.pathname);
  zeige("home");
  schicke({ t: "browse" });
};
$("helpBtn").onclick = () => { $("help").hidden = false; };
$("helpClose").onclick = () => { $("help").hidden = true; };

// Start
const gespeichert = JSON.parse(sessionStorage.getItem("luegen") ?? "null");
const hash = location.hash.replace("#", "").toUpperCase();
$("name").value = localStorage.getItem("spielername") ?? "";
$("name").onchange = () => localStorage.setItem("spielername", nameFeld());
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
