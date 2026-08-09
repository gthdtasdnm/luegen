// LÜGEN (Mogeln) – Deno-Server: statische Dateien + WebSocket + Rundenlogik.
// Alle Karten werden verteilt, wer zuerst leer ist, hat gewonnen. Abgelegt
// wird verdeckt und angesagt; wer nicht glaubt, deckt auf.
//
// Raum, Host, Bereit, Karenzzeit und Bremse stehen in raum.js/statisch.js –
// Kopien aus /var/www/html/gemeinsam/.

import { darfRaumOeffnen, raumVermerkt } from "./bremse.js";
import { cleanName, raumverwaltung, shuffle } from "./raum.js";
import { starte } from "./statisch.js";

const PORT = Number(Deno.env.get("PORT") ?? 8069);
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const PUBLIC = new URL("./public/", import.meta.url);

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;

// Die Leiter, auf der angesagt wird. Nach dem Ass geht es nicht weiter –
// deshalb wird der Stapel dort weggeräumt statt herumgereicht.
const RAENGE = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
const FARBEN = ["♠", "♥", "♦", "♣"];

const AUFDECK_MS = 5000;

function neuesDeck() {
  const deck = [];
  for (const r of RAENGE) for (const f of FARBEN) deck.push({ r, f });
  return shuffle(deck);
}

const {
  rooms, browsing,
  createRoom, clearTimers, anwesende,
  send, raw, broadcast,
  roomList, pushState, pushRoomList,
  makePlayer, attach, dropPlayer,
} = raumverwaltung({
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  einstellungen: {},
  raumfelder: () => ({
    reihe: [],      // Spieler-Ids in Zugreihenfolge, ohne die Fertigen
    fertig: [],     // Ids in der Reihenfolge, in der sie leer wurden
    stapel: [],     // verdeckt abgelegte Karten
    letzte: null,   // { von, rang, karten }
    rang: null,     // angesagter Rang, null = frei wählbar
    amZug: null,
    schritt: "legen", // legen | aufdecken | ende
    aufdeckung: null,
  }),
  spielerfelder: () => ({ hand: [] }),

  beimBeitritt: (room, player) => {
    if (room.phase === "playing") sendeHand(room, player);
  },
  nachVerlassen: (room, player) => {
    if (room.phase === "playing" && room.amZug === player.id) weiterWennWeg(room);
  },
  beimPlatzfrei: (room, id) => {
    if (room.phase !== "playing") return;
    const i = room.reihe.indexOf(id);
    if (i >= 0) room.reihe.splice(i, 1);
    if (room.amZug === id) weiterWennWeg(room);
    if (room.reihe.length < 2) finishGame(room);
    else pushRunde(room);
  },
  zurueckZurLobby: (room) => backToLobby(room),
});

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

function startGame(room) {
  clearTimers(room);
  room.phase = "playing";
  room.rundeNr = 1;
  room.fertig = [];
  room.stapel = [];
  room.letzte = null;
  room.rang = null;
  room.aufdeckung = null;
  room.schritt = "legen";

  const da = anwesende(room);
  room.reihe = shuffle(da.map((p) => p.id));
  for (const p of room.players.values()) {
    p.hand = [];
    p.punkte = 0;
    p.ready = false;
  }
  const deck = neuesDeck();
  let i = 0;
  while (deck.length) {
    const p = room.players.get(room.reihe[i % room.reihe.length]);
    p.hand.push(deck.pop());
    i++;
  }
  for (const id of room.reihe) sortiere(room.players.get(id));
  room.amZug = room.reihe[0];
  pushState(room);
  pushRunde(room);
  pushRoomList();
}

function sortiere(p) {
  p.hand.sort((a, b) => RAENGE.indexOf(a.r) - RAENGE.indexOf(b.r));
}

function naechster(room, von) {
  if (!room.reihe.length) return null;
  const i = room.reihe.indexOf(von);
  if (i < 0) return room.reihe[0];
  return room.reihe[(i + 1) % room.reihe.length];
}

/** Ist der am Zug weg, rückt der Nächste nach – sonst steht die Partie. */
function weiterWennWeg(room) {
  const p = room.players.get(room.amZug);
  if (p?.connected) return;
  const naechsteId = naechster(room, room.amZug);
  room.amZug = naechsteId;
  pushRunde(room);
}

