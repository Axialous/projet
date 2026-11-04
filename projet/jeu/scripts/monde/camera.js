import { TAILLE_TUILE } from './carte.js'
import { borner, interpoler } from '../utilitaires/maths.js'

const PARAMETRES = {
    // Distance (tuiles) à partir de laquelle la caméra se prépare à une zone plus
    // étroite (zoom et alignement), pour y arriver avec la vue exacte.
    distance_anticipation: 4,
    // Espace minimal (tuiles) entre la cible et chaque bord de la vue. Sans marge,
    // la vue reste collée à une pièce jusqu'à ce que la cible en sorte, puis bascule
    // d'un coup dans le couloir.
    marge: 1,
    // Écart (pixels de la carte) entre les cadrages libres de deux cases voisines
    // au-delà duquel on considère que le cadrage libre saute : autour de ces cases, la
    // vue se recentre sur la cible.
    saut_minimal: 16,
    // Pas (pixels) de la grille des positions précalculées. Diviseur de TAILLE_TUILE :
    // plus fin, la vue colle mieux aux murs mais le précalcul est plus long.
    pas: 8,
}

// Tolérance des calculs en virgule flottante (en tuiles).
const EPSILON = 1e-6

// Caméra qui suit une cible en dézoomant au maximum, sans jamais montrer le fond :
// la vue ne recouvre que des tuiles dessinées (sols et murs qui les bordent).
//
// La vue n'est pas forcément centrée sur la cible : c'est la plus grande vue permise
// qui la contient avec une marge (PARAMETRES.marge) de chaque côté, placée au plus
// près du point visé. Dans une pièce qui tient à l'écran, la vue montre ainsi toute
// la pièce sans bouger.
//
// Précalcul, pour chaque case de la grille des positions de la cible (pas de
// PARAMETRES.pas pixels) : la plus grande largeur de vue permise pour toutes les
// positions de la case, et les bords imposés par le fond aux vues de cette largeur
// (par exemple les deux murs d'un couloir). Un bord qui ne vient que de l'obligation
// de contenir la cible n'est pas retenu : il suit la cible et ne dit rien des murs.
//
// La vue ne dépend que de la position de la cible, jamais du chemin suivi : au même
// endroit, elle est toujours la même. Anticipation, pour chaque case q à une
// distance d < D (t = d / D) :
// - largeur : q impose une largeur interpolée entre la sienne (t = 0, en y entrant)
//   et la plus grande permise autour d'elle (t = 1), au même facteur de zoom par
//   pixel parcouru ; la vue prend la plus petite ;
// - position : q impose au centre de la vue un décalage par rapport au centre de la
//   cible, celui qui pose la vue contre les bords imposés de q quand la cible y est,
//   appliqué en entier à t = 0 et décroissant linéairement jusqu'à 0 à t = 1. Le
//   décalage est donc réparti sur toute la distance D, et exact en entrant dans la
//   case ; en sens inverse, la vue se recentre de même progressivement sur D.
// Tout varie continûment avec la position de la cible.
//
// Ce cadrage libre peut sauter par endroits (deux cadrages possibles séparés par du
// fond, dont l'un disparaît). Ces endroits sont repérés au précalcul : les cases dont
// le cadrage libre diffère trop de celui d'une case voisine. Près d'eux, la vue se
// recentre sur la cible : avec a = (distance au plus proche de ces endroits) / D,
// bornée à 1, la vue est centrée sur le point situé à la fraction a du chemin entre le
// centre de la cible et celui du cadrage libre. Sa largeur passe de la même façon
// (géométriquement) de la vue centrée sur la cible à celle du cadrage libre, réduite
// si besoin pour ne pas montrer le fond autour de ce point. À a = 0 la vue est
// centrée sur la cible ; à a = 1 c'est le cadrage libre.
export class Camera {
    constructor(carte, largeur_ecran, hauteur_ecran, largeur_cible, hauteur_cible, parametres = PARAMETRES) {
        this.carte = carte
        this.largeur_ecran = largeur_ecran
        // Hauteur de la vue par pixel de largeur : la vue garde les proportions de l'écran.
        this.proportion = hauteur_ecran / largeur_ecran
        this.largeur_cible = largeur_cible
        this.hauteur_cible = hauteur_cible
        this.pas = parametres.pas
        this.distance_anticipation = parametres.distance_anticipation * TAILLE_TUILE
        this.marge = parametres.marge * TAILLE_TUILE
        this.saut_minimal = parametres.saut_minimal

        // Vue courante : coin haut gauche et taille dans la carte (pixels), et zoom
        // (pixels de l'écran par pixel de la carte).
        this.x = 0
        this.y = 0
        this.largeur = largeur_ecran
        this.hauteur = hauteur_ecran
        this.zoom = 1
        // État de la dernière simulation et de la précédente (null : pas d'interpolation).
        this.etat = null
        this.precedente = null

        this.cumuler_fond()
        this.lister_largeurs_candidates()
        this.precalculer()
    }

