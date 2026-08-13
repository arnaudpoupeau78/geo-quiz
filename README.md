# 🌍 Géo Quiz

Application web (PWA) d'apprentissage de la géographie, pensée pour le
téléphone. Deux modes : **solo** ou **multijoueur** sur le même appareil.

Pour chaque pays tiré au sort, trois étapes s'enchaînent :

1. **Capitale** — écrire la capitale (ou « Je ne sais pas »).
2. **Drapeau** — le retrouver parmi 6.
3. **Carte** — le placer sur une carte muette **figée** : tout le continent
   est visible d'un coup, on ne peut ni déplacer ni zoomer, on clique.

Puis un **écran de correction** : le bon pays est **colorié en vert** sur la
carte, avec les noms des pays affichés et la possibilité de zoomer. Une manche
fait 10 pays, notés sur 30.

## Deux modules

L'app s'ouvre sur le choix du terrain de jeu :

- **🌍 Géographie du Monde** — 189 pays, capitale / drapeau / emplacement.
- **🇫🇷 Départements Français** — 101 départements, DOM compris. Solo,
  multijoueur et entraînement libre, avec choix de la région et deux
  sous-modes :
  - **Trouver par numéro** : on donne `33`, tu écris « Gironde », puis tu le
    places sur la carte ;
  - **Trouver par nom** : on donne « Gironde », tu écris `33`, puis la carte.

  Deux étapes par département, donc **2 points** — il n'y a pas de drapeau à
  deviner pour la Gironde. Les zéros de tête sont ignorés (`1`, `01`), et
  `2a`/`2A` passent tous les deux ; en revanche aucune tolérance aux fautes sur
  un numéro, c'est le bon ou c'en est un autre. Sur le nom, même indulgence
  orthographique que sur les capitales.

  **Métropole et DOM sont sur des cadres séparés**, jamais mélangés : ils sont
  à des milliers de kilomètres, une carte commune donnerait un planisphère où
  la Corrèze fait un pixel. En quiz, le cadre suit le département demandé et
  l'annonce sous la question.

## Les trois modes, communs aux deux modules

- **Solo** — ton meilleur score est gardé par continent et par difficulté.
  En fin de manche : récapitulatif dépliable (touche un pays pour revoir tes
  trois réponses), et le choix entre rejouer de nouveaux pays ou **rejouer
  exactement la même série**.
- **Multijoueur** — 2 à 6 joueurs sur le même téléphone, et **5, 10, 15 ou 20
  pays** au choix. Tout le monde reçoit **les mêmes pays et les mêmes grilles
  de drapeaux**, donc la comparaison est juste.

  Le tour se joue **pays par pays, pas joueur par joueur** : tout le monde
  répond au pays n°1, puis tout le monde au pays n°2, etc. Personne n'attend
  donc que le voisin ait terminé sa manche entière. Un écran « passe le
  téléphone à… » sépare chaque joueur, et un **classement** conclut la partie —
  chaque ligne se déplie sur le détail des réponses de ce joueur.

Aucun compte, aucun serveur, aucune base de données : tout se passe dans la
page. C'est aussi pour ça que le multijoueur est « en local » — jouer chacun
depuis son propre téléphone demanderait un backend.

## Mise en ligne (GitHub Pages, gratuit)

1. Crée un dépôt GitHub, par exemple `geo-quiz`.
2. Envoie **tout le contenu de ce dossier** à la racine du dépôt.
3. **Settings → Pages → Source : Deploy from a branch**, branche `main`,
   dossier `/ (root)` → **Save**.
4. Après 1-2 minutes : `https://TON_PSEUDO.github.io/geo-quiz/`

> Le HTTPS est indispensable : sans lui, le service worker (mode hors-ligne)
> et l'installation sur l'écran d'accueil ne fonctionnent pas.
> GitHub Pages le fournit automatiquement.

### Installer sur le téléphone

Ouvre le lien, puis **« Ajouter à l'écran d'accueil »**.

### Tester en local

Le jeu tourne aussi en ouvrant `index.html` en double-clic (toutes les données
sont dans des `.js` et non des `.json`, justement pour ça), mais **sans**
service worker ni installation.

Le plus simple : **clic droit sur `dev-server.ps1` → « Exécuter avec
PowerShell »**.

En ligne de commande, donne le **chemin complet** (guillemets obligatoires, le
dossier contient un espace) :

