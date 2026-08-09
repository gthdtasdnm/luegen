// Das Blatt und die Ansageleiter – als eigene Datei, damit `probe.js` genau
// die Funktionen prüfen kann, mit denen auch der Server rechnet. Sonst prüft
// die Probe eine Nachbildung, und die kann mit dem Server auseinanderlaufen,
// ohne dass es jemandem auffällt. Dasselbe Muster wie `zug.js` beim Wortleger.

// Die Leiter, auf der angesagt wird. Nach dem Ass geht es nicht weiter –
// deshalb wird der Stapel dort weggeräumt statt herumgereicht.
export const RAENGE = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
export const FARBEN = ["♠", "♥", "♦", "♣"];

export function mische(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function neuesDeck() {
  const deck = [];
  for (const r of RAENGE) for (const f of FARBEN) deck.push({ r, f });
  return mische(deck);
}

/**
 * Was muss der Nächste ansagen? `null` heißt: frei wählbar.
 *
 * Nach dem Ass ist die Leiter zu Ende, also fängt die Ansage von vorn an.
 */
export const naechsterRang = (rang) => rang === "A" ? null : RAENGE[RAENGE.indexOf(rang) + 1];

/** Gelogen ist, wenn auch nur eine der Karten nicht der Ansage entspricht. */
export const istGelogen = (karten, rang) => karten.some((k) => k.r !== rang);