    // --- Suivi ---

    // Cadre la vue sur la cible ({ x, y, largeur, hauteur }, de la taille donnée au
    // constructeur). À appeler à chaque mise à jour, avec immediat pour cadrer sans
    // transition à l'affichage (début de partie, téléportation). La vue ne dépend que
    // de la position de la cible : immobile, la cible garde la même vue.
    suivre(cible, immediat = false) {
        const cases = this.cases_proches(cible)
        const largeur = cases.length
            ? Math.min(...cases.map((proche) => proche.largeur))
            // Toute position valide de la cible appartient à une case accessible : ce
            // repli ne sert qu'à une cible placée dans un mur.
            : this.largeur_max(this.zone_cible(cible.x, cible.y, cible.x, cible.y))
        const hauteur = largeur * this.proportion

        const centre_cible = { x: cible.x + cible.largeur / 2, y: cible.y + cible.hauteur / 2 }
        const libre = this.placer(cible, largeur, hauteur, this.aligner(centre_cible, cases))
        // Liberté : distance relative au plus proche endroit où le cadrage libre saute.
        let liberte = 1
        for (const proche of cases) if (this.centrage[proche.indice]) liberte = Math.min(liberte, proche.t)

        // État retenu pour l'affichage interpolé entre deux simulations.
        this.etat = {
            centre_cible,
            centre_libre: { x: libre.x + largeur / 2, y: libre.y + hauteur / 2 },
            largeur_libre: largeur,
            liberte,
        }
        const vue = this.composer(this.etat)
        this.cadrer(vue.x, vue.y, vue.largeur)
        if (immediat) this.precedente = null
    }

    // Vue à partir d'un état (voir l'explication en tête de la classe).
    composer({ centre_cible, centre_libre, largeur_libre, liberte }) {
        // Vue centrée sur la cible : la largeur libre, réduite pour ne pas montrer le fond.
        const largeur_sur_cible = Math.min(largeur_libre, this.largeur_centree(centre_cible.x, centre_cible.y))
        const centre = {
            x: interpoler(centre_cible.x, centre_libre.x, liberte),
            y: interpoler(centre_cible.y, centre_libre.y, liberte),
        }
        const largeur_voulue = largeur_sur_cible > 0
            ? largeur_sur_cible * (largeur_libre / largeur_sur_cible) ** liberte
            : interpoler(largeur_sur_cible, largeur_libre, liberte)
        const largeur = Math.min(largeur_voulue, this.largeur_centree(centre.x, centre.y))
        return { x: centre.x - largeur / 2, y: centre.y - largeur * this.proportion / 2, largeur }
    }

    cadrer(x, y, largeur) {
        this.x = x
        this.y = y
        this.largeur = largeur
        this.hauteur = largeur * this.proportion
        this.zoom = this.largeur_ecran / largeur
    }

