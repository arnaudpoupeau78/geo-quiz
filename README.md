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

## Les deux modes

- **Solo** — ton meilleur score est gardé par continent et par difficulté.
  En fin de manche : récapitulatif dépliable (touche un pays pour revoir tes
  trois réponses), et le choix entre rejouer de nouveaux pays ou **rejouer
  exactement la même série**.
- **Multijoueur** — 2 à 6 joueurs, chacun son tour sur le même téléphone.
  Tout le monde reçoit **les mêmes 10 pays et les mêmes grilles de drapeaux**,
  donc la comparaison est juste. Un écran « passe le téléphone à… » sépare les
  joueurs, et un **classement** conclut la partie.

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

### Carte

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

- `n`, `c` : nom et capitale en français · `alt` : autres capitales acceptées.
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
- Monaco et le Vatican ne sont pas correctement identifiés par « tu as cliqué
  sur… » : leurs contours Natural Earth sont des blocs approximatifs, décalés
  de quelques centaines de mètres.
- La Russie est rangée dans l'Europe et la Turquie dans l'Asie (choix
  arbitraire). La déplacer vers l'Asie obligerait à étendre la carte jusqu'à
  180° est et 78° nord : l'Asie perdrait un niveau de zoom entier.
- Le bouton « retour » d'Android quitte l'app au lieu de revenir à l'écran
  précédent (l'historique du navigateur n'est pas utilisé).
