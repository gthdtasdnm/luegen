# Lügen (Mogeln) 🤥

Alle Karten werden verteilt, abgelegt wird **verdeckt** und dazu angesagt:
„Drei Achten." Ob es wirklich drei Achten sind, weiß nur der, der sie hinlegt.
Wer nicht glaubt, drückt auf „Lüge!" – und einer von beiden nimmt den ganzen
Stapel.

Läuft auf **Deno**, ohne eine einzige externe Abhängigkeit. Kein Build-Schritt,
kein `node_modules`, ein Prozess.

---

## Starten

```bash
deno task dev          # http://localhost:8069/
PORT=9000 deno task dev
deno task check        # Typprüfung
deno task probe        # spielt eine Partie durch (Server muss laufen)
```

Zum Ausprobieren allein: die Seite in **mehreren Browserfenstern** öffnen.

## An den Tisch kommen

Name eintippen, **Raum eröffnen** oder über die Liste bzw. den vierstelligen
**Code** beitreten.

**Drei bis sechs** Leute. Drei ist die Untergrenze: zu zweit weiß der Zweifler
immer, was der andere hat, und das Spiel ist keins mehr.

## Die Ansageleiter

Die Ansage steigt jede Ablage um einen Rang:

```
2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → B → D → K → A → (frei)
```

Man muss also legen, was gerade dran ist – ob man es hat oder nicht. Genau
darum geht es. Nach einem **Ass** ist die Leiter zu Ende: der Stapel bleibt
liegen, aber der Nächste fängt eine neue Ansage an.

Abgelegt werden **ein bis vier** Karten auf einmal.

## Aufdecken

Wer nicht glaubt, drückt „Lüge!". Der Server deckt die zuletzt gelegten Karten
auf:

- **Gelogen** – auch wenn nur eine der Karten nicht stimmt –, nimmt der Leger
  den ganzen Stapel.
- **Die Wahrheit gesagt**, nimmt ihn der Zweifler.

Wer recht hatte, fängt die nächste Ansage an. Die Aufdeckung bleibt fünf
Sekunden stehen.

Sein eigenes Ablegen kann niemand anzweifeln.

## Fertig werden

Wer seine letzte Karte ablegt, ist noch nicht durch: erst wenn der Nächste
weiterlegt, ohne dass jemand gezweifelt hat, gilt es. Wird er vorher erwischt,
nimmt er den Stapel und ist wieder dabei.

Sobald nur noch einer Karten hat, ist die Partie zu Ende. **Das war lange ein
Fehler:** wer allein übrig blieb, legte sich selbst weiter zu, niemand konnte
ihn anzweifeln, und die Partie stand für immer. Aufgefallen ist es beim
Schreiben von `probe.js` – von Hand hat nie jemand so weit gespielt.

## Was nur der Server weiß

Die Hände liegen ausschließlich im Server. Der Client bekommt seine eigene und
von den anderen nur die **Anzahl**. Vom Stapel weiß er, wie hoch er ist – nicht,
was darin liegt. Von der letzten Ablage kennt er die Ansage und die Zahl der
Karten, nie die Karten selbst.

## blatt.js

Blatt und Ansageleiter liegen in einer **eigenen Datei**, damit `probe.js` mit
denselben Funktionen rechnet wie der Server. Die Probe kennt ihre eigenen Hände
und entscheidet selbst, wann gelogen wird – so sind beide Ausgänge prüfbar,
obwohl die Karten zufällig sind.

## Wenn jemand geht

- Wer die Verbindung verliert, behält seinen Platz eine Minute lang.
- Verlässt jemand den Raum, während er am Zug ist, rückt der Zug weiter.
- Fallen die Mitspieler unter zwei, endet die Partie.

## Dateien

| Datei | Was |
|---|---|
| `server.js` | Geben, Ansageleiter, Ablegen, Aufdecken, Endstand |
| `blatt.js` | 52 Karten, `naechsterRang`, `istGelogen` |
| `probe.js` | rechnet ohne Server, dann eine Partie mit drei Clients |
| `bremse.js`, `raum.js`, `statisch.js` | gemeinsam, **wortgleich in allen Spielen** |
| `public/index.html` | alle vier Bildschirme plus die Hilfe |
| `public/schale.js` | gemeinsame Client-Schale (Verbindung, Lobby) |
| `public/style.css` | Lobby-Basis, gemeinsamer Rahmen, darunter das Eigene |
| `public/app.js` | Hand, Ansage, Stapel, Lüge-Knopf |

## Betrieb

Port **8069**, gebunden auf `127.0.0.1`, davor Apache als Reverse Proxy unter
`/luegen/`. Dienst: `luegen.service` (systemd, läuft als `www-data`).

```bash
systemctl status luegen
journalctl -u luegen -f
```

Der Zustand liegt vollständig im RAM. Ein Neustart wirft alle laufenden Partien
weg – das ist gewollt, es gibt nichts zu sichern.