    // Plus grande largeur d'une vue centrée sur (x, y) qui ne recouvre aucune tuile de
    // fond ni ne sort de la carte. Une tuile de fond est recouverte si son écart au
    // centre est inférieur à la demi-largeur horizontalement et à la demi-hauteur
    // verticalement : la demi-largeur maximale est donc le plus petit, parmi les
    // tuiles de fond, de max(écart horizontal, écart vertical / proportion). Les
    // tuiles sont parcourues en anneaux autour du centre, jusqu'à ce qu'aucune plus
    // lointaine ne puisse faire moins.
    largeur_centree(x, y) {
        const { carte, proportion } = this
        let demi_largeur = Math.min(x, carte.largeur_pixels - x, Math.min(y, carte.hauteur_pixels - y) / proportion)
        if (demi_largeur <= 0) return 0
        const colonne = Math.floor(x / TAILLE_TUILE)
        const ligne = Math.floor(y / TAILLE_TUILE)
        const essayer = (i, j) => {
            if (i < 0 || j < 0 || i >= carte.largeur || j >= carte.hauteur || !this.fond[j * carte.largeur + i]) return
            const ecart_x = Math.abs(x - (i + 0.5) * TAILLE_TUILE) - TAILLE_TUILE / 2
            const ecart_y = Math.abs(y - (j + 0.5) * TAILLE_TUILE) - TAILLE_TUILE / 2
            demi_largeur = Math.min(demi_largeur, Math.max(0, ecart_x, ecart_y / proportion))
        }
        // Toute tuile de l'anneau k est à au moins (k - 1) tuiles du centre sur un axe.
        for (let k = 0; (k - 1) * TAILLE_TUILE < demi_largeur; k++) {
            for (let d = -k; d <= k; d++) {
                essayer(colonne + d, ligne - k)
                if (k > 0) essayer(colonne + d, ligne + k)
            }
            for (let d = -k + 1; d <= k - 1; d++) {
                essayer(colonne - k, ligne + d)
                essayer(colonne + k, ligne + d)
            }
        }
        return 2 * demi_largeur
    }

    // --- Affichage ---

    // À appeler avant chaque simulation.
    memoriser_etat() {
        this.precedente = this.etat
    }

    // Vue { x, y, largeur, hauteur, zoom } à afficher entre la simulation précédente
    // (avancement 0) et la dernière (1). L'état est interpolé (les largeurs
    // géométriquement, comme le zoom pendant l'anticipation), puis la vue en est
    // recomposée : elle suit la cible là où elle est affichée et ne montre jamais le
    // fond, même entre deux simulations.
    vue_affichee(avancement) {
        const precedente = this.precedente ?? this.etat
        const actuel = this.etat
        const point = (a, b) => ({ x: interpoler(a.x, b.x, avancement), y: interpoler(a.y, b.y, avancement) })
        const { x, y, largeur } = this.composer({
            centre_cible: point(precedente.centre_cible, actuel.centre_cible),
            centre_libre: point(precedente.centre_libre, actuel.centre_libre),
            largeur_libre: precedente.largeur_libre * (actuel.largeur_libre / precedente.largeur_libre) ** avancement,
            liberte: interpoler(precedente.liberte, actuel.liberte, avancement),
        })
        return { x, y, largeur, hauteur: largeur * this.proportion, zoom: this.largeur_ecran / largeur }
    }

    // Cases accessibles à moins de D de la cible : { indice, t, largeur } où t = d / D
    // et largeur est la largeur que la case impose à cette distance.
    cases_proches(cible) {
        const { pas, distance_anticipation: distance_max } = this
        const { x, y } = cible
        const cases = []
        const k1 = Math.floor((x - distance_max) / pas)
        const k2 = Math.floor((x + distance_max) / pas)
        const l1 = Math.floor((y - distance_max) / pas)
        const l2 = Math.floor((y + distance_max) / pas)
        for (let l = Math.max(0, l1); l <= Math.min(this.lignes - 1, l2); l++) {
            for (let k = Math.max(0, k1); k <= Math.min(this.colonnes - 1, k2); k++) {
                const indice = l * this.colonnes + k
                const largeur_case = this.largeurs_max[indice]
                if (!largeur_case) continue
                // Distance entre la position et la case (fermée) : nulle quand on y entre.
                const dx = Math.max(k * pas - x, 0, x - (k + 1) * pas)
                const dy = Math.max(l * pas - y, 0, y - (l + 1) * pas)
                const distance = Math.hypot(dx, dy)
                if (distance >= distance_max) continue
                const t = distance / distance_max
                // Interpolation géométrique : le zoom est multiplié par le même facteur à
                // chaque pixel parcouru. (Linéaire sur la largeur, presque tout le zoom se
                // ferait juste avant d'entrer dans la zone, comme un saut.)
                const voisinage = this.largeurs_voisinage[indice]
                cases.push({ indice, t, largeur: largeur_case * (voisinage / largeur_case) ** t })
            }
        }
        return cases
    }