/** Der Spieler vor dem Zug ist leer geworden und wurde nicht erwischt. */
function pruefeFertig(room, id) {
  const p = room.players.get(id);
  if (!p || p.hand.length) return;
  if (room.fertig.includes(id)) return;
  room.fertig.push(id);
  p.punkte = room.reihe.length; // wer früher fertig ist, bekommt mehr
  const i = room.reihe.indexOf(id);
  if (i >= 0) room.reihe.splice(i, 1);
}

function pushRunde(room) {
  if (room.phase !== "playing") return;
  const oeffentlich = room.reihe.map((id) => {
    const p = room.players.get(id);
    return { id, name: p?.name ?? "?", karten: p?.hand.length ?? 0, weg: !p?.connected };
  });
  for (const p of room.players.values()) {
    send(p, {
      t: "runde",
      schritt: room.schritt,
      amZug: room.amZug,
      rang: room.rang,
      naechsterRang: room.rang === null ? null : room.rang,
      stapel: room.stapel.length,
      letzte: room.letzte
        ? {
          von: room.players.get(room.letzte.von)?.name ?? "?",
          vonId: room.letzte.von,
          anzahl: room.letzte.karten.length,
          rang: room.letzte.rang,
        }
        : null,
      spieler: oeffentlich,
      fertig: room.fertig.map((id) => room.players.get(id)?.name ?? "?"),
      hand: p.hand,
      aufdeckung: room.aufdeckung,
    });
  }
}

function sendeHand(room, player) {
  pushRunde(room);
}

/** Aufdecken: hat der Letzte gelogen? Wer nimmt den Stapel? */
function aufdecken(room, zweiflerId) {
  const l = room.letzte;
  if (!l) return;
  const leger = room.players.get(l.von);
  const zweifler = room.players.get(zweiflerId);
  const gelogen = l.karten.some((k) => k.r !== l.rang);
  const nehmerId = gelogen ? l.von : zweiflerId;
  const nehmer = room.players.get(nehmerId);

  if (nehmer) {
    nehmer.hand.push(...room.stapel);
    sortiere(nehmer);
    // Wer den Stapel nimmt, ist nicht mehr fertig – auch wenn er leer war.
    const i = room.fertig.indexOf(nehmerId);
    if (i >= 0) {
      room.fertig.splice(i, 1);
      if (!room.reihe.includes(nehmerId)) room.reihe.push(nehmerId);
    }
  }

  room.aufdeckung = {
    karten: l.karten,
    rang: l.rang,
    gelogen,
    leger: leger?.name ?? "?",
    zweifler: zweifler?.name ?? "?",
    nehmer: nehmer?.name ?? "?",
    anzahl: room.stapel.length,
  };
  room.stapel = [];
  room.letzte = null;
  room.rang = null;
  room.schritt = "aufdecken";

  // Ohne Karten und nicht erwischt: der Leger ist durch.
  if (!gelogen) pruefeFertig(room, l.von);

  // Wer recht hatte, fängt neu an.
  const gewinner = gelogen ? zweiflerId : l.von;
  room.amZug = room.reihe.includes(gewinner) ? gewinner : naechster(room, gewinner);
  pushRunde(room);
  pushState(room);

  const id = setTimeout(() => {
    room.timers.delete(id);
    room.aufdeckung = null;
    if (room.reihe.length < 2) return finishGame(room);
    room.schritt = "legen";
    pushRunde(room);
  }, AUFDECK_MS);
  room.timers.add(id);
}

function finishGame(room) {
  clearTimers(room);
  room.phase = "final";
  room.schritt = "ende";
  const verlierer = room.reihe.map((id) => room.players.get(id)?.name ?? "?");
  const tabelle = [
    ...room.fertig.map((id, i) => ({
      name: room.players.get(id)?.name ?? "?",
      platz: i + 1,
      karten: 0,
    })),
    ...room.reihe.map((id) => ({
      name: room.players.get(id)?.name ?? "?",
      platz: room.fertig.length + 1,
      karten: room.players.get(id)?.hand.length ?? 0,
    })),
  ];
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, { t: "final", tabelle, verlierer });
  pushState(room);
  pushRoomList();
}

