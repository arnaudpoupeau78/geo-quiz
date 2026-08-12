/* Géo Quiz — logique du jeu.

   Une manche = 10 pays, chaque pays = 3 étapes (capitale, drapeau, carte)
   suivies d'un écran de correction. Deux modes : solo, ou multijoueur en
   « passe-moi le téléphone » (mêmes questions pour tous, chacun son tour).

   Aucune base de données, aucun serveur : tout tient dans la page.
   Données : data/countries.js (pays) et data/borders.js (contours). */

(() => {
  "use strict";

  // ============================================================
  //  Constantes et données
  // ============================================================

  const DATA = window.GEO_DATA;
  const BORDS = window.GEO_BORDERS || {};
  const ROUND_SIZE = 10;      // pays par manche
  const FLAG_CHOICES = 6;     // taille de la grille de drapeaux
  const MAX_JOUEURS = 8;

  const LEAFLET_OK = typeof window.L !== "undefined";

  // Chaque pays retient son continent : en « Monde entier », la carte se cadre
  // sur le continent du pays demandé, sinon on jouerait sur un planisphère où
  // la Belgique fait un pixel.
  const CONTINENTS_REELS = DATA.continents.slice();
  CONTINENTS_REELS.forEach((c) => DATA.pays[c.id].forEach((p) => { p.cont = c.id; }));

  const TOUS = CONTINENTS_REELS.reduce((acc, c) => acc.concat(DATA.pays[c.id]), []);
  DATA.pays.monde = TOUS;
  DATA.continents = DATA.continents.concat([
    { id: "monde", nom: "Monde entier", emoji: "🌍", bounds: [[-56, -170], [78, 190]] },
  ]);
  const parId = {};
  DATA.continents.forEach((c) => { parId[c.id] = c; });

  /* Continent réellement affiché pour la question en cours : le continent
     choisi, sauf en « Monde entier » où l'on cadre sur celui du pays. */
  const contEffectif = () =>
    partie.cont.id === "monde" ? parId[tour.pays.cont] : partie.cont;

  /* Sur la carte, la règle est BINAIRE et identique pour tous les niveaux :
     le clic est dans le pays, ou il ne l'est pas. Il y avait avant une marge
     en kilomètres, mais elle produisait des verdicts indéfendables — cliquer
     en Hongrie était compté bon pour la Serbie. La difficulté ne joue donc
     plus que sur les pays tirés, les leurres de drapeaux et l'orthographe. */
  const DIFFICULTES = [
    {
      id: "facile", nom: "Facile", emoji: "🙂",
      sub: "Pays très connus · orthographe indulgente",
      maxLvl: 1, leurres: "differents", fautes: "large",
    },
    {
      id: "moyen", nom: "Moyen", emoji: "🤔",
      sub: "Pays connus et moyens",
      maxLvl: 2, leurres: "melange", fautes: "normale",
    },
    {
      id: "difficile", nom: "Difficile", emoji: "🥵",
      sub: "Tous les pays · drapeaux ressemblants · orthographe exacte",
      maxLvl: 3, leurres: "proches", fautes: "stricte",
    },
    {
      id: "melange", nom: "Mélangé", emoji: "🎲",
      sub: "Tous les niveaux tirés au hasard",
      maxLvl: 3, leurres: "melange", fautes: "normale",
    },
  ];

  const flagUrl = (iso, w) => `https://flagcdn.com/w${w || 320}/${iso}.png`;
  const nomParIso = {};
  TOUS.forEach((p) => { nomParIso[p.iso] = p.n; });

  // ============================================================
  //  Petits utilitaires
  // ============================================================

  const $ = (id) => document.getElementById(id);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function norm(s) {
    return (s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const sansArticle = (s) => s.replace(/^(le|la|les|l|el|the) /, "");

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /* Nombre de fautes de frappe tolérées, selon la difficulté et la longueur
     du mot. Les accents ne comptent jamais (retirés par norm()). */
  function fautesTolerees(mode, len) {
    if (mode === "large") return len <= 4 ? 1 : len < 10 ? 2 : 3;
    if (mode === "normale") return len <= 4 ? 0 : len < 10 ? 1 : 2;
    return len >= 10 ? 1 : 0;
  }

  /* Renvoie non seulement oui/non, mais AUSSI le nombre de fautes et la marge
     appliquée : la correction peut ainsi expliquer pourquoi « Pari » passe en
     Facile et pas en Difficile. */
  function jugerCapitale(saisie, pays, diff) {
    const rep = norm(saisie);
    if (!rep) return { ok: false, fautes: null, marge: null, autre: null };

    const variantes = [rep, sansArticle(rep)];
    // `aussi` = autres réponses légitimes qu'on ASSUME à l'écran (La Paz pour
    // la Bolivie). `alt` = simples variantes d'orthographe qu'on accepte en
    // silence (« beijing », « kyiv »).
    const candidats = [{ txt: pays.c, autre: null }]
      .concat((pays.aussi || []).map((t) => ({ txt: t, autre: t })))
      .concat((pays.alt || []).map((t) => ({ txt: t, autre: null })));

    let meilleur = { fautes: Infinity, marge: 0, autre: null };

    for (const cand of candidats) {
      const attendue = norm(cand.txt);
      for (const cible of [attendue, sansArticle(attendue)]) {
        if (!cible) continue;
        const marge = fautesTolerees(diff.fautes, cible.length);
        for (const r of variantes) {
          const d = levenshtein(r, cible);
          if (d < meilleur.fautes) meilleur = { fautes: d, marge, autre: cand.autre };
        }
      }
    }
    return {
      ok: meilleur.fautes <= meilleur.marge,
      fautes: meilleur.fautes, marge: meilleur.marge,
      // Renseigné seulement si c'est une AUTRE capitale qui a été reconnue.
      autre: meilleur.fautes <= meilleur.marge ? meilleur.autre : null,
    };
  }

  function formatDistance(km) {
    if (km < 1) return "moins d'1 km";
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km).toLocaleString("fr-FR")} km`;
  }

  // ============================================================
  //  Géométrie : le clic est-il DANS le pays ?
  // ============================================================

  /* Ramène une longitude dans [-180, 180] : les contours sont stockés dans
     ce repère alors que l'Océanie utilise 0..360 côté pays. */
  const normLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

  /* Ramène une longitude dans la fenêtre d'affichage d'un continent.
     Océanie [110, 200] : Samoa (-172,1) devient 187,9 et reste à l'écran.
     Monde [-170, 190] : les îles Line de Kiribati (202,6) redeviennent -157,4. */
  function lngDansFenetre(lng, ouest, est) {
    while (lng < ouest) lng += 360;
    while (lng > est) lng -= 360;
    return lng;
  }

  function dansAnneau(x, y, anneau) {
    let dedans = false;
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const xi = anneau[i][0], yi = anneau[i][1];
      const xj = anneau[j][0], yj = anneau[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        dedans = !dedans;
      }
    }
    return dedans;
  }

  function dansMulti(x, y, multi) {
    for (const poly of multi) {
      if (!dansAnneau(x, y, poly[0])) continue;
      let dansUnTrou = false;
      for (let k = 1; k < poly.length; k++) {
        if (dansAnneau(x, y, poly[k])) { dansUnTrou = true; break; }
      }
      if (!dansUnTrou) return true;
    }
    return false;
  }

  // Boîtes englobantes précalculées : filtre rapide avant le test exact,
  // et surface approximative pour départager les enclaves.
  const BBOX = {}, AIRE = {};
  Object.keys(BORDS).forEach((iso) => {
    let x1 = 180, x2 = -180, y1 = 90, y2 = -90;
    for (const poly of BORDS[iso]) for (const anneau of poly) for (const [x, y] of anneau) {
      if (x < x1) x1 = x; if (x > x2) x2 = x;
      if (y < y1) y1 = y; if (y > y2) y2 = y;
    }
    BBOX[iso] = [x1, y1, x2, y2];
    AIRE[iso] = (x2 - x1) * (y2 - y1);
  });

  /* Quel pays du jeu se trouve sous ce point ? (null = mer, ou territoire
     hors de notre liste). Sert à dire « tu as cliqué sur la France ».

     Natural Earth ne creuse pas les enclaves : le polygone de l'Italie
     recouvre le Vatican et Saint-Marin, celui de l'Afrique du Sud recouvre
     le Lesotho. On garde donc le PLUS PETIT pays qui contient le point,
     ce qui donne toujours la bonne réponse. */
  function paysSous(lng, lat) {
    const x = normLng(lng);
    let trouve = null;
    for (const iso of Object.keys(BORDS)) {
      const b = BBOX[iso];
      if (x < b[0] || x > b[2] || lat < b[1] || lat > b[3]) continue;
      if (!dansMulti(x, lat, BORDS[iso])) continue;
      if (!trouve || AIRE[iso] < AIRE[trouve]) trouve = iso;
    }
    return trouve;
  }

  /* Distance du clic au pays : 0 s'il est dedans, sinon la distance au point
     le plus proche de la frontière (et ce point, pour tracer le trait).
     Projection équirectangulaire locale : l'erreur est négligeable devant
     les marges de tolérance, et c'est instantané. */
  function distanceAuPays(lng, lat, iso) {
    const multi = BORDS[iso];
    if (!multi) return null;
    const x = normLng(lng);
    if (dansMulti(x, lat, multi)) return { dist: 0, dedans: true, pt: [x, lat] };

    const ky = 110.574;
    const kx = 111.320 * Math.cos((lat * Math.PI) / 180);
    let best = { dist: Infinity, dedans: false, pt: null };

    for (const poly of multi) for (const anneau of poly) {
      for (let i = 0; i < anneau.length - 1; i++) {
        // Recale chaque point du même côté que le clic : sans ça, un pays à
        // cheval sur l'antiméridien (Russie, Fidji) donnerait 20 000 km.
        let x1 = anneau[i][0], x2 = anneau[i + 1][0];
        const y1 = anneau[i][1], y2 = anneau[i + 1][1];
        if (x1 - x > 180) x1 -= 360; else if (x1 - x < -180) x1 += 360;
        if (x2 - x > 180) x2 -= 360; else if (x2 - x < -180) x2 += 360;

        const ax = (x1 - x) * kx, ay = (y1 - lat) * ky;
        const bx = (x2 - x) * kx, by = (y2 - lat) * ky;
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + t * dx, py = ay + t * dy;
        const d = Math.sqrt(px * px + py * py);
        if (d < best.dist) {
          best = { dist: d, dedans: false, pt: [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t] };
        }
      }
    }
    return best;
  }

  /* Un clic tombé SUR L'EAU à moins de ça est rattaché à la côte la plus
     proche. Ce n'est pas une marge de tolérance déguisée — un clic dans un
     autre pays reste faux, même à 2 km. C'est la correction d'un défaut de la
     donnée : Natural Earth place Lisbonne, Venise, Stockholm et Copenhague
     dans l'eau (estuaires, lagunes, détroits). Sans cette règle, cliquer
     pile sur Lisbonne pour le Portugal répondrait « tu as cliqué en mer ».
     20 km, c'est moins d'un pixel à l'échelle d'un continent. */
  const MARGE_COTE_KM = 20;

  /* Pays le plus proche d'un clic tombé sur l'eau, dans la limite donnée.
     Sert à l'aperçu de sélection, pour qu'il montre exactement ce que la
     notation retiendra. */
  function paysLePlusProche(lng, lat, maxKm) {
    const x = normLng(lng);
    const d = maxKm / 100 + 0.1;
    let meilleur = null;
    for (const iso of Object.keys(BORDS)) {
      const b = BBOX[iso];
      if (x < b[0] - d || x > b[2] + d || lat < b[1] - d || lat > b[3] + d) continue;
      const r = distanceAuPays(lng, lat, iso);
      if (r && r.dist <= maxKm && (!meilleur || r.dist < meilleur.dist)) {
        meilleur = { iso, dist: r.dist };
      }
    }
    return meilleur;
  }

  /* Un autre pays est-il plus proche du clic que celui visé ? Sert à ne pas
     offrir un clic en mer à un pays quand le voisin est plus près. */
  function unAutrePaysPlusProche(lng, lat, distCible, isoCible) {
    const x = normLng(lng);
    const d = 0.4; // ~40 km de marge sur la boîte englobante
    for (const iso of Object.keys(BORDS)) {
      if (iso === isoCible) continue;
      const b = BBOX[iso];
      if (x < b[0] - d || x > b[2] + d || lat < b[1] - d || lat > b[3] + d) continue;
      const r = distanceAuPays(lng, lat, iso);
      if (r && r.dist < distCible) return true;
    }
    return false;
  }

  // Distance orthodromique, utilisée pour le repli sans contour.
  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    let dLng = normLng(lng2 - lng1);
    const dLat = rad(lat2 - lat1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(dLng) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function ancrePlusProche(lat, lng, pays) {
    const points = [[pays.lat, pays.lng]].concat(pays.pts || []);
    let best = null;
    for (const [la, ln] of points) {
      const d = distanceKm(lat, lng, la, ln);
      if (!best || d < best.dist) best = { dist: d, lat: la, lng: ln };
    }
    return best;
  }

  // ============================================================
  //  Gestion des écrans
  // ============================================================

  const ECRANS = ["module", "mode", "explore", "players", "continent", "difficulty",
                  "pass", "capital", "flag", "map", "review", "end", "board"];

  function showScreen(id) {
    // Quitter une étape chronométrée doit arrêter le compte à rebours, sinon
    // il continuerait de tourner et validerait un échec sur un autre écran.
    if (!["capital", "flag", "map"].includes(id)) arreterChrono();
    ECRANS.forEach((e) => $("screen-" + e).classList.toggle("hidden", e !== id));
    $("screen-" + id).scrollTop = 0;
    if (id === "map") rafraichirCarte(quizMap);
    if (id === "review") rafraichirCarte(revMap);
    if (id === "explore") rafraichirCarte(exploreMap);
  }

  // ============================================================
  //  Chronomètre
  // ============================================================

  let chronoActif = false;
  let chronoDuree = 10;
  let chronoId = null;

  function arreterChrono() {
    if (chronoId) { clearTimeout(chronoId); chronoId = null; }
    ["chronoBar1", "chronoBar2", "chronoBar3"].forEach((id) => $(id).classList.add("hidden"));
  }

  /* Un compte à rebours par ÉTAPE, pas par pays : sinon écrire une capitale
     mangerait le temps de la question suivante.
     Le tic tourne sur setTimeout et non requestAnimationFrame : rAF est gelé
     dès que l'onglet passe en arrière-plan, la barre resterait figée. */
  function lancerChrono(idBarre, surExpiration) {
    arreterChrono();
    // Curseur à 0 : l'utilisateur a laissé l'interrupteur mais retiré la
    // limite. On ne lance rien plutôt que d'échouer instantanément.
    if (!chronoActif || chronoDuree <= 0) return;

    const boite = $(idBarre);
    const jauge = boite.firstElementChild;
    boite.classList.remove("hidden");
    jauge.classList.remove("presse");

    const duree = chronoDuree * 1000;
    const fin = performance.now() + duree;
    const tic = () => {
      const reste = Math.max(0, fin - performance.now());
      jauge.style.width = ((reste / duree) * 100).toFixed(1) + "%";
      jauge.classList.toggle("presse", reste < duree * 0.25);
      if (reste <= 0) { arreterChrono(); surExpiration(); return; }
      chronoId = setTimeout(tic, 80);
    };
    tic();
  }

  function rafraichirCarte(map) {
    if (!map) return;
    map.invalidateSize();
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 200);
  }

  // ============================================================
  //  État de la partie
  // ============================================================

  let partie = null;
  let tour = null;
  let modeChoisi = "solo";
  let nbJoueurs = 2;
  let nbQuestions = 10;            // multijoueur : réglable sur l'écran des joueurs
  let nomsJoueurs = Array.from({ length: 8 }, (_, i) => `Joueur ${i + 1}`);
  let contChoisi = null;

  const joueurCourant = () => partie.joueurs[partie.jIdx];

  function poolPays(contId, maxLvl) {
    const tous = DATA.pays[contId];
    let lvl = maxLvl;
    let pool = tous.filter((p) => p.lvl <= lvl);
    // L'Océanie n'a que 2 pays de niveau 1 : on élargit plutôt que de faire
    // tourner la même question en boucle.
    while (pool.length < 8 && lvl < 3) {
      lvl++;
      pool = tous.filter((p) => p.lvl <= lvl);
    }
    return pool;
  }

  /* Construit la manche : les mêmes pays ET les mêmes grilles de drapeaux
     pour tout le monde, sinon le multijoueur ne serait pas équitable. */
  function construireManche(cont, diff) {
    const pool = poolPays(cont.id, diff.maxLvl);
    const voulu = nbQuestions;
    // Sans ce plafond, demander 20 questions sur un continent qui n'a que
    // 14 pays reposerait forcément la même question.
    const tirage = shuffle(pool).slice(0, Math.min(voulu, pool.length));
    return tirage.map((pays) => ({ pays, options: optionsDrapeaux(pays, pool, diff) }));
  }

  function nouvellePartie(cont, diff, manche) {
    partie = {
      mode: modeChoisi, cont, diff,
      manche: manche || construireManche(cont, diff),
      joueurs: (modeChoisi === "solo" ? ["Toi"] : nomsJoueurs.slice(0, nbJoueurs))
        .map((nom) => ({ nom, score: 0, resultats: [] })),
      jIdx: 0, idx: 0,
    };
    if (partie.mode === "multi") passerLaMain();
    else demarrerTour();
  }

  /* Multijoueur : on tourne QUESTION par question, pas joueur par joueur.
     Tout le monde répond au pays n°1, puis tout le monde au pays n°2, etc.
     Personne n'attend donc que le voisin ait fini sa manche entière. */
  function passerLaMain() {
    $("passName").textContent = joueurCourant().nom;
    $("passSub").textContent =
      `Question ${partie.idx + 1} sur ${partie.manche.length} · ` +
      `joueur ${partie.jIdx + 1} sur ${partie.joueurs.length}`;
    showScreen("pass");
  }

  $("passStart").addEventListener("click", demarrerTour);

  function demarrerTour() {
    const q = partie.manche[partie.idx];
    tour = {
      pays: q.pays,
      options: q.options,
      capitale: { saisie: "", ok: false, fautes: null, marge: null },
      drapeau: { choix: null, ok: false },
      carte: { latlng: null, dist: null, ok: false },
    };

    // Précharge les 6 drapeaux pendant que le joueur tape la capitale.
    tour.options.forEach((p) => { new Image().src = flagUrl(p.iso, 320); });

    majEntetes();
    $("capitalCountry").textContent = q.pays.n;
    $("capitalInput").value = "";
    showScreen("capital");
    $("capitalInput").focus();
    lancerChrono("chronoBar1", () => validerCapitale(""));
  }

  function majEntetes() {
    const txt = `${partie.idx + 1}/${partie.manche.length}`;
    ["progressCapital", "progressFlag", "progressMap"].forEach((id) => { $(id).textContent = txt; });

    const prefixe = partie.mode === "multi" ? `${joueurCourant().nom} · ` : "";
    $("titleCapital").textContent = prefixe + "Étape 1/3 · Capitale";
    $("titleFlag").textContent = prefixe + "Étape 2/3 · Drapeau";
    $("titleMap").textContent = prefixe + "Étape 3/3 · Carte";

    const base = partie.idx / partie.manche.length;
    const pas = 1 / partie.manche.length / 3;
    $("progressBar1").style.width = ((base + pas) * 100).toFixed(1) + "%";
    $("progressBar2").style.width = ((base + pas * 2) * 100).toFixed(1) + "%";
    $("progressBar3").style.width = ((base + pas * 3) * 100).toFixed(1) + "%";
  }

  /* Leurres de drapeaux : ressemblants en Difficile (même « famille » :
     nordiques, panafricains, tricolores…), volontairement différents en
     Facile — et toujours du même continent que la bonne réponse. */
  function optionsDrapeaux(cible, pool, diff) {
    // Les leurres viennent TOUJOURS du continent du pays demandé, jamais
    // d'ailleurs : un drapeau africain glissé dans une question sur l'Asie
    // s'éliminait d'un coup d'œil, sans rien connaître.
    // On pioche dans tout le continent, pas seulement dans les pays du niveau
    // choisi, sinon en Facile il n'y aurait pas assez de candidats.
    const cands = DATA.pays[cible.cont].filter((p) => p.iso !== cible.iso);
    const notes = cands.map((p) => {
      let s = Math.random();
      if (cible.f && p.f === cible.f) {
        s += diff.leurres === "proches" ? 2 : diff.leurres === "differents" ? -2 : 0;
      }
      if (diff.leurres === "proches" && p.lvl === cible.lvl) s += 0.3;
      return { p, s };
    });
    notes.sort((a, b) => b.s - a.s);
    return shuffle(notes.slice(0, FLAG_CHOICES - 1).map((x) => x.p).concat(cible));
  }

  // ============================================================
  //  Étape 1 — la capitale
  // ============================================================

  $("capitalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    validerCapitale($("capitalInput").value);
  });
  $("capitalSkip").addEventListener("click", () => validerCapitale(""));

  function validerCapitale(saisie) {
    $("capitalInput").blur();
    const j = jugerCapitale(saisie, tour.pays, partie.diff);
    tour.capitale = { saisie: saisie.trim(), ok: j.ok, fautes: j.fautes, marge: j.marge, autre: j.autre };
    afficherDrapeaux();
  }

  // ============================================================
  //  Étape 2 — le drapeau
  // ============================================================

  function afficherDrapeaux() {
    $("flagCountry").textContent = tour.pays.n;
    const grille = $("flagGrid");
    grille.innerHTML = "";

    tour.options.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "flag-btn";
      btn.setAttribute("aria-label", "Drapeau " + p.iso.toUpperCase());

      const img = document.createElement("img");
      img.src = flagUrl(p.iso, 320);
      img.alt = "";
      img.loading = "eager";
      img.addEventListener("error", () => {
        img.remove();
        const f = document.createElement("span");
        f.className = "fallback";
        f.textContent = p.iso.toUpperCase();
        btn.appendChild(f);
      });

      btn.appendChild(img);
      btn.addEventListener("click", () => validerDrapeau(p));
      grille.appendChild(btn);
    });

    showScreen("flag");
    lancerChrono("chronoBar2", () => validerDrapeau(null));
  }

  $("flagSkip").addEventListener("click", () => validerDrapeau(null));

  function validerDrapeau(choix) {
    tour.drapeau.choix = choix;
    tour.drapeau.ok = !!choix && choix.iso === tour.pays.iso;
    afficherCarte();
  }

  // ============================================================
  //  Étape 3 — la carte
  // ============================================================

  let quizMap = null, quizSel = null, quizFond = null;
  let revMap = null, revCouches = null, revFond = null, revEtiq = null;

  const paysParIso = {};
  TOUS.forEach((p) => { paysParIso[p.iso] = p; });

  // ============================================================
  //  Module France — données
  // ============================================================

  const FR = window.GEO_FRANCE || null;
  const BORDS_FR = window.GEO_BORDERS_FR || null;

  /* Point de référence d'un département, garanti DANS son contour.
     On prend le centre de la boîte du plus gros morceau ; s'il tombe dehors
     (départements en croissant, littoraux découpés), on balaie une grille et
     on retient le point intérieur le plus éloigné des bords.
     Calculé ici plutôt que saisi à la main : 101 couples de coordonnées écrits
     au clavier seraient plus longs à produire et moins sûrs. */
  function pointInterieur(multi) {
    let boite = null, meilleureAire = -1;
    multi.forEach((poly) => {
      let x1 = 180, x2 = -180, y1 = 90, y2 = -90;
      poly[0].forEach(([x, y]) => {
        x1 = Math.min(x1, x); x2 = Math.max(x2, x);
        y1 = Math.min(y1, y); y2 = Math.max(y2, y);
      });
      const aire = (x2 - x1) * (y2 - y1);
      if (aire > meilleureAire) { meilleureAire = aire; boite = [x1, y1, x2, y2]; }
    });
    const cx = (boite[0] + boite[2]) / 2, cy = (boite[1] + boite[3]) / 2;
    if (dansMulti(cx, cy, multi)) return { lat: cy, lng: cx };

    let meilleur = null, meilleureMarge = -1;
    const N = 25;
    for (let i = 1; i < N; i++) {
      for (let j = 1; j < N; j++) {
        const x = boite[0] + ((boite[2] - boite[0]) * i) / N;
        const y = boite[1] + ((boite[3] - boite[1]) * j) / N;
        if (!dansMulti(x, y, multi)) continue;
        const marge = Math.min(x - boite[0], boite[2] - x, y - boite[1], boite[3] - y);
        if (marge > meilleureMarge) { meilleureMarge = marge; meilleur = { lat: y, lng: x }; }
      }
    }
    return meilleur || { lat: cy, lng: cx };
  }

  if (FR && BORDS_FR) {
    FR.departements.forEach((d) => {
      const pt = pointInterieur(BORDS_FR[d.num]);
      d.lat = pt.lat;
      d.lng = pt.lng;
    });
  }

  /* Point d'accroche d'une étiquette : le centre du PLUS GROS morceau du pays,
     jamais le centre de sa boîte englobante. Les États-Unis vont des Aléoutiennes
     à la Floride en traversant l'antiméridien : le centre de leur boîte tombait
     au milieu de l'Atlantique, et « États-Unis » s'écrivait sur la France.
     Même problème pour la Russie, et pour la France avec la Guyane. */
  const ANCRE_ETIQ = {};
  Object.keys(BORDS).forEach((iso) => {
    // Largeur du plus gros morceau : sert uniquement à décider si le pays est
    // assez grand à l'écran pour mériter une étiquette.
    let largeur = 0;
    BORDS[iso].forEach((poly) => {
      let x1 = 180, x2 = -180;
      poly[0].forEach(([x]) => { x1 = Math.min(x1, x); x2 = Math.max(x2, x); });
      largeur = Math.max(largeur, x2 - x1);
    });
    // Position : le point de référence saisi à la main dans countries.js.
    // Un centre géométrique tombe hors du pays dès qu'il est courbe ou étiré
    // (Vietnam, Norvège, Japon) ; le point choisi à la main, lui, est dedans.
    const p = paysParIso[iso];
    ANCRE_ETIQ[iso] = { lat: p.lat, lng: p.lng, largeur };
  });

  /* Étiquettes des pays, dessinées par nos soins puisqu'il n'y a plus de
     tuiles. On n'affiche que les pays assez larges à l'écran (sinon les noms
     se chevauchent) et seulement ceux réellement dans la vue. */
  function majEtiquettes(map, cont, groupe, avecCapitale) {
    groupe.clearLayers();
    const vue = map.getBounds();
    const ouest = cont.bounds[0][1], est = cont.bounds[1][1];
    const pxParDegre = (256 * Math.pow(2, map.getZoom())) / 360;
    Object.keys(BORDS).forEach((iso) => {
      const p = paysParIso[iso];
      if (!p) return;
      const a = ANCRE_ETIQ[iso];
      if (a.largeur * pxParDegre < 46) return;
      const centre = L.latLng(a.lat, lngDansFenetre(a.lng, ouest, est));
      if (!vue.contains(centre)) return;
      const contenu = avecCapitale
        ? `<b>${echapper(p.n)}</b><i>${echapper(p.c)}</i>`
        : `<b>${echapper(p.n)}</b>`;
      L.tooltip({ permanent: true, direction: "center", className: "etiquette-pays", opacity: 1 })
        .setLatLng(centre).setContent(contenu).addTo(groupe);
    });
  }

  /* ---------- Fond de carte dessiné ----------
     Plus aucune tuile : on trace nous-mêmes les contours déjà chargés.
     Les tuiles étaient des images toutes faites, avec les limites régionales,
     les routes et les zones urbaines cuites dans le pixel — impossible de les
     retirer, alors qu'on ne veut QUE les frontières. Les dessiner nous-mêmes
     donne en prime une carte sombre assortie à l'app, nette à tous les zooms,
     et disponible dès le premier lancement sans réseau.
     Rendu en canvas : 189 pays en SVG, le défilement devient poussif. */
  const STYLE_TERRE = {
    color: "#46586f", weight: 1, fillColor: "#1b2534", fillOpacity: 1,
  };

  const cacheFond = {};

  /* Le cache est indexé par (usage, continent) et pas seulement par continent :
     une couche Leaflet n'appartient qu'à UNE carte à la fois. Partager la même
     instance entre la carte de question et celle de correction la faisait
     sauter de l'une à l'autre — d'où des corrections affichées au mauvais
     endroit du globe. */
  function fondDeCarte(cont, usage) {
    const cle = usage + ":" + cont.id;
    if (cacheFond[cle]) return cacheFond[cle];
    const traits = Object.keys(BORDS).map((iso) => ({
      type: "Feature",
      properties: { iso },
      geometry: { type: "MultiPolygon", coordinates: coordsFenetre(BORDS[iso], cont) },
    }));
    cacheFond[cle] = L.geoJSON(
      { type: "FeatureCollection", features: traits },
      { style: STYLE_TERRE, interactive: false, renderer: L.canvas({ padding: 0.3 }) }
    );
    return cacheFond[cle];
  }

  function pin(classe) {
    return L.divIcon({
      className: "", html: `<div class="pin ${classe}"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
  }

  // Recale un jeu de coordonnées dans la fenêtre du continent affiché.
  function coordsFenetre(multi, cont) {
    const ouest = cont.bounds[0][1], est = cont.bounds[1][1];
    return multi.map((poly) => poly.map((anneau) =>
      anneau.map(([x, y]) => [lngDansFenetre(x, ouest, est), y])));
  }

  function afficherCarte() {
    $("mapCountry").textContent = tour.pays.n;
    $("mapValidate").disabled = true;
    $("mapHint").textContent = "Touche le pays. Pince pour zoomer.";
    // En « Monde entier », on annonce le continent affiché : la carte se cadre
    // dessus, autant l'assumer plutôt que de laisser deviner.
    $("mapContinent").textContent =
      partie.cont.id === "monde" ? `${contEffectif().emoji} ${contEffectif().nom}` : "";

    if (!LEAFLET_OK) {
      $("mapHint").textContent = "Carte indisponible (hors-ligne au premier lancement).";
      tour.carte = { latlng: null, dist: null, ok: false, indispo: true };
      showScreen("map");
      setTimeout(afficherCorrection, 600);
      return;
    }

    if (!quizMap) {
      // Carte FIGÉE : tout le continent est visible, on ne peut ni déplacer
      // ni zoomer, on clique. zoomSnap:0 autorise un zoom fractionnaire, donc
      // le continent remplit exactement le cadre au lieu de laisser des marges.
      /* Zoom et déplacement autorisés, mais BORNÉS (voir cadrerQuiz) : on ne
         peut ni dézoomer sous la vue du continent, ni sortir de ce cadre.
         C'est ce qui règle le reproche d'origine — la carte libre où on se
         perdait — tout en rendant les petits pays atteignables, ce qui est
         devenu indispensable depuis que la validation est binaire.
         Le double-tap reste désactivé : il entrerait en conflit avec le tap
         qui sélectionne un pays. */
      quizMap = L.map("quizMap", {
        zoomControl: false, dragging: true, touchZoom: true,
        scrollWheelZoom: true, doubleClickZoom: false, boxZoom: false,
        keyboard: false, worldCopyJump: false, zoomSnap: 0,
        maxBoundsViscosity: 1,
      });
      L.control.zoom({ position: "topright", zoomInTitle: "Zoomer", zoomOutTitle: "Dézoomer" })
        .addTo(quizMap);
      controleVueEnsemble().addTo(quizMap);
      quizSel = L.layerGroup().addTo(quizMap);
      quizMap.on("click", (e) => {
        tour.carte.latlng = e.latlng;
        montrerSelection(e.latlng);
        $("mapValidate").disabled = false;
      });
    }

    quizSel.clearLayers();

    // Le fond dépend du continent affiché (les longitudes sont recalées dans
    // sa fenêtre), donc on échange la couche à chaque question.
    const fond = fondDeCarte(contEffectif(), "quiz");
    if (quizFond !== fond) {
      if (quizFond) quizMap.removeLayer(quizFond);
      fond.addTo(quizMap);
      fond.bringToBack();
      quizFond = fond;
    }

    showScreen("map");

    // fitBounds n'est fiable qu'une fois le conteneur dimensionné. On cadre
    // tout de suite puis à nouveau après un court délai : requestAnimationFrame
    // ne se déclenche pas dans un onglet en arrière-plan, et un cadrage jamais
    // appliqué donne une carte grise, sans aucune tuile.
    cadrerQuiz();
    setTimeout(cadrerQuiz, 180);
    lancerChrono("chronoBar3", () => {
      tour.carte = { latlng: null, dist: null, ok: false };
      afficherCorrection();
    });
  }

  /* Bouton « vue d'ensemble » : sans lui, un joueur zoomé sur un coin n'a
     aucun moyen évident de revenir au continent entier. */
  function controleVueEnsemble() {
    const Ctrl = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const boite = L.DomUtil.create("div", "leaflet-bar vue-ensemble");
        const a = L.DomUtil.create("a", "", boite);
        a.href = "#";
        a.textContent = "⤢";
        a.title = "Revenir à la vue d'ensemble";
        a.setAttribute("role", "button");
        a.setAttribute("aria-label", "Revenir à la vue d'ensemble");
        L.DomEvent.on(a, "click", (e) => { L.DomEvent.stop(e); cadrerQuiz(); });
        L.DomEvent.disableClickPropagation(boite);
        return boite;
      },
    });
    return new Ctrl();
  }

  /* Proportions du continent une fois projeté (largeur / hauteur à l'écran). */
  function formeContinent(cont) {
    const [[sud, ouest], [nord, est]] = cont.bounds;
    const a = L.CRS.EPSG3857.latLngToPoint(L.latLng(nord, ouest), 8);
    const b = L.CRS.EPSG3857.latLngToPoint(L.latLng(sud, est), 8);
    return Math.abs(b.x - a.x) / Math.abs(b.y - a.y);
  }

  /* La carte prend la FORME du continent affiché avant d'être cadrée.
     fitBounds garantit que tout le continent est visible, mais si le cadre
     est plus large que le continent, il comble le vide en longitude : sur une
     fenêtre courte, demander l'Asie affichait 167° au lieu de 120°, donc
     l'Europe et l'Afrique en prime, et l'Asie deux fois plus petite.
     En ajustant la largeur, le continent remplit exactement le cadre. */
  function cadrerQuiz() {
    const cont = contEffectif();
    const el = $("quizMap");
    // Remettre AUSSI les marges : `margin: auto` annule l'étirement du
    // conteneur flex, donc mesurer sans les enlever renvoyait la largeur du
    // contenu — c'est-à-dire zéro — et la carte restait large de 1 pixel.
    el.style.width = "";
    el.style.marginLeft = "";
    el.style.marginRight = "";
    const r = el.getBoundingClientRect();
    if (r.height > 0) {
      const large = Math.min(r.width, Math.max(200, r.height * formeContinent(cont)));
      el.style.width = Math.round(large) + "px";
      el.style.marginLeft = "auto";
      el.style.marginRight = "auto";
    }
    quizMap.invalidateSize();
    // On desserre les bornes avant de recadrer, sinon les limites de la
    // question précédente empêcheraient le nouveau cadrage.
    quizMap.setMinZoom(0);
    quizMap.setMaxZoom(20);
    quizMap.setMaxBounds(null);
    // `animate: false` est indispensable : un fitBounds animé n'applique le
    // nouveau zoom qu'à la fin de l'animation, or on le relit juste après pour
    // en déduire les bornes. Avec l'animation, le bouton « vue d'ensemble »
    // recalculait les limites à partir du zoom courant et restait bloqué au
    // niveau où on se trouvait.
    quizMap.fitBounds(L.latLngBounds(cont.bounds), { padding: [2, 2], animate: false });

    // Bornes du zoom : on ne dézoome jamais sous la vue du continent, et on
    // s'arrête avant que le fond de carte ne se couvre de routes.
    const z = quizMap.getZoom();
    quizMap.setMinZoom(z);
    quizMap.setMaxZoom(z + 3.5);
    // Le garde-fou de déplacement est EXACTEMENT la vue obtenue : impossible
    // de dériver, et aucun conflit avec le cadrage qu'on vient de poser.
    quizMap.setMaxBounds(quizMap.getBounds().pad(0.02));
  }

  // Rotation du téléphone ou fenêtre redimensionnée : il faut recadrer,
  // sinon la carte garde la largeur calculée pour l'ancienne forme d'écran.
  let minuteurRedim = null;
  window.addEventListener("resize", () => {
    if ($("screen-map").classList.contains("hidden") || !quizMap) return;
    clearTimeout(minuteurRedim);
    minuteurRedim = setTimeout(cadrerQuiz, 150);
  });

  /* Retour visuel du clic : on colorie en entier le pays touché, plutôt que
     de poser un point. Le joueur voit donc exactement ce qu'il s'apprête à
     valider — sur la carte muette, un point ne disait rien.
     Le nom du pays n'est évidemment jamais affiché ici. */
  function montrerSelection(latlng) {
    quizSel.clearLayers();
    let iso = paysSous(latlng.lng, latlng.lat);
    let auLarge = false;

    // Tombé sur l'eau : on désigne la côte la plus proche, exactement comme
    // le fera la notation. Sans ça, cliquer sur Monaco ou sur un estuaire
    // affichait « tu as touché la mer » alors que le clic allait être compté
    // bon — l'aperçu doit dire la vérité.
    if (!iso) {
      const proche = paysLePlusProche(latlng.lng, latlng.lat, MARGE_COTE_KM);
      if (proche) { iso = proche.iso; auLarge = true; }
    }

    if (!iso) {
      L.marker(latlng, { icon: pin("user") }).addTo(quizSel);
      $("mapHint").textContent = "Tu es en pleine mer. Re-clique pour changer.";
      return;
    }

    const coords = coordsFenetre(BORDS[iso], contEffectif());
    L.geoJSON(
      { type: "Feature", geometry: { type: "MultiPolygon", coordinates: coords } },
      { style: { color: "#0f7a4f", weight: 2, fillColor: "#3ddc97", fillOpacity: 0.55 },
        interactive: false }
    ).addTo(quizSel);

    // Un micro-État colorié reste invisible : on le cercle pour qu'on sache
    // qu'on l'a bien attrapé.
    const bb = BBOX[iso];
    if (Math.max(bb[2] - bb[0], bb[3] - bb[1]) < 3) {
      L.circleMarker(latlng, {
        radius: 10, color: "#0f7a4f", weight: 3,
        fillColor: "#3ddc97", fillOpacity: 0.35, interactive: false,
      }).addTo(quizSel);
    }
    $("mapHint").textContent = auLarge
      ? "Au large : c'est la côte la plus proche qui compte. Re-clique pour changer."
      : "Pays sélectionné. Re-clique pour changer.";
  }

  $("mapValidate").addEventListener("click", () => {
    if (!tour.carte.latlng) return;
    const p = tour.pays;
    const ll = tour.carte.latlng;

    const res = distanceAuPays(ll.lng, ll.lat, p.iso);
    if (res) {
      tour.carte.dist = res.dist;
      tour.carte.dedans = res.dedans;
      tour.carte.ptBord = res.pt;
      tour.carte.paysClique = res.dedans ? p.iso : paysSous(ll.lng, ll.lat);
    } else {
      // Repli si le contour manque (n'arrive plus : les 189 en ont un).
      const a = ancrePlusProche(ll.lat, ll.lng, p);
      tour.carte.dist = a.dist;
      tour.carte.dedans = a.dist === 0;
      tour.carte.ptBord = [a.lng, a.lat];
      tour.carte.paysClique = null;
    }

    // Dans le pays : bon. Dans un AUTRE pays : faux, même à 2 km.
    // Sur l'eau au ras de la côte du bon pays : bon (voir MARGE_COTE_KM).
    tour.carte.cote = !tour.carte.dedans &&
      tour.carte.paysClique === null &&
      tour.carte.dist <= MARGE_COTE_KM &&
      !unAutrePaysPlusProche(ll.lng, ll.lat, tour.carte.dist, p.iso);
    tour.carte.ok = tour.carte.dedans || tour.carte.cote;
    afficherCorrection();
  });

  $("mapSkip").addEventListener("click", () => {
    tour.carte = { latlng: null, dist: null, ok: false };
    afficherCorrection();
  });

  // ============================================================
  //  Écran de correction
  // ============================================================

  function afficherCorrection() {
    const p = tour.pays;
    const j = joueurCourant();
    const points = (tour.capitale.ok ? 1 : 0) + (tour.drapeau.ok ? 1 : 0) + (tour.carte.ok ? 1 : 0);
    j.score += points;

    const noteCapitale = texteNoteCapitale();
    const noteCarte = texteNoteCarte();

    j.resultats.push({
      pays: p.n, iso: p.iso, capitaleVraie: p.c,
      capitale: tour.capitale.ok, capitaleSaisie: tour.capitale.saisie, noteCapitale,
      drapeau: tour.drapeau.ok,
      drapeauChoisiIso: tour.drapeau.choix ? tour.drapeau.choix.iso : null,
      drapeauChoisiNom: tour.drapeau.choix ? tour.drapeau.choix.n : null,
      carte: tour.carte.ok, noteCarte,
    });

    $("reviewCountry").textContent = p.n;
    $("reviewScore").textContent = `+${points}/3`;

    // --- Capitale ---
    $("cardCapital").className = "card " + (tour.capitale.ok ? "ok" : "ko");
    $("capitalVerdict").textContent = tour.capitale.ok ? "✅" : "❌";
    const donnee = $("capitalGiven");
    donnee.textContent = tour.capitale.saisie || "Pas de réponse";
    donnee.className = "compare-value" + (tour.capitale.saisie ? "" : " empty");
    $("capitalTruth").textContent = p.c;
    $("capitalNote").textContent = noteCapitale;

    // --- Drapeau ---
    $("cardFlag").className = "card " + (tour.drapeau.ok ? "ok" : "ko");
    $("flagVerdict").textContent = tour.drapeau.ok ? "✅" : "❌";
    remplirSlot($("flagGiven"), tour.drapeau.choix);
    remplirSlot($("flagTruth"), p);
    $("flagGivenName").textContent = tour.drapeau.choix ? tour.drapeau.choix.n : "—";
    $("flagTruthName").textContent = p.n;

    // --- Carte ---
    const indispo = !!tour.carte.indispo;
    $("cardMap").className = "card " + (tour.carte.ok ? "ok" : indispo ? "" : "ko");
    $("mapVerdict").textContent = indispo ? "—" : tour.carte.ok ? "✅" : "❌";
    $("mapDistance").textContent = texteDistance();
    $("mapDistance").className = "distance " + (indispo ? "" : tour.carte.ok ? "ok" : "ko");
    $("mapNote").textContent = noteCarte;

    $("nextCountry").textContent = texteBoutonSuivant();

    showScreen("review");
    dessinerCorrectionCarte();
  }

  function texteNoteCapitale() {
    const c = tour.capitale;
    if (c.fautes === null) return "";
    // Sans ça, répondre « La Paz » pour la Bolivie affichait une coche verte
    // au-dessus de « Bonne réponse : Sucre » — on avait l'air de se tromper
    // tout en ayant juste.
    if (c.ok && c.autre) {
      return `« ${c.autre} » compte aussi pour ce pays.`;
    }
    if (c.ok && c.fautes > 0) {
      return `Accepté : ${c.fautes} faute${c.fautes > 1 ? "s" : ""} de frappe, ` +
             `la marge en ${partie.diff.nom} est de ${c.marge}.`;
    }
    if (!c.ok && c.fautes <= 3) {
      return c.marge === 0
        ? `Tout près : ${c.fautes} faute${c.fautes > 1 ? "s" : ""}, mais en ${partie.diff.nom} l'orthographe doit être exacte.`
        : `Tout près : ${c.fautes} fautes, la marge en ${partie.diff.nom} est de ${c.marge}.`;
    }
    return "";
  }

  function texteDistance() {
    const c = tour.carte;
    if (c.indispo) return "Étape passée (carte indisponible).";
    if (!c.latlng) return "Pas de réponse.";
    if (c.dedans) return "Dans le pays 🎯";
    if (c.cote) return "Sur la côte du pays 🎯";
    return `Raté — à ${formatDistance(c.dist)} de la frontière`;
  }

  function texteNoteCarte() {
    const c = tour.carte;
    if (c.indispo || !c.latlng) return "";
    if (c.dedans) return "";
    if (c.cote) return `Tombé sur l'eau à ${formatDistance(c.dist)} de la côte — compté bon.`;
    return c.paysClique && c.paysClique !== tour.pays.iso
      ? `Tu as cliqué sur : ${nomParIso[c.paysClique] || c.paysClique.toUpperCase()}.`
      : c.paysClique ? "" : "Tu as cliqué en mer.";
  }

  function remplirSlot(slot, pays) {
    slot.innerHTML = "";
    if (!pays) {
      const s = document.createElement("span");
      s.className = "none";
      s.textContent = "Aucun choix";
      slot.appendChild(s);
      return;
    }
    const img = document.createElement("img");
    img.src = flagUrl(pays.iso, 320);
    img.alt = pays.n;
    img.addEventListener("error", () => {
      img.remove();
      const s = document.createElement("span");
      s.className = "none";
      s.textContent = pays.iso.toUpperCase();
      slot.appendChild(s);
    });
    slot.appendChild(img);
  }

  function dessinerCorrectionCarte() {
    if (!LEAFLET_OK) { $("reviewMap").style.display = "none"; return; }

    if (!revMap) {
      // Ici les NOMS sont affichés et la carte se manipule : c'est le moment
      // où on apprend, il faut pouvoir zoomer et se promener.
      revMap = L.map("reviewMap", {
        zoomControl: true, attributionControl: false, worldCopyJump: false,
      });
      revEtiq = L.layerGroup().addTo(revMap);
      revCouches = L.layerGroup().addTo(revMap);
      // Les noms sont recalculés à chaque déplacement : n'afficher que ce qui
      // tient à l'écran évite la bouillie de texte quand on dézoome.
      revMap.on("zoomend moveend", () => {
        majEtiquettes(revMap, contEffectif(), revEtiq, false);
      });
    }
    revCouches.clearLayers();

    const fondRev = fondDeCarte(contEffectif(), "review");
    if (revFond !== fondRev) {
      if (revFond) revMap.removeLayer(revFond);
      fondRev.addTo(revMap);
      fondRev.bringToBack();
      revFond = fondRev;
    }

    const p = tour.pays;
    const cont = contEffectif();
    let bounds = null;

    // Le bon pays, colorié en vert.
    if (BORDS[p.iso]) {
      const coords = coordsFenetre(BORDS[p.iso], cont);
      L.geoJSON(
        { type: "Feature", geometry: { type: "MultiPolygon", coordinates: coords } },
        { style: { color: "#0f7a4f", weight: 2, fillColor: "#3ddc97", fillOpacity: 0.45 } }
      ).addTo(revCouches);

      // Cadrage sur le plus GROS morceau du pays, pas sur l'ensemble : sinon
      // la pointe des Aléoutiennes ou une île lointaine ferait dézoomer sur
      // le monde entier pour montrer les États-Unis.
      const principal = coords.reduce((a, b) => (b[0].length > a[0].length ? b : a));
      bounds = L.latLngBounds(principal[0].map(([x, y]) => [y, x]));

      // Un pays minuscule ne se voit pas, même colorié : on ajoute une pastille.
      const bb = BBOX[p.iso];
      if (Math.max(bb[2] - bb[0], bb[3] - bb[1]) < 3) {
        L.circleMarker(bounds.getCenter(), {
          radius: 11, color: "#0f7a4f", weight: 3, fillColor: "#3ddc97", fillOpacity: 0.5,
        }).addTo(revCouches);
      }
    } else {
      const a = L.latLng(p.lat, lngDansFenetre(p.lng, cont.bounds[0][1], cont.bounds[1][1]));
      L.marker(a, { icon: pin("truth") }).addTo(revCouches);
      bounds = L.latLngBounds([a, a]);
    }

    if (tour.carte.latlng) {
      const mien = tour.carte.latlng;
      L.marker(mien, { icon: pin("user") }).addTo(revCouches);
      bounds = bounds.extend(mien);
      if (!tour.carte.dedans && tour.carte.ptBord) {
        const [bx, by] = tour.carte.ptBord;
        const cible = L.latLng(by, lngDansFenetre(bx, cont.bounds[0][1], cont.bounds[1][1]));
        L.polyline([mien, cible], {
          color: "#e03050", weight: 2.5, dashArray: "5 6", opacity: 0.95,
        }).addTo(revCouches);
      }
    }

    const cadrer = () => {
      revMap.invalidateSize();
      revMap.fitBounds(bounds.pad(0.25), { padding: [18, 18], maxZoom: 7, animate: false });
      majEtiquettes(revMap, contEffectif(), revEtiq, false);
    };
    cadrer();
    setTimeout(cadrer, 180);
  }

  $("nextCountry").addEventListener("click", () => {
    if (partie.mode === "solo") {
      partie.idx++;
      if (partie.idx >= partie.manche.length) finJoueur();
      else demarrerTour();
      return;
    }
    // Multi : joueur suivant sur la MÊME question, puis on avance d'un pays.
    if (partie.jIdx + 1 < partie.joueurs.length) {
      partie.jIdx++;
    } else {
      partie.jIdx = 0;
      partie.idx++;
      if (partie.idx >= partie.manche.length) { afficherClassement(); return; }
    }
    passerLaMain();
  });

  /* Libellé du bouton de la correction : en multi il annonce qui prend la
     main, sinon on ne sait pas s'il faut passer le téléphone. */
  function texteBoutonSuivant() {
    if (partie.mode === "solo") {
      return partie.idx + 1 >= partie.manche.length ? "Voir le résultat →" : "Pays suivant →";
    }
    if (partie.jIdx + 1 < partie.joueurs.length) {
      return `Au tour ${deNom(partie.joueurs[partie.jIdx + 1].nom)} →`;
    }
    return partie.idx + 1 >= partie.manche.length
      ? "Voir le classement 🏆"
      : `Pays suivant · au tour ${deNom(partie.joueurs[0].nom)} →`;
  }

  // ============================================================
  //  Fin de manche d'un joueur
  // ============================================================

  const cleRecord = (c, d) => `geoquiz_best_${c}_${d}`;

  function lireRecord(contId, diffId) {
    try { return JSON.parse(localStorage.getItem(cleRecord(contId, diffId))); }
    catch { return null; }
  }

  function ecrireRecord(contId, diffId, score, total) {
    try {
      const anc = lireRecord(contId, diffId);
      if (!anc || score / total > anc.score / anc.total) {
        localStorage.setItem(cleRecord(contId, diffId), JSON.stringify({ score, total }));
        return true;
      }
    } catch { /* mode privé Safari */ }
    return false;
  }

  // Écran de fin de manche : solo uniquement. En multi, la dernière question
  // du dernier joueur enchaîne directement sur le classement.
  function finJoueur() {
    const j = joueurCourant();
    const total = partie.manche.length * 3;
    const pct = j.score / total;
    const record = ecrireRecord(partie.cont.id, partie.diff.id, j.score, total);

    $("endMark").textContent = pct >= 0.9 ? "🏆" : pct >= 0.6 ? "🎉" : pct >= 0.3 ? "💪" : "🌱";
    $("endTitle").textContent = record ? "Nouveau record !" : "Manche terminée";
    $("endSub").textContent = `${partie.cont.nom} · ${partie.diff.nom}`;
    $("endScore").textContent = `${j.score}/${total}`;

    const nb = (k) => j.resultats.filter((r) => r[k]).length;
    $("endDetail").textContent =
      `🏛️ ${nb("capitale")}/${partie.manche.length}   ` +
      `🚩 ${nb("drapeau")}/${partie.manche.length}   ` +
      `📍 ${nb("carte")}/${partie.manche.length}`;

    construireRecap(j.resultats, $("endList"));
    remplirActionsFin();
    showScreen("end");
  }

  /* Récapitulatif dépliable : une ligne par pays, on touche pour voir le
     détail de ses trois réponses. */
  function construireRecap(resultats, liste) {
    liste.innerHTML = "";

    resultats.forEach((r) => {
      const bloc = document.createElement("div");
      bloc.className = "end-item";

      const row = document.createElement("button");
      row.type = "button";
      row.className = "end-row";
      row.innerHTML =
        `<span class="name">${echapper(r.pays)}</span>` +
        `<span class="marks">${r.capitale ? "✅" : "❌"}${r.drapeau ? "✅" : "❌"}${r.carte ? "✅" : "❌"}</span>` +
        `<span class="chevron">▾</span>`;

      const detail = document.createElement("div");
      detail.className = "end-detail hidden";
      detail.innerHTML =
        ligneDetail("🏛️", "Capitale", r.capitale,
          r.capitaleSaisie ? echapper(r.capitaleSaisie) : "<i>pas de réponse</i>",
          echapper(r.capitaleVraie), r.noteCapitale) +
        ligneDetail("🚩", "Drapeau", r.drapeau,
          r.drapeauChoisiNom ? echapper(r.drapeauChoisiNom) : "<i>aucun choix</i>",
          echapper(r.pays), "") +
        ligneDetail("📍", "Emplacement", r.carte, "", "", r.noteCarte || (r.carte ? "Bien placé." : ""));

      row.addEventListener("click", () => {
        const ouvert = !detail.classList.toggle("hidden");
        bloc.classList.toggle("open", ouvert);
      });

      bloc.append(row, detail);
      liste.appendChild(bloc);
    });
  }

  function ligneDetail(emo, titre, ok, donne, vrai, note) {
    let html = `<div class="detail-line"><span class="detail-ico">${emo}</span>` +
               `<div class="detail-body"><span class="detail-title">${titre} ${ok ? "✅" : "❌"}</span>`;
    if (donne || vrai) {
      html += `<span class="detail-txt">Toi : <b>${donne}</b>`;
      if (!ok && vrai) html += ` · Réponse : <b class="good">${vrai}</b>`;
      html += `</span>`;
    }
    if (note) html += `<span class="detail-note">${echapper(note)}</span>`;
    return html + `</div></div>`;
  }

  const echapper = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // « Au tour de Emma » pique les yeux : élision devant une voyelle.
  const deNom = (nom) => (/^[aeiouyàâäéèêëîïôöûüh]/i.test(nom.trim()) ? "d'" : "de ") + nom;

  function remplirActionsFin() {
    const zone = $("endActions");
    zone.innerHTML = "";
    const bouton = (txt, classe, action) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn " + classe + " block" + (classe === "primary" ? " big" : "");
      b.textContent = txt;
      b.addEventListener("click", action);
      zone.appendChild(b);
    };

    bouton("Rejouer (nouveaux pays)", "primary", () =>
      nouvellePartie(partie.cont, partie.diff));
    bouton("Rejouer la même série", "ghost", () =>
      nouvellePartie(partie.cont, partie.diff, partie.manche));
    bouton("Changer de continent", "ghost", () => showScreen("continent"));
  }

  // ============================================================
  //  Classement multijoueur
  // ============================================================

  function afficherClassement() {
    const total = partie.manche.length * 3;
    $("boardSub").textContent = `${partie.cont.nom} · ${partie.diff.nom} · ${partie.manche.length} pays`;

    const classes = partie.joueurs.slice().sort((a, b) => b.score - a.score);
    const liste = $("boardList");
    liste.innerHTML = "";

    classes.forEach((j, i) => {
      // Égalité : on partage le rang plutôt que d'inventer un ordre.
      const rang = i > 0 && classes[i - 1].score === j.score
        ? liste.lastElementChild.dataset.rang : String(i + 1);
      const medaille = rang === "1" ? "🥇" : rang === "2" ? "🥈" : rang === "3" ? "🥉" : `${rang}ᵉ`;
      const nb = (k) => j.resultats.filter((r) => r[k]).length;

      // Chaque ligne se déplie sur le détail des réponses du joueur : avec la
      // boucle question par question, plus personne ne voit d'écran de fin
      // individuel, ce récap serait perdu autrement.
      const bloc = document.createElement("div");
      bloc.className = "board-item";
      bloc.dataset.rang = rang;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "board-row" + (rang === "1" ? " winner" : "");
      row.innerHTML =
        `<span class="board-rank">${medaille}</span>` +
        `<span class="board-name">${echapper(j.nom)}</span>` +
        `<span class="board-detail">🏛️${nb("capitale")} 🚩${nb("drapeau")} 📍${nb("carte")}</span>` +
        `<span class="board-score">${j.score}<small>/${total}</small></span>` +
        `<span class="chevron">▾</span>`;

      const detail = document.createElement("div");
      detail.className = "end-list board-recap hidden";
      construireRecap(j.resultats, detail);

      row.addEventListener("click", () => {
        const ouvert = !detail.classList.toggle("hidden");
        bloc.classList.toggle("open", ouvert);
      });

      bloc.append(row, detail);
      liste.appendChild(bloc);
    });

    showScreen("board");
  }

  $("boardReplaySame").addEventListener("click", () =>
    nouvellePartie(partie.cont, partie.diff, partie.manche));
  $("boardNew").addEventListener("click", () => showScreen("mode"));

  // ============================================================
  //  Écrans d'accueil
  // ============================================================

  $("moduleMonde").addEventListener("click", () => showScreen("mode"));

  $("moduleFrance").addEventListener("click", () => {
    const n = FR ? FR.departements.length : 0;
    $("franceSub").textContent =
      `Données prêtes (${n} départements, contours et préfectures). ` +
      "Les écrans de jeu arrivent au prochain lot.";
    $("moduleFrance").classList.add("bientot");
  });

  $("modeLibre").addEventListener("click", ouvrirEntrainement);

  // Solo et multi passent désormais par le MÊME écran de réglages : le
  // chronomètre est une option de partie, il n'avait rien à faire coincé sous
  // la liste des difficultés.
  $("modeSolo").addEventListener("click", () => {
    modeChoisi = "solo";
    ouvrirReglages();
  });

  // ---------- Réglage du chronomètre ----------

  function majReglageChrono() {
    $("chronoOn").checked = chronoActif;
    $("chronoDurations").classList.toggle("hidden", !chronoActif);
    $("chronoRange").value = chronoDuree;
    $("chronoRangeVal").textContent = chronoDuree === 0 ? "∞" : chronoDuree + " s";
    $("chronoSub").textContent = !chronoActif
      ? "Désactivé — prends ton temps"
      : chronoDuree === 0
        ? "Curseur à zéro : aucune limite"
        : `${chronoDuree} s par étape · échec automatique à zéro`;
  }

  $("chronoOn").addEventListener("change", () => {
    chronoActif = $("chronoOn").checked;
    majReglageChrono();
  });

  /* Les trois réglages chiffrés passent par des curseurs : sur un téléphone
     on ajuste au pouce, et la plage complète tient sans une rangée de boutons
     par valeur possible (1 à 30 pays en aurait demandé trente). */
  $("chronoRange").addEventListener("input", () => {
    chronoDuree = +$("chronoRange").value;
    majReglageChrono();
  });

  $("playerCount").addEventListener("input", () => {
    nbJoueurs = +$("playerCount").value;
    construireReglageJoueurs();
  });

  $("questionCount").addEventListener("input", () => {
    nbQuestions = +$("questionCount").value;
    construireReglageJoueurs();
  });

  // ---------- Entraînement libre ----------

  let exploreMap = null, exploreEtiq = null, exploreFond = null, exploreSel = null;
  const CONT_MONDE = () => DATA.continents.find((c) => c.id === "monde");

  function ouvrirEntrainement() {
    showScreen("explore");

    if (!exploreMap) {
      exploreMap = L.map("exploreMap", {
        zoomControl: true, attributionControl: false,
        worldCopyJump: false, zoomSnap: 0, maxBoundsViscosity: 1,
      });
      exploreFond = fondDeCarte(CONT_MONDE(), "explore");
      exploreFond.addTo(exploreMap);
      exploreEtiq = L.layerGroup().addTo(exploreMap);
      exploreSel = L.layerGroup().addTo(exploreMap);

      exploreMap.on("zoomend moveend", majEtiquettesLibre);
      exploreMap.on("click", (e) => montrerFiche(e.latlng));
    }

    const cadrer = () => {
      exploreMap.invalidateSize();
      exploreMap.setMinZoom(0);
      exploreMap.setMaxBounds(null);
      exploreMap.fitBounds(L.latLngBounds(CONT_MONDE().bounds), { padding: [2, 2], animate: false });
      const z = exploreMap.getZoom();
      exploreMap.setMinZoom(z);
      exploreMap.setMaxZoom(z + 5);
      exploreMap.setMaxBounds(exploreMap.getBounds().pad(0.02));
      majEtiquettesLibre();
    };
    cadrer();
    setTimeout(cadrer, 180);
  }

  function majEtiquettesLibre() {
    if (!exploreMap) return;
    if (!$("explorePermanent").checked) { exploreEtiq.clearLayers(); return; }
    majEtiquettes(exploreMap, CONT_MONDE(), exploreEtiq, true);
  }

  $("explorePermanent").addEventListener("change", majEtiquettesLibre);

  /* Fiche d'un pays : nom, capitale, drapeau. Le pays touché est surligné,
     comme pendant le quiz, pour qu'on sache de qui on parle. */
  function montrerFiche(latlng) {
    let iso = paysSous(latlng.lng, latlng.lat);
    if (!iso) {
      const proche = paysLePlusProche(latlng.lng, latlng.lat, MARGE_COTE_KM);
      if (proche) iso = proche.iso;
    }
    exploreSel.clearLayers();
    if (!iso) { exploreMap.closePopup(); return; }

    const p = paysParIso[iso];
    L.geoJSON(
      { type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: coordsFenetre(BORDS[iso], CONT_MONDE()) } },
      { style: { color: "#0f7a4f", weight: 2, fillColor: "#3ddc97", fillOpacity: 0.5 },
        interactive: false }
    ).addTo(exploreSel);

    L.popup({ closeButton: true, autoPan: true, maxWidth: 260 })
      .setLatLng(latlng)
      .setContent(
        `<div class="fiche">` +
        `<img src="${flagUrl(p.iso, 320)}" alt="" onerror="this.remove()">` +
        `<span><span class="nom">${echapper(p.n)}</span>` +
        `<span class="cap">🏛️ ${echapper(p.c)}</span></span></div>`
      )
      .openOn(exploreMap);
  }

  $("modeMulti").addEventListener("click", () => {
    modeChoisi = "multi";
    ouvrirReglages();
  });

  function ouvrirReglages() {
    const multi = modeChoisi === "multi";
    $("reglagesTitle").textContent = multi ? "👥 Multijoueur" : "🙋 Solo";
    $("blocJoueurs").classList.toggle("hidden", !multi);
    $("blocNoms").classList.toggle("hidden", !multi);
    construireReglageJoueurs();
    showScreen("players");
  }

  function construireReglageJoueurs() {
    $("playerCount").max = MAX_JOUEURS;
    $("playerCount").value = nbJoueurs;
    $("playerCountVal").textContent = nbJoueurs;
    $("questionCount").value = nbQuestions;
    $("questionCountVal").textContent = nbQuestions;

    $("questionHint").textContent = modeChoisi === "multi"
      ? `${nbQuestions} pays × ${nbJoueurs} joueurs = ${nbQuestions * nbJoueurs} tours de jeu.`
      : `${nbQuestions} pays, soit un score sur ${nbQuestions * 3}.`;
    majReglageChrono();

    const noms = $("playerNames");
    noms.innerHTML = "";
    for (let i = 0; i < nbJoueurs; i++) {
      const wrap = document.createElement("label");
      wrap.className = "player-row";
      wrap.innerHTML = `<span class="player-num">${i + 1}</span>`;
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "text-input small";
      inp.value = nomsJoueurs[i];
      inp.maxLength = 14;
      inp.autocomplete = "off";
      inp.addEventListener("input", () => { nomsJoueurs[i] = inp.value; });
      wrap.appendChild(inp);
      noms.appendChild(wrap);
    }
  }

  $("playersNext").addEventListener("click", () => {
    // Un nom vide casserait le classement : on remet un nom par défaut.
    for (let i = 0; i < nbJoueurs; i++) {
      if (!nomsJoueurs[i] || !nomsJoueurs[i].trim()) nomsJoueurs[i] = `Joueur ${i + 1}`;
    }
    $("continentTitle").textContent = modeChoisi === "multi"
      ? `👥 ${nbJoueurs} joueurs` : "🙋 Solo";
    afficherContinents();
  });

  function afficherContinents() {
    const grille = $("continentList");
    grille.innerHTML = "";
    DATA.continents.forEach((c) => {
      const nb = DATA.pays[c.id].length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice" + (c.id === "monde" ? " wide" : "");
      btn.innerHTML =
        `<span class="emo">${c.emoji}</span>` +
        `<span class="lbl">${c.nom}</span>` +
        `<span class="sub">${nb} pays</span>`;
      btn.addEventListener("click", () => choisirContinent(c));
      grille.appendChild(btn);
    });
    showScreen("continent");
  }

  function choisirContinent(c) {
    contChoisi = c;
    $("diffTitle").textContent = `${c.emoji} ${c.nom}`;

    const grille = $("difficultyList");
    grille.innerHTML = "";
    DIFFICULTES.forEach((d) => {
      const nb = poolPays(c.id, d.maxLvl).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.innerHTML =
        `<span class="lbl">${d.emoji} ${d.nom}</span>` +
        `<span class="sub">${d.sub} · ${nb} pays possibles</span>`;
      btn.addEventListener("click", () => nouvellePartie(c, d));
      grille.appendChild(btn);
    });

    const zone = $("bestScores");
    zone.innerHTML = "";
    if (modeChoisi === "solo") {
      DIFFICULTES.forEach((d) => {
        const b = lireRecord(c.id, d.id);
        if (b) {
          const l = document.createElement("div");
          l.textContent = `🏅 Record ${d.nom} : ${b.score}/${b.total}`;
          zone.appendChild(l);
        }
      });
    }

    showScreen("difficulty");
  }

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cible = btn.getAttribute("data-back");
      if (cible === "quit") {
        if (partie && partie.idx > 0 && !confirm("Abandonner la manche en cours ?")) return;
        showScreen(contChoisi ? "difficulty" : "continent");
      } else if (cible === "depuisContinent") {
        showScreen("players");
      } else {
        showScreen(cible);
      }
    });
  });

  // ============================================================
  //  Démarrage
  // ============================================================

  if (!LEAFLET_OK) {
    $("offlineHint").textContent =
      "⚠️ La carte n'a pas pu être chargée. Reconnecte-toi puis recharge la page.";
  } else {
    // Les contours sont livrés avec l'app : seuls les drapeaux viennent du
    // réseau maintenant que le fond de carte est dessiné ici.
    $("offlineHint").textContent =
      "Seules les images de drapeaux ont besoin d'internet au premier lancement. Les cartes, elles, sont embarquées.";
  }
  majReglageChrono();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* pas bloquant */ });
    });
  }
})();