    // Centre visé pour la vue : le centre de la cible, ramené entre les bornes imposées
    // par les cases proches.
    //
    // Pour un bord imposé d'une case q, la borne du centre pose la vue contre ce bord
    // en entrant dans q (t = 0) et se relâche linéairement jusqu'à ne plus rien
    // imposer à t = 1 : l'alignement est réparti sur toute la distance D, que l'on
    // s'approche de q ou que l'on s'en éloigne.
    aligner(centre, cases) {
        const { pas } = this
        const bornes_x = { minimum: -Infinity, maximum: Infinity }
        const bornes_y = { minimum: -Infinity, maximum: Infinity }
        // libre : centre de la cible sur l'axe ; debut : début de la case sur l'axe ;
        // limite : borne du centre qui pose la vue contre le bord ; sens = 1 pour une
        // borne maximale, -1 pour une borne minimale.
        const resserrer = (bornes, libre, debut, taille_cible, limite, t, sens) => {
            if (!Number.isFinite(limite)) return
            // Centre de la cible dans la case q, au plus près de sa position actuelle.
            const dans_case = borner(libre, debut + taille_cible / 2, debut + pas + taille_cible / 2)
            // Borne directe, relâchée linéairement vers le centre libre : juste quand la
            // cible est en face de q, et sans effet si elle est déjà du bon côté.
            const directe = Math.max(0, sens * (libre - limite)) * t
            // Si la cible a dépassé q du côté où le bord retient la vue (elle s'en
            // éloigne vers l'avant), le décalage reste celui mesuré dans q, décroissant
            // avec t, au lieu de grandir avec la distance parcourue.
            const depassement = Math.max(0, sens * (libre - dans_case)) * (1 - t)
            const borne = limite + sens * (directe + depassement)
            if (sens > 0) bornes.maximum = Math.min(bornes.maximum, borne)
            else bornes.minimum = Math.max(bornes.minimum, borne)
        }
        for (const { indice, t } of cases) {
            const debut_x = (indice % this.colonnes) * pas
            const debut_y = Math.floor(indice / this.colonnes) * pas
            const lc = this.largeur_cible
            const hc = this.hauteur_cible
            // Avec la vue qu'on aura en entrant dans q, pas la vue actuelle : plus grande,
            // celle-ci ne tiendrait pas entre les murs d'un couloir.
            const demi_largeur = this.largeurs_entree[indice] / 2
            const demi_hauteur = demi_largeur * this.proportion
            resserrer(bornes_x, centre.x, debut_x, lc, this.bords_gauche[indice] + demi_largeur, t, -1)
            resserrer(bornes_x, centre.x, debut_x, lc, this.bords_droit[indice] - demi_largeur, t, 1)
            resserrer(bornes_y, centre.y, debut_y, hc, this.bords_haut[indice] + demi_hauteur, t, -1)
            resserrer(bornes_y, centre.y, debut_y, hc, this.bords_bas[indice] - demi_hauteur, t, 1)
        }
        // Bornes incompatibles (vue plus grande que l'espace entre deux murs) : on
        // centre entre les deux, continu avec le cas où elles se touchent.
        const ramener = (valeur, { minimum, maximum }) => minimum <= maximum
            ? borner(valeur, minimum, maximum)
            : (minimum + maximum) / 2
        return { x: ramener(centre.x, bornes_x), y: ramener(centre.y, bornes_y) }
    }

    // Coin haut gauche de la vue (de taille donnée) qui contient la cible et sa marge,
    // ne montre pas le fond, et se rapproche le plus d'une vue centrée sur le point visé.
    // Sans position possible avec la marge (cible placée à la main contre le fond),
    // on se contente de contenir la cible.
    placer(cible, largeur, hauteur, centre) {
        const zone_sans_marge = { x1: cible.x, y1: cible.y, x2: cible.x + cible.largeur, y2: cible.y + cible.hauteur }
        return this.position_proche(this.zone_cible(cible.x, cible.y, cible.x, cible.y), largeur, hauteur, centre)
            ?? this.position_proche(zone_sans_marge, largeur, hauteur, centre)
            ?? { x: centre.x - largeur / 2, y: centre.y - hauteur / 2 }
    }