```bash
powershell -ExecutionPolicy Bypass -File "C:\Users\poupeaua\Documents\PERSO\Applis Persos\geo-quiz\dev-server.ps1"
```

Puis ouvre <http://localhost:8765>. `Ctrl+C` pour arrêter.

> `-File dev-server.ps1` tout court ne marche que si la fenêtre PowerShell est
> **déjà** dans le dossier `geo-quiz` — par défaut elle s'ouvre dans
> `C:\WINDOWS\system32`.

## Ce que ça utilise

| Ressource | Rôle | Remarque |
|---|---|---|
| `data/countries.js` | 189 pays : capitale, code ISO, niveau, point de repère | Modifiable à la main |
| `data/borders.js` | Contours des 189 pays (~485 Ko) | Natural Earth, domaine public — voir plus bas |
| [flagcdn.com](https://flagcdn.com) | Images des drapeaux | Gratuit, sans clé |
| [CARTO Voyager](https://github.com/CartoDB/basemap-styles) | Fond de carte : `voyager_nolabels` pour la question, `voyager` pour la correction | Gratuit, sans clé |
| [Leaflet 1.9.4](https://leafletjs.com) | Carte interactive | Depuis unpkg, mis en cache |

Aucune clé d'API, aucun build : c'est du HTML/CSS/JS servi tel quel.

## Chronomètre

Réglable sur l'écran de difficulté, pour le solo comme le multijoueur :
interrupteur, puis **5, 10, 15 ou 30 secondes**. Une barre se vide au-dessus de
la question et passe au rouge dans le dernier quart. À zéro, l'étape est
validée en échec et on passe à la suivante.

Le compte à rebours porte sur **chaque étape**, pas sur le pays entier : sinon
écrire une capitale mangerait le temps du drapeau et de la carte. Il tourne sur
`setTimeout` et non `requestAnimationFrame`, qui est gelé dès que l'onglet
passe en arrière-plan — la barre resterait figée.

## Comment marche la notation

### Capitale

La comparaison ignore accents, casse et ponctuation, et tolère des fautes de
frappe (distance de Levenshtein) selon la difficulté et la longueur du mot.
Les capitales multiples sont acceptées (Bolivie : Sucre *ou* La Paz, Pays-Bas :
Amsterdam *ou* La Haye, Afrique du Sud : Pretoria, Le Cap ou Bloemfontein…).

**La correction dit toujours ce qui s'est passé** : « Accepté : 1 faute de
frappe, la marge en Moyen est de 2 », ou « Tout près : 1 faute, mais en
Difficile l'orthographe doit être exacte ». Donc `Pari` pour `Paris` : accepté
en Facile, Moyen et Mélangé, refusé en Difficile — et l'app te le dit.

| Longueur du mot | Facile | Moyen / Mélangé | Difficile |
|---|---|---|---|
| ≤ 4 lettres | 1 faute | 0 | 0 |
| 5 à 9 lettres | 2 | 1 | 0 |
| ≥ 10 lettres | 3 | 2 | 1 |

### Drapeau

En *Difficile*, les 5 leurres sont choisis en priorité dans la même « famille »
que la bonne réponse (nordiques, panafricains, tricolores, croissant…).
En *Facile*, c'est l'inverse.

Dans tous les cas, **les 5 leurres viennent du même continent que le pays
demandé**. Un drapeau africain glissé dans une question sur l'Asie s'éliminait
d'un coup d'œil, sans rien connaître.

### Carte

**Il n'y a plus aucune tuile.** Les cartes sont dessinées par l'app à partir de
`data/borders.js`, en canvas. Les tuiles étaient des images toutes faites, avec
les limites régionales, les routes et les zones urbaines cuites dans le pixel :
impossible de les retirer alors qu'on ne veut que les frontières. Les dessiner
nous-mêmes donne une carte sombre assortie au reste de l'app, nette à tous les
zooms, et **disponible dès le premier lancement sans réseau** — seules les
images de drapeaux dépendent encore d'internet. Coût mesuré : 51 à 114 ms pour
construire le fond d'un continent, une seule fois puis mis en cache.

Les **noms des pays** sont eux aussi dessinés par l'app, et n'apparaissent que
lorsque le pays est assez large à l'écran — sinon les libellés se chevauchent.

**Le zoom est autorisé, mais borné.** On ne peut pas dézoomer sous la vue du
continent, ni zoomer au-delà de 3,5 niveaux (le fond se couvrirait de routes),
ni faire glisser la carte hors du cadre de départ. Un bouton **⤢** ramène à la
vue d'ensemble. C'est le compromis entre la carte libre du début — où l'on se
perdait — et la carte totalement figée : depuis que la validation est binaire,
atteindre un petit pays demande de pouvoir s'approcher.

La carte **prend la forme du continent affiché** : sa largeur est calculée à
partir de sa hauteur disponible et des proportions du continent. Sans ça,
`fitBounds` garde bien tout le continent visible mais comble le vide en
longitude — sur une fenêtre large et courte, demander l'Asie affichait 167° au
lieu de 120°, donc l'Europe et l'Afrique en prime et l'Asie deux fois plus
petite. La carte est aussi recadrée quand on tourne le téléphone.

Au clic, **le pays touché se colorie entièrement en vert**, selon ses vrais
contours : on voit donc ce qu'on s'apprête à valider avant d'appuyer, ce qu'un
simple point ne disait pas sur une carte muette. Le nom, lui, reste caché. Un
clic sur l'eau désigne la côte la plus proche — exactement ce que la notation
retiendra — ou affiche « tu es en pleine mer » s'il n'y a rien à moins de 20 km.

**La règle est binaire, et identique pour toutes les difficultés : le clic est
dans le pays, ou il ne l'est pas.** Le clic est testé contre le contour réel
(point-dans-polygone), pas contre une distance.

Il n'y a **aucune marge de tolérance en kilomètres** : cliquer en Hongrie n'est
jamais bon pour la Serbie, même à 2 km de la frontière. Une version précédente
autorisait une marge, elle produisait des verdicts indéfendables.

Une seule exception, et ce n'est pas une marge déguisée : **un clic tombé sur
l'eau à moins de 20 km d'une côte est rattaché à cette côte**, à condition
qu'aucun autre pays ne soit plus proche. Sans ça, cliquer pile sur Lisbonne
répondrait « tu as cliqué en mer » — Natural Earth classe l'estuaire du Tage,
la lagune de Venise et le détroit de Copenhague comme de l'eau. Un clic dans un
**autre pays** reste faux, quelle que soit la distance.

La correction affiche **le pays que tu as réellement touché**, et colorie le bon
pays en vert.

> **Conséquence assumée :** 22 pays font moins de 2 pixels sur la carte de leur
> continent (Monaco, Vatican, Malte, Nauru, Tuvalu, les atolls du Pacifique…).
> Sur l'étape carte, ils relèvent de la loterie. 21 d'entre eux sont de
> niveau 3 et n'apparaissent donc qu'en Difficile et Mélangé. **Singapour est
> l'exception** : il est de niveau 1 et tombe donc aussi en Facile — passe-le en
> `lvl: 2` dans `data/countries.js` si ça te gêne.

## Difficultés et continents

Chaque pays porte un niveau de notoriété (1 à 3) dans `data/countries.js` :

- **Facile** : niveau 1 · **Moyen** : niveaux 1-2 · **Difficile** et
  **Mélangé** : tous les niveaux.
- *Difficile* et *Mélangé* tirent dans le même vivier ; ce qui change, c'est la
  sévérité (marges serrées et leurres ressemblants pour Difficile, réglages
  normaux pour Mélangé).

Six terrains de jeu : Europe, Asie, Afrique, Amériques, Océanie et
**Monde entier** (les 189 pays d'un coup).

En *Monde entier*, la carte ne montre pas le planisphère — la Belgique y ferait
un pixel. Elle se cadre sur **le continent du pays demandé**, et l'annonce sous
la question. On part du principe que si tu connais le pays, tu sais sur quel
continent il est ; en échange la carte reste cliquable.

Si un continent n'a pas assez de pays à un niveau donné (l'Océanie n'a que
2 pays de niveau 1), le vivier s'élargit automatiquement — le nombre réel est
affiché sur chaque bouton.

## Modifier les données

### Les pays — [`data/countries.js`](data/countries.js)

```js
{ n: "France", c: "Paris", iso: "fr", lat: 46.6, lng: 2.4, lvl: 1, r: 330, f: "tri-v" },
```

- `n`, `c` : nom et capitale en français.
- `aussi` : **autres capitales légitimes**, acceptées *et annoncées* dans la
  correction (Sucre + La Paz, Amsterdam + La Haye, Pretoria + Le Cap…).
- `alt` : simples variantes d'orthographe, acceptées **en silence**
  (`beijing`, `kyiv`, `washington dc`).

  La distinction compte : répondre « La Paz » pour la Bolivie affichait une
  coche verte juste au-dessus de « Bonne réponse : Sucre ». On avait l'air de
  s'être trompé tout en ayant juste. Maintenant la correction ajoute
  « La Paz » compte aussi pour ce pays. Aucune note en revanche pour
  « Beijing », qui n'est qu'une autre façon d'écrire Pékin.
- `iso` : code à 2 lettres — sert au drapeau **et** au contour.
- `lvl` : 1 très connu, 2 moyen, 3 pointu.
- `f` : famille de drapeau, pour les leurres en Difficile.
- `lat`/`lng`, `r`, `pts` : **repli** utilisé uniquement si le contour du pays
  manquait. Aujourd'hui les 189 pays ont un contour, donc ces champs ne servent
  plus à la notation.

Les longitudes de l'Océanie sont écrites en 0..360 (Samoa = 187,9 et non
−172,1) pour que la carte ne soit pas coupée par l'antiméridien.

### Les contours — [`data/borders.js`](data/borders.js)

Fichier **généré**, à ne pas éditer à la main. Source : Natural Earth **1:50m**
(domaine public), les 189 pays.

Pourquoi le 50m et pas le 110m, dix fois plus léger : depuis que la validation
est binaire, la finesse du trait décide directement du score. Mesuré sur 3 871
points d'une grille européenne, le 110m était **en désaccord avec le 50m dans
4,2 % des cas** — surtout les côtes et les îles grecques, purement absentes.
Intenable sans marge d'erreur.

Traitement appliqué aux 3 Mo bruts :

- simplification Douglas-Peucker à 0,05° (~5,5 km, soit un quart de pixel à
  l'échelle d'un continent : invisible) ;
- tolérance plafonnée à 1/25e de la taille de chaque morceau — sinon un seuil
  fixe effaçait Monaco (0,06° de large) et les atolls ;
- arrondi adapté morceau par morceau, de 0,0001° pour une île minuscule à
  0,01° pour un grand pays.

Résultat : **485 Ko**, avec 0,77 % de désaccord résiduel avec le 50m brut,
c'est-à-dire uniquement des points à moins d'un tiers de pixel d'une frontière.

Natural Earth ne creuse pas les enclaves : son polygone de l'Italie recouvre le
Vatican et Saint-Marin, celui de l'Afrique du Sud recouvre le Lesotho. Pour
répondre « tu as cliqué sur… », l'app garde donc **le plus petit pays** qui
contient le point.

## Mettre à jour l'app après un déploiement

Le service worker sert les fichiers de l'app en **réseau d'abord** : une
nouvelle version est prise en compte au rechargement suivant. Pour un gros
changement, incrémente `CACHE_VERSION` dans [`sw.js`](sw.js) et le `?v=` dans
[`index.html`](index.html).

## Hors-ligne

Au **premier** lancement il faut du réseau (Leaflet, drapeaux, tuiles). Ensuite
tout ce qui a déjà été affiché est en cache. Les contours des pays, eux, sont
livrés avec l'app : la notation de la carte fonctionne dès le premier
lancement, même sans réseau. Si un drapeau manque, son nom et son code pays
s'affichent à la place.

## Limites connues

- Multijoueur **local uniquement** (on se passe le téléphone). Jouer chacun
  depuis son appareil demanderait un serveur.
- Les capitales sont saisies à la main : une erreur se corrige en une ligne.
- 22 pays font moins de 2 pixels sur la carte de leur continent : l'étape carte
  y est une loterie. C'est le prix de la règle binaire, assumé.
- En multijoueur, la correction d'un pays s'affiche avant que le joueur suivant
  ne réponde au même pays. L'écran « passe le téléphone » la masque, mais rien
  n'empêche de regarder par-dessus l'épaule — c'est le principe du jeu à un
  seul téléphone.
- Monaco et le Vatican ne sont pas correctement identifiés par « tu as cliqué
  sur… » : leurs contours Natural Earth sont des blocs approximatifs, décalés
  de quelques centaines de mètres.
- La Russie est rangée dans l'Europe et la Turquie dans l'Asie (choix
  arbitraire). La déplacer vers l'Asie obligerait à étendre la carte jusqu'à
  180° est et 78° nord : l'Asie perdrait un niveau de zoom entier.
- Le bouton « retour » d'Android quitte l'app au lieu de revenir à l'écran
  précédent (l'historique du navigateur n'est pas utilisé).
