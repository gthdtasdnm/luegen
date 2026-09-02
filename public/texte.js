// Türkisch und Englisch für luegen.
//
// Deutsch steht im HTML und – wo Text erst im Code entsteht – als drittes
// Argument bei `t()` bzw. als `text` in den Servermeldungen. Hier liegen nur
// die beiden anderen Fassungen darüber.
//
// Die Schlüssel sind beim Umstellen maschinell vergeben worden und tragen
// deshalb die ersten Wörter des deutschen Satzes im Namen – so findet man die
// Stelle im Markup wieder.
//
// Warteraum, Raumliste und Endstand stehen nicht hier, sondern in
// `schale-texte.js`: die sind in mehreren Spielen gleich und werden von
// `verteilen.mjs` mitgeführt.

import { SCHALE_WOERTER } from "./schale-texte.js";

const EIGEN = {
  tr: {
    "luegen.allekartenlo1": "Bütün kartlardan kurtul. Gerekirse hile yap.",
    "luegen.stapel2": "Deste",
    "luegen.allekartenwe3": "<b>Bütün kartlar dağıtılır.</b> Kartları ilk biten çıkar – iyi anlamda.",
    "luegen.reihumwirdab4": "<b>Sırayla kapalı atılır</b>, bir ile dört kart, ve söylenir: „Üç tane sekiz.“",
    "luegen.dieansageste5": "<b>Söylenen sıra</b> her turda bir basamak yükselir. Yani elinde olsun olmasın, sıradakini atmak zorundasın.",
    "luegen.niemandsieht6": "<b>Gerçekte ne attığını kimse görmez.</b> Bütün mesele bu.",
    "luegen.glaubtjemand7": "<b>İnanmayan „Yalan!“a basar.</b> Açılır: yalan söylediysen bütün desteyi sen alırsın. Doğru söylediysen şüphelenen alır.",
    "luegen.einasswirdni8": "<b>As devredilmez.</b> As söylendikten sonra sıradaki yeni bir sıralama başlatır.",
    "lg.dran": "Sıra: {rang}",
    "lg.freieAnsage": "serbest söyleme",
    "lg.sagt": "{name} diyor ki: {n}× {rang}",
    "lg.neueAnsage": "Yeni söyleme – deste serbest.",
    "lg.gelogen": "Yalan!",
    "lg.wahrheit": "Doğruymuş.",
    "lg.angesagtWar": "Söylenen {rang} idi. {name} {n} kart alıyor.",
    "lg.aufgedeckt": "Açıldı – birazdan devam.",
    "lg.legen": "At",
    "lg.duDranRang": "Sıra sende: {rang} söyle – dürüstçe ya da değil.",
    "lg.duDranFrei": "Sıra sende: sıra seç ve at.",
    "lg.glaubstDu": "İnanıyor musun?",
    "lg.warteDran": "Sıranı bekle.",
    "lg.luege": "Yalan!",
    "lg.bleibtSitzen": "Kartlar {name} elinde kaldı.",
    "lg.nKarten": "{n} kart",
    "lg.durch": "bitirdi",
  },

  en: {
    "luegen.allekartenlo1": "Get rid of every card. Cheat if you have to.",
    "luegen.stapel2": "Pile",
    "luegen.allekartenwe3": "<b>All the cards are dealt out.</b> Whoever runs out first is out – in the good sense.",
    "luegen.reihumwirdab4": "<b>In turn, cards go down face down</b>, one to four of them, with an announcement: “Three eights.”",
    "luegen.dieansageste5": "<b>The announced rank climbs</b> by one every round. So you have to play what is due, whether you hold it or not.",
    "luegen.niemandsieht6": "<b>Nobody sees what you actually play.</b> That is the whole point.",
    "luegen.glaubtjemand7": "<b>Whoever does not believe it taps “Lie!”.</b> Cards up: if you lied, you take the whole pile. If you told the truth, the doubter does.",
    "luegen.einasswirdni8": "<b>An ace is not passed on.</b> After an announced ace, the next player starts a new sequence.",
    "lg.dran": "Due: {rang}",
    "lg.freieAnsage": "free call",
    "lg.sagt": "{name} says: {n}× {rang}",
    "lg.neueAnsage": "New call – the pile is free.",
    "lg.gelogen": "A lie!",
    "lg.wahrheit": "The truth.",
    "lg.angesagtWar": "The call was {rang}. {name} takes {n} cards.",
    "lg.aufgedeckt": "Revealed – carrying on in a moment.",
    "lg.legen": "Play",
    "lg.duDranRang": "Your turn: call {rang} – honestly or not.",
    "lg.duDranFrei": "Your turn: pick a rank and play.",
    "lg.glaubstDu": "Do you believe that?",
    "lg.warteDran": "Wait for your turn.",
    "lg.luege": "Lie!",
    "lg.bleibtSitzen": "{name} is left holding the cards.",
    "lg.nKarten": "{n} cards",
    "lg.durch": "out",
  },
};

export const WOERTER = {
  tr: { ...SCHALE_WOERTER.tr, ...EIGEN.tr },
  en: { ...SCHALE_WOERTER.en, ...EIGEN.en },
};