    // Coin de la vue permise contenant la zone dont le centre est le plus proche de
    // celui donné, ou null.
    position_proche(zone, largeur, hauteur, centre) {
        const ideal_x = centre.x - largeur / 2
        const ideal_y = centre.y - hauteur / 2
        let meilleure = null
        let meilleure_distance = Infinity
        this.parcourir_vues(zone, largeur, hauteur, (x1, x2, y1, y2) => {
            const x = borner(ideal_x, x1, x2)
            const y = borner(ideal_y, y1, y2)
            const distance = (x - ideal_x) ** 2 + (y - ideal_y) ** 2
            if (distance < meilleure_distance) {
                meilleure = { x, y }
                meilleure_distance = distance
            }
        })
        return meilleure
    }

    // Appelle rappel(x1, x2, y1, y2) pour chaque rectangle de positions du coin haut
    // gauche où la vue est permise et contient la zone.
    //
    // Les positions possibles du bord gauche sont découpées en intervalles où la vue
    // recouvre toujours les mêmes colonnes de tuiles (de même pour le bord haut et les
    // lignes) : chaque paire d'intervalles est entièrement permise ou interdite, ce
    // qu'on vérifie en son milieu.
    parcourir_vues(zone, largeur, hauteur, rappel) {
        const intervalles_x = this.intervalles(zone.x1, zone.x2, largeur)
        const intervalles_y = this.intervalles(zone.y1, zone.y2, hauteur)
        for (const [y1, y2] of intervalles_y) {
            const y_milieu = (y1 + y2) / 2
            for (const [x1, x2] of intervalles_x) {
                if (this.est_permise((x1 + x2) / 2, y_milieu, largeur, hauteur)) rappel(x1, x2, y1, y2)
            }
        }
    }

    // Intervalles des positions du bord de début d'une vue de taille donnée qui
    // contient [debut, fin], séparés aux positions où un bord de la vue passe une
    // limite de tuile.
    intervalles(debut, fin, taille) {
        const minimum = fin - taille
        const maximum = debut
        // Vue plus petite que la zone à contenir : aucune position.
        if (maximum - minimum < -EPSILON) return []
        if (maximum - minimum <= EPSILON) return [[minimum, minimum]]

        const bornes = [minimum, maximum]
        for (const decalage of [0, taille]) {
            for (let k = Math.ceil((minimum + decalage) / TAILLE_TUILE); k * TAILLE_TUILE - decalage < maximum; k++) {
                bornes.push(k * TAILLE_TUILE - decalage)
            }
        }
        bornes.sort((a, b) => a - b)

        // Une borne seule est aussi un intervalle : une vue de n tuiles exactement n'est
        // souvent permise que bords posés sur les limites de tuiles. Une vue permise à
        // l'intérieur d'un intervalle l'est aussi à ses bornes, qui recouvrent moins de
        // tuiles.
        const intervalles = [[bornes[0], bornes[0]]]
        let precedente = bornes[0]
        for (const borne of bornes) {
            if (borne - precedente <= EPSILON) continue
            intervalles.push([precedente, borne], [borne, borne])
            precedente = borne
        }
        return intervalles
    }

    // --- Précalcul ---

    // Somme cumulée (table intégrale) des tuiles de fond, pour tester une vue en temps
    // constant.
    cumuler_fond() {
        const { largeur, hauteur } = this.carte
        const ligne = largeur + 1
        this.cumul_fond = new Uint32Array(ligne * (hauteur + 1))
        // 1 pour une tuile de fond.
        this.fond = new Uint8Array(largeur * hauteur)
        for (let y = 0; y < hauteur; y++) {
            for (let x = 0; x < largeur; x++) {
                const fond = this.carte.est_visible(x, y) ? 0 : 1
                this.fond[y * largeur + x] = fond
                this.cumul_fond[(y + 1) * ligne + x + 1] = fond
                    + this.cumul_fond[y * ligne + x + 1]
                    + this.cumul_fond[(y + 1) * ligne + x]
                    - this.cumul_fond[y * ligne + x]
            }
        }
    }