function backToLobby(room) {
  clearTimers(room);
  room.phase = "lobby";
  room.rundeNr = 0;
  room.reihe = [];
  room.fertig = [];
  room.stapel = [];
  room.letzte = null;
  room.rang = null;
  room.aufdeckung = null;
  room.schritt = "legen";
  for (const p of room.players.values()) {
    p.ready = false;
    p.punkte = 0;
    p.hand = [];
  }
  pushState(room);
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

function handle(ws, msg) {
  const room = ws._room;
  const player = ws._player;

  if (msg.t === "ping") return raw(ws, { t: "pong", c: msg.c, s: Date.now() });

  if (msg.t === "browse") {
    if (!ws._room) {
      browsing.add(ws);
      raw(ws, { t: "rooms", rooms: roomList() });
    }
    return;
  }

  if (msg.t === "create") {
    if (room) return;
    if (!darfRaumOeffnen(ws._ip)) {
      return raw(ws, { t: "error", msg: "Zu viele Räume in kurzer Zeit. Warte kurz." });
    }
    raumVermerkt(ws._ip);
    const r = createRoom(msg.isPublic);
    const p = makePlayer(msg.name, true);
    r.hostId = p.id;
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    pushRoomList();
    return;
  }

  if (msg.t === "join") {
    if (room) return;
    const r = rooms.get(String(msg.code ?? "").toUpperCase().trim());
    if (!r) return raw(ws, { t: "error", msg: "Diesen Raum gibt es nicht" });
    if (msg.token) {
      const back = [...r.players.values()].find((p) => p.token === msg.token);
      if (back) {
        if (back.ws && back.ws !== ws && back.ws.readyState === WebSocket.OPEN) {
          try { back.ws.close(4001, "woanders geöffnet"); } catch { /* egal */ }
        }
        attach(ws, r, back);
        pushState(r);
        return;
      }
    }
    if (r.players.size >= MAX_PLAYERS) {
      return raw(ws, { t: "error", msg: `Der Raum ist voll (${MAX_PLAYERS} Spieler)` });
    }
    if (r.phase !== "lobby") return raw(ws, { t: "error", msg: "Die Runde läuft schon" });
    const p = makePlayer(msg.name, false);
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    return;
  }

  if (!room || !player) return;
  room.lastActivity = Date.now();

  switch (msg.t) {
    case "name":
      player.name = cleanName(msg.name);
      pushState(room);
      pushRunde(room);
      break;

    case "ready":
      player.ready = !!msg.value;
      pushState(room);
      break;

    case "settings":
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      if (typeof msg.isPublic === "boolean") room.isPublic = msg.isPublic;
      pushState(room);
      pushRoomList();
      break;

    case "start": {
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      const da = anwesende(room);
      if (da.length < MIN_PLAYERS) break;
      if (!da.every((p) => p.ready || p.id === room.hostId)) break;
      startGame(room);
      break;
    }

    case "legen": {
      if (room.phase !== "playing" || room.schritt !== "legen") break;
      if (room.amZug !== player.id) break;
      const idx = Array.isArray(msg.karten) ? [...new Set(msg.karten.map(Number))] : [];
      if (!idx.length || idx.length > 4) break;
      if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= player.hand.length)) break;

      let rang = room.rang;
      if (rang === null) {
        rang = String(msg.rang ?? "");
        if (!RAENGE.includes(rang)) break;
      }

      // Der Vorgänger hat es überstanden, wenn jetzt jemand weiterlegt.
      if (room.letzte) pruefeFertig(room, room.letzte.von);

      const karten = idx.sort((a, b) => b - a).map((i) => player.hand.splice(i, 1)[0]);
      room.stapel.push(...karten);
      room.letzte = { von: player.id, rang, karten };

      if (rang === "A") {
        // Ein Ass wird nicht weitergegeben: der Stapel bleibt liegen, aber
        // der Nächste fängt eine neue Ansage an.
        room.rang = null;
      } else {
        room.rang = RAENGE[RAENGE.indexOf(rang) + 1];
      }
      room.amZug = naechster(room, player.id);
      pushRunde(room);
      break;
    }

    case "luege": {
      if (room.phase !== "playing" || room.schritt !== "legen") break;
      if (!room.letzte || room.letzte.von === player.id) break;
      if (!room.reihe.includes(player.id) && !room.fertig.includes(player.id)) break;
      aufdecken(room, player.id);
      break;
    }

    case "ende":
      if (player.id !== room.hostId || room.phase !== "playing") break;
      finishGame(room);
      break;

    case "again":
      if (player.id !== room.hostId || room.phase !== "final") break;
      backToLobby(room);
      break;

    case "leave":
      dropPlayer(ws, { immediate: true });
      break;
  }
}

starte({ port: PORT, host: HOST, publicDir: PUBLIC, titel: "LÜGEN", handle, dropPlayer });