    // Vrai si la vue ne recouvre aucune tuile de fond et reste dans la carte. Un bord
    // posé sur une limite de tuile ne recouvre pas la tuile suivante.
    est_permise(x, y, largeur, hauteur) {
        const x1 = Math.floor(x / TAILLE_TUILE + EPSILON)
        const y1 = Math.floor(y / TAILLE_TUILE + EPSILON)
        const x2 = Math.ceil((x + largeur) / TAILLE_TUILE - EPSILON) - 1
        const y2 = Math.ceil((y + hauteur) / TAILLE_TUILE - EPSILON) - 1
        if (x1 < 0 || y1 < 0 || x2 >= this.carte.largeur || y2 >= this.carte.hauteur) return false
        const ligne = this.carte.largeur + 1
        const c = this.cumul_fond
        return c[(y2 + 1) * ligne + x2 + 1] - c[y1 * ligne + x2 + 1] - c[(y2 + 1) * ligne + x1] + c[y1 * ligne + x1] === 0
    }

    // La plus grande vue permise est toujours coincée entre deux limites de tuiles,
    // horizontalement ou verticalement : sa largeur vaut n tuiles, ou sa hauteur
    // vaut n tuiles. Il suffit donc de chercher parmi ces largeurs.
    lister_largeurs_candidates() {
        const largeurs = []
        for (let n = 1; n <= this.carte.largeur; n++) largeurs.push(n * TAILLE_TUILE)
        for (let n = 1; n <= this.carte.hauteur; n++) largeurs.push(n * TAILLE_TUILE / this.proportion)
        this.largeurs_candidates = largeurs.sort((a, b) => a - b)
    }

    // Largeur maximale et bords imposés pour chaque case accessible (largeur 0 si
    // inaccessible).
    precalculer() {
        const { pas, carte } = this
        this.colonnes = Math.ceil(carte.largeur_pixels / pas)
        this.lignes = Math.ceil(carte.hauteur_pixels / pas)
        const taille = this.colonnes * this.lignes
        this.largeurs_max = new Float64Array(taille)
        // Bords imposés aux vues de chaque case (infinis s'ils ne le sont pas).
        this.bords_gauche = new Float64Array(taille).fill(-Infinity)
        this.bords_droit = new Float64Array(taille).fill(Infinity)
        this.bords_haut = new Float64Array(taille).fill(-Infinity)
        this.bords_bas = new Float64Array(taille).fill(Infinity)
        for (let l = 0; l < this.lignes; l++) {
            for (let k = 0; k < this.colonnes; k++) {
                const resultat = this.calculer_case(k * pas, l * pas)
                if (!resultat) continue
                const indice = l * this.colonnes + k
                const { largeur, zone } = resultat
                this.largeurs_max[indice] = largeur
                const bords = this.bords_imposes(zone, largeur)
                this.bords_gauche[indice] = bords.gauche
                this.bords_droit[indice] = bords.droit
                this.bords_haut[indice] = bords.haut
                this.bords_bas[indice] = bords.bas
            }
        }
        this.calculer_voisinages()

        // Largeur de vue obtenue en entrant dans chaque case (à son coin), anticipation
        // comprise : c'est avec elle que la case impose son alignement.
        this.largeurs_entree = new Float64Array(taille)
        const cases_par_indice = new Map()
        for (let indice = 0; indice < taille; indice++) {
            if (!this.largeurs_max[indice]) continue
            const x = (indice % this.colonnes) * pas
            const y = Math.floor(indice / this.colonnes) * pas
            const cases = this.cases_proches({ x, y })
            cases_par_indice.set(indice, cases)
            this.largeurs_entree[indice] = Math.min(...cases.map((proche) => proche.largeur))
        }
        this.reperer_sauts(cases_par_indice)
    }

    // Cadrage libre de chaque case (cible à son coin, s'il est une position valide),
    // puis repérage des cases dont le cadrage diffère de plus de saut_minimal de celui
    // d'une case voisine : la vue devra s'y recentrer.
    reperer_sauts(cases_par_indice) {
        const { colonnes, lignes, pas } = this
        const centres_x = new Float64Array(colonnes * lignes).fill(NaN)
        const centres_y = new Float64Array(colonnes * lignes).fill(NaN)
        for (const [indice, cases] of cases_par_indice) {
            const cible = {
                x: (indice % colonnes) * pas,
                y: Math.floor(indice / colonnes) * pas,
                largeur: this.largeur_cible,
                hauteur: this.hauteur_cible,
            }
            if (this.carte.touche_mur(cible)) continue
            const largeur = this.largeurs_entree[indice]
            const hauteur = largeur * this.proportion
            const centre = { x: cible.x + cible.largeur / 2, y: cible.y + cible.hauteur / 2 }
            const { x, y } = this.placer(cible, largeur, hauteur, this.aligner(centre, cases))
            centres_x[indice] = x + largeur / 2
            centres_y[indice] = y + hauteur / 2
        }
        this.centrage = new Uint8Array(colonnes * lignes)
        const comparer = (a, b) => {
            // NaN (case sans cadrage) : comparaison fausse, rien n'est marqué.
            if (Math.hypot(centres_x[a] - centres_x[b], centres_y[a] - centres_y[b]) > this.saut_minimal) {
                this.centrage[a] = 1
                this.centrage[b] = 1
            }
        }
        for (let l = 0; l < lignes; l++) {
            for (let k = 0; k < colonnes; k++) {
                const indice = l * colonnes + k
                if (k + 1 < colonnes) comparer(indice, indice + 1)
                if (l + 1 < lignes) comparer(indice, indice + colonnes)
            }
        }
    }

    // Pour la case de coin (x, y) : { largeur, zone } avec la largeur permise pour
    // toutes ses positions valides et la zone de la plus contraignante, ou null si aucune
    // n'est valide. Les murs étant alignés sur la grille, les positions valides d'une
    // case sont toute la case, ou seulement certains de ses bords ou coins : on le
    // teste au centre, au milieu des bords et aux coins. Ne couvrir que les positions
    // valides évite d'exiger une marge qui déborderait sur le fond.
    calculer_case(x, y) {
        const moitie = this.pas / 2
        const valide = (i, j) => !this.carte.touche_mur({
            x: x + i * moitie, y: y + j * moitie, largeur: this.largeur_cible, hauteur: this.hauteur_cible,
        })
        // Positions couvertes par un point de test : un bord entier pour son milieu.
        const portee = (i) => (i === 1 ? [0, this.pas] : [i * moitie, i * moitie])
        const zone = (i, j) => {
            const [x1, x2] = portee(i)
            const [y1, y2] = portee(j)
            return this.zone_cible(x + x1, y + y1, x + x2, y + y2)
        }

        if (valide(1, 1)) {
            const zone_case = zone(1, 1)
            return { largeur: this.largeur_max(zone_case), zone: zone_case }
        }
        let resultat = null
        for (let j = 0; j <= 2; j++) {
            for (let i = 0; i <= 2; i++) {
                if (!valide(i, j)) continue
                const zone_point = zone(i, j)
                const largeur = this.largeur_max(zone_point)
                // La zone retenue est celle de la position la plus contraignante : c'est
                // elle qui impose les bords de la case.
                if (!resultat || largeur < resultat.largeur) resultat = { largeur, zone: zone_point }
            }
        }
        return resultat
    }

    // Limites que le fond impose aux vues permises de cette largeur contenant la zone :
    // l'étendue couverte par l'ensemble de ces vues, côté par côté. Un côté n'est
    // imposé que si c'est le fond qui empêche d'aller plus loin (on essaie de pousser
    // la vue la plus avancée d'un demi-pixel) ; s'il n'y a que la zone à contenir qui
    // retient la vue, il est infini.
    bords_imposes(zone, largeur) {
        const hauteur = largeur * this.proportion
        const extremes = {
            gauche: { valeur: Infinity }, droite: { valeur: -Infinity },
            haut: { valeur: Infinity }, bas: { valeur: -Infinity },
        }
        const retenir = (nom, valeur, x, y, meilleure) => {
            if (meilleure(valeur, extremes[nom].valeur)) extremes[nom] = { valeur, x, y }
        }
        const plus_petit = (a, b) => a < b
        const plus_grand = (a, b) => a > b
        this.parcourir_vues(zone, largeur, hauteur, (x1, x2, y1, y2) => {
            const x_milieu = (x1 + x2) / 2
            const y_milieu = (y1 + y2) / 2
            retenir('gauche', x1, x1, y_milieu, plus_petit)
            retenir('droite', x2, x2, y_milieu, plus_grand)
            retenir('haut', y1, x_milieu, y1, plus_petit)
            retenir('bas', y2, x_milieu, y2, plus_grand)
        })
        const { gauche, droite, haut, bas } = extremes
        // Aucune vue (ne devrait pas arriver) : rien n'est imposé.
        if (!Number.isFinite(gauche.valeur)) return { gauche: -Infinity, droit: Infinity, haut: -Infinity, bas: Infinity }
        const bloquee = (x, y) => !this.est_permise(x, y, largeur, hauteur)
        const pousse = 0.5
        return {
            gauche: bloquee(gauche.x - pousse, gauche.y) ? gauche.valeur : -Infinity,
            droit: bloquee(droite.x + pousse, droite.y) ? droite.valeur + largeur : Infinity,
            haut: bloquee(haut.x, haut.y - pousse) ? haut.valeur : -Infinity,
            bas: bloquee(bas.x, bas.y + pousse) ? bas.valeur + hauteur : Infinity,
        }
    }

    // Pour chaque case, la plus grande largeur permise dans un carré qui couvre toutes
    // les positions à moins de D de la case. Maximum glissant, ligne par ligne puis
    // colonne par colonne.
    calculer_voisinages() {
        const { colonnes, lignes } = this
        const rayon = Math.ceil(this.distance_anticipation / this.pas) + 1
        const par_ligne = new Float64Array(colonnes * lignes)
        for (let l = 0; l < lignes; l++) {
            for (let k = 0; k < colonnes; k++) {
                let maximum = 0
                for (let i = Math.max(0, k - rayon); i <= Math.min(colonnes - 1, k + rayon); i++) {
                    maximum = Math.max(maximum, this.largeurs_max[l * colonnes + i])
                }
                par_ligne[l * colonnes + k] = maximum
            }
        }
        this.largeurs_voisinage = new Float64Array(colonnes * lignes)
        for (let l = 0; l < lignes; l++) {
            for (let k = 0; k < colonnes; k++) {
                let maximum = 0
                for (let j = Math.max(0, l - rayon); j <= Math.min(lignes - 1, l + rayon); j++) {
                    maximum = Math.max(maximum, par_ligne[j * colonnes + k])
                }
                this.largeurs_voisinage[l * colonnes + k] = maximum
            }
        }
    }

    // Rectangle couvert par la cible et sa marge pour toutes les positions de
    // [x1, x2] × [y1, y2].
    zone_cible(x1, y1, x2, y2) {
        return {
            x1: x1 - this.marge,
            y1: y1 - this.marge,
            x2: x2 + this.largeur_cible + this.marge,
            y2: y2 + this.hauteur_cible + this.marge,
        }
    }

    // Plus grande largeur de vue permise contenant la zone, par dichotomie parmi les
    // candidates (une vue permise reste permise en rétrécissant autour de la zone).
    largeur_max(zone) {
        const minimum = Math.max(zone.x2 - zone.x1, (zone.y2 - zone.y1) / this.proportion)
        const candidates = this.largeurs_candidates
        let debut = candidates.findIndex((largeur) => largeur >= minimum - EPSILON)
        if (debut < 0) return minimum
        let fin = candidates.length - 1
        let trouvee = minimum
        while (debut <= fin) {
            const milieu = (debut + fin) >> 1
            if (this.existe_vue(candidates[milieu], zone)) {
                trouvee = candidates[milieu]
                debut = milieu + 1
            } else {
                fin = milieu - 1
            }
        }
        return trouvee
    }

    // Vrai si une vue de cette largeur contenant la zone est permise. On peut faire
    // glisser une vue permise vers le haut et la gauche jusqu'à ce que ses bords
    // touchent une limite de tuile ou la zone : seules ces positions sont à essayer.
    existe_vue(largeur, zone) {
        const hauteur = largeur * this.proportion
        const positions_x = this.positions_bord(zone.x1, zone.x2, largeur)
        const positions_y = this.positions_bord(zone.y1, zone.y2, hauteur)
        for (const y of positions_y) {
            for (const x of positions_x) {
                if (this.est_permise(x, y, largeur, hauteur)) return true
            }
        }
        return false
    }

    positions_bord(debut, fin, taille) {
        const minimum = fin - taille
        const positions = [minimum]
        for (let k = Math.floor(minimum / TAILLE_TUILE) + 1; k * TAILLE_TUILE <= debut; k++) {
            positions.push(k * TAILLE_TUILE)
        }
        return positions
    }
}
