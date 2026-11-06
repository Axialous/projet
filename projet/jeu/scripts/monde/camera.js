import { TAILLE_TUILE } from './carte.js'
import { borner, interpoler } from '../utilitaires/maths.js'

const PARAMETRES = {
    // Tuiles visibles au plus sur le grand côté de la zone d'affichage (limite du dézoom).
    // Infinity : pas de limite.
    tuiles_visibles_max: Infinity,
    // Distance (tuiles, norme infinie) qu'il reste à la cible à parcourir pour être
    // entièrement sur une tuile qui limite la vue, à partir de laquelle la vue s'y
    // prépare (taille et alignement).
    distance_anticipation: 1,
    // Espace minimal (tuiles) entre la cible et les bords de la vue.
    marge: 1,
    // Écart (pixels) entre les cadrages libres de deux cases voisines au-delà duquel le
    // cadrage est considéré comme sautant : la vue s'y recentre sur la cible.
    saut_minimal: 16,
    // Pas (pixels) de la grille des positions précalculées, diviseur de TAILLE_TUILE.
    pas: 8,
}

const EPSILON = 1e-6

// Surface (tuiles) d'un cadre.
const surface = (cadre) => (cadre.droite - cadre.gauche + 1) * (cadre.bas - cadre.haut + 1)

// Caméra qui suit une cible en montrant le cadre de l'endroit où elle se trouve, sans
// jamais montrer le fond (tuiles non dessinées). La vue a une largeur et une hauteur
// libres, au plus celles de la vue maximale ; l'affichage la met à l'échelle de sa zone.
//
// Chaque tuile de sol a son cadre (voir etendre_cadre). Pour chaque case de la grille
// des positions de la cible, on précalcule celui des tuiles touchées par la cible dont
// le cadre est le plus grand : la vue en prend au plus la taille et reste entre ses
// bords. Une tuile étroite (une porte) ne limite donc la vue qu'une fois la cible
// entièrement dessus.
//
// La vue ne dépend que de la position de la cible. Chaque case q à une distance
// d < D (norme infinie, t = d / D) impose :
// - sur chaque axe, une taille qui passe géométriquement de la sienne (t = 0) à la plus
//   grande de son voisinage (t = 1) ; la vue prend la plus petite ;
// - au centre de la vue, une borne qui la pose contre les bords de q à t = 0, relâchée
//   linéairement jusqu'à t = 1.
// Ce cadrage libre peut sauter là où deux cadrages possibles sont séparés par du fond.
// Ces endroits sont repérés au précalcul ; près d'eux, la vue passe progressivement à
// une vue sur la cible, qui ne dépend que de sa position (voir composer).
//
// Le précalcul ne dépend que de la carte et de la taille des cibles : une seule caméra
// sert à toutes les cibles de même taille, chacune suivie par un SuiviCamera.
export class Camera {
    // Seules les proportions de la zone d'affichage (largeur_zone, hauteur_zone) comptent.
    constructor(carte, largeur_zone, hauteur_zone, largeur_cible, hauteur_cible, parametres = PARAMETRES) {
        this.carte = carte
        this.proportion = hauteur_zone / largeur_zone
        this.largeur_cible = largeur_cible
        this.hauteur_cible = hauteur_cible
        this.pas = parametres.pas
        this.distance_anticipation = parametres.distance_anticipation * TAILLE_TUILE
        this.marge = parametres.marge * TAILLE_TUILE
        this.saut_minimal = parametres.saut_minimal

        // Jamais plus petite que la cible et sa marge, ni plus grande que la carte.
        const echelle = parametres.tuiles_visibles_max * TAILLE_TUILE / Math.max(largeur_zone, hauteur_zone)
        this.vue_max = {
            largeur: Math.min(Math.max(largeur_zone * echelle, largeur_cible + 2 * this.marge), carte.largeur_pixels),
            hauteur: Math.min(Math.max(hauteur_zone * echelle, hauteur_cible + 2 * this.marge), carte.hauteur_pixels),
        }

        this.cumuler_fond()
        this.precalculer()
    }

    // --- Suivi ---

    // État de la vue pour la cible { x, y } (coin haut gauche), à interpoler puis passer
    // à composer.
    calculer_etat(cible) {
        const { cases, centre_cible, centre_vise, centre_libre, largeur, hauteur } = this.cadrage_libre(cible.x, cible.y)
        // Distance relative au plus proche endroit où le cadrage libre saute.
        let liberte = 1
        for (const proche of cases) if (this.centrage[proche.indice]) liberte = Math.min(liberte, proche.t)
        return { centre_cible, centre_vise, centre_libre, largeur_libre: largeur, hauteur_libre: hauteur, liberte }
    }

    // Cadrage libre pour la cible de coin (x, y) : taille et centre de la vue.
    cadrage_libre(x, y) {
        const cible = { x, y, largeur: this.largeur_cible, hauteur: this.hauteur_cible }
        const cases = this.cases_proches(cible)
        const { largeur, hauteur } = cases.length
            ? {
                largeur: Math.min(...cases.map((proche) => proche.largeur)),
                hauteur: Math.min(...cases.map((proche) => proche.hauteur)),
            }
            // Cible placée dans un mur.
            : this.taille_vue(this.etendre_cadre(this.tuiles_occupees(x, y)))
        const centre_cible = { x: x + cible.largeur / 2, y: y + cible.hauteur / 2 }
        const centre_vise = this.aligner(centre_cible, cases)
        const libre = this.placer(cible, largeur, hauteur, centre_vise)
        return {
            cases,
            centre_cible,
            centre_vise,
            centre_libre: { x: libre.x + largeur / 2, y: libre.y + hauteur / 2 },
            largeur,
            hauteur,
        }
    }

    // Vue entre la vue sur la cible (liberte = 0) et le cadrage libre (liberte = 1). La
    // vue sur la cible prend, sur chaque axe, la taille libre réduite à la boîte de la
    // cible, centrée sur le centre visé (continu, contrairement au cadrage libre), décalée
    // juste assez pour contenir la cible, puis ramenée dans la boîte.
    composer({ centre_cible, centre_vise, centre_libre, largeur_libre, hauteur_libre, liberte }) {
        const x = centre_cible.x - this.largeur_cible / 2
        const y = centre_cible.y - this.hauteur_cible / 2
        // Jamais plus grande que le cadre de la case où se trouve la cible, même entre deux
        // simulations.
        const indice = Math.floor(y / this.pas) * this.colonnes + Math.floor(x / this.pas)
        if (this.largeurs_max[indice]) {
            largeur_libre = Math.min(largeur_libre, this.largeurs_max[indice])
            hauteur_libre = Math.min(hauteur_libre, this.hauteurs_max[indice])
        }
        const boite = this.boite_cible(x, y)
        // La boîte contient la cible : les deux contraintes sont compatibles.
        const dans_boite = (centre, taille, debut, fin, debut_cible, fin_cible) => {
            const reduite = Math.min(taille, fin - debut)
            const sur_cible = borner(centre, fin_cible - reduite / 2, debut_cible + reduite / 2)
            return { centre: borner(sur_cible, debut + reduite / 2, fin - reduite / 2), taille: reduite }
        }
        const sur_cible_x = dans_boite(centre_vise.x, largeur_libre, boite.gauche, boite.droite, x, x + this.largeur_cible)
        const sur_cible_y = dans_boite(centre_vise.y, hauteur_libre, boite.haut, boite.bas, y, y + this.hauteur_cible)
        const centre = {
            x: interpoler(sur_cible_x.centre, centre_libre.x, liberte),
            y: interpoler(sur_cible_y.centre, centre_libre.y, liberte),
        }
        let largeur = sur_cible_x.taille * (largeur_libre / sur_cible_x.taille) ** liberte
        let hauteur = sur_cible_y.taille * (hauteur_libre / sur_cible_y.taille) ** liberte
        // Le cadrage libre peut déborder du cadre de la case, et la vue intermédiaire
        // montrer le fond : elle est alors réduite autour de son centre.
        const reduction = Math.min(1, this.largeur_centree(centre.x, centre.y, hauteur / largeur) / largeur)
        largeur *= reduction
        hauteur *= reduction
        return { x: centre.x - largeur / 2, y: centre.y - hauteur / 2, largeur, hauteur }
    }

    // Intersection des cadres des cases proches de la cible de coin (x, y), chacun élargi
    // de t × (D + vue maximale) : celui de la case de la cible (t = 0) est exact, donc la
    // boîte ne contient pas de fond ; à t = 1 il ne limite plus aucune vue contenant la
    // cible, donc la boîte varie continûment.
    boite_cible(x, y) {
        const boite = { gauche: -Infinity, droite: Infinity, haut: -Infinity, bas: Infinity }
        const elargissement_x = this.distance_anticipation + this.vue_max.largeur
        const elargissement_y = this.distance_anticipation + this.vue_max.hauteur
        for (const { indice, t } of this.cases_proches({ x, y })) {
            boite.gauche = Math.max(boite.gauche, this.bords_gauche[indice] - t * elargissement_x)
            boite.droite = Math.min(boite.droite, this.bords_droit[indice] + t * elargissement_x)
            boite.haut = Math.max(boite.haut, this.bords_haut[indice] - t * elargissement_y)
            boite.bas = Math.min(boite.bas, this.bords_bas[indice] + t * elargissement_y)
        }
        return boite
    }

    // Plus grande largeur d'une vue de proportions données centrée sur (x, y) sans fond
    // ni sortie de la carte : le plus petit, parmi les tuiles de fond, de
    // max(écart horizontal, écart vertical / proportion). Parcours en anneaux, arrêté
    // quand aucune tuile plus lointaine ne peut faire moins.
    largeur_centree(x, y, proportion) {
        const { carte } = this
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
        // Les tuiles de l'anneau k sont à au moins k - 1 tuiles du centre sur un axe.
        const portee = (k) => (k - 1) * TAILLE_TUILE * Math.min(1, 1 / proportion)
        for (let k = 0; portee(k) < demi_largeur; k++) {
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

    // Cases accessibles à moins de D de la cible : { indice, t, largeur, hauteur }, avec
    // la taille que chacune impose à cette distance.
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
                const hauteur_case = this.hauteurs_max[indice]
                const dx = Math.max(k * pas - x, 0, x - (k + 1) * pas)
                const dy = Math.max(l * pas - y, 0, y - (l + 1) * pas)
                // Norme infinie : sur chaque axe, la cible est à moins de D de la case.
                const distance = Math.max(dx, dy)
                if (distance >= distance_max) continue
                const t = distance / distance_max
                // Géométrique : linéaire, presque tout le changement se ferait juste
                // avant d'entrer dans la case.
                cases.push({
                    indice,
                    t,
                    largeur: largeur_case * (this.largeurs_voisinage[indice] / largeur_case) ** t,
                    hauteur: hauteur_case * (this.hauteurs_voisinage[indice] / hauteur_case) ** t,
                })
            }
        }
        return cases
    }

    // Centre visé : celui de la cible, ramené entre les bornes imposées par les bords des
    // cases proches.
    aligner(centre, cases) {
        const { pas } = this
        const bornes_x = { minimum: -Infinity, maximum: Infinity }
        const bornes_y = { minimum: -Infinity, maximum: Infinity }
        // limite : centre qui pose la vue contre le bord ; sens : 1 pour une borne
        // maximale, -1 pour une borne minimale.
        const resserrer = (bornes, libre, debut, taille_cible, limite, t, sens) => {
            const dans_case = borner(libre, debut + taille_cible / 2, debut + pas + taille_cible / 2)
            const directe = Math.max(0, sens * (libre - limite)) * t
            // Cible au-delà de q, du côté où le bord retient la vue : le décalage reste
            // celui mesuré dans q au lieu de grandir avec la distance.
            const depassement = Math.max(0, sens * (libre - dans_case)) * (1 - t)
            // Tend vers l'infini à t = 1 : une case qui sort de portée ne pèse plus, même
            // quand des bornes incompatibles sont moyennées.
            const relachement = t < 1 ? pas * t / (1 - t) : Infinity
            const borne = limite + sens * (directe + depassement + relachement)
            if (sens > 0) bornes.maximum = Math.min(bornes.maximum, borne)
            else bornes.minimum = Math.max(bornes.minimum, borne)
        }
        for (const { indice, t } of cases) {
            const debut_x = (indice % this.colonnes) * pas
            const debut_y = Math.floor(indice / this.colonnes) * pas
            const lc = this.largeur_cible
            const hc = this.hauteur_cible
            // Avec la vue qu'on aura en entrant dans q : la vue actuelle, plus grande, ne
            // tiendrait pas entre les murs d'un couloir.
            const demi_largeur = this.largeurs_entree[indice] / 2
            const demi_hauteur = this.hauteurs_entree[indice] / 2
            resserrer(bornes_x, centre.x, debut_x, lc, this.bords_gauche[indice] + demi_largeur, t, -1)
            resserrer(bornes_x, centre.x, debut_x, lc, this.bords_droit[indice] - demi_largeur, t, 1)
            resserrer(bornes_y, centre.y, debut_y, hc, this.bords_haut[indice] + demi_hauteur, t, -1)
            resserrer(bornes_y, centre.y, debut_y, hc, this.bords_bas[indice] - demi_hauteur, t, 1)
        }
        // Bornes incompatibles : on centre entre les deux.
        const ramener = (valeur, { minimum, maximum }) => minimum <= maximum
            ? borner(valeur, minimum, maximum)
            : (minimum + maximum) / 2
        return { x: ramener(centre.x, bornes_x), y: ramener(centre.y, bornes_y) }
    }

    // Coin haut gauche de la vue sans fond, contenant la cible et sa marge (à défaut, la
    // cible seule), la plus proche d'une vue centrée sur le point visé.
    placer(cible, largeur, hauteur, centre) {
        const zone = { x1: cible.x, y1: cible.y, x2: cible.x + cible.largeur, y2: cible.y + cible.hauteur }
        const zone_avec_marge = {
            x1: zone.x1 - this.marge,
            y1: zone.y1 - this.marge,
            x2: zone.x2 + this.marge,
            y2: zone.y2 + this.marge,
        }
        return this.position_proche(zone_avec_marge, largeur, hauteur, centre)
            ?? this.position_proche(zone, largeur, hauteur, centre)
            ?? { x: centre.x - largeur / 2, y: centre.y - hauteur / 2 }
    }

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

    // Appelle rappel(x1, x2, y1, y2) pour chaque rectangle de positions du coin où la vue
    // est sans fond et contient la zone. Dans un intervalle de positions, la vue recouvre
    // les mêmes tuiles : il suffit de tester son milieu.
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

    // Positions du début d'une vue de cette taille contenant [debut, fin], découpées là
    // où un de ses bords passe une limite de tuile. Chaque borne est aussi un intervalle
    // à elle seule : une vue de n tuiles n'est souvent permise que posée sur la grille.
    intervalles(debut, fin, taille) {
        const minimum = fin - taille
        const maximum = debut
        if (maximum - minimum < -EPSILON) return []
        if (maximum - minimum <= EPSILON) return [[minimum, minimum]]

        const bornes = [minimum, maximum]
        for (const decalage of [0, taille]) {
            for (let k = Math.ceil((minimum + decalage) / TAILLE_TUILE); k * TAILLE_TUILE - decalage < maximum; k++) {
                bornes.push(k * TAILLE_TUILE - decalage)
            }
        }
        bornes.sort((a, b) => a - b)

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

    // Tuiles de fond, et leur somme cumulée pour tester une vue en temps constant.
    cumuler_fond() {
        const { largeur, hauteur } = this.carte
        const ligne = largeur + 1
        this.cumul_fond = new Uint32Array(ligne * (hauteur + 1))
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

    // Vrai si la vue reste dans la carte sans recouvrir de fond.
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

    // Taille de vue et bords du cadre de chaque case (taille nulle si inaccessible).
    precalculer() {
        const { pas, carte } = this
        this.colonnes = Math.ceil(carte.largeur_pixels / pas)
        this.lignes = Math.ceil(carte.hauteur_pixels / pas)
        const taille = this.colonnes * this.lignes
        this.largeurs_max = new Float64Array(taille)
        this.hauteurs_max = new Float64Array(taille)
        this.bords_gauche = new Float64Array(taille)
        this.bords_droit = new Float64Array(taille)
        this.bords_haut = new Float64Array(taille)
        this.bords_bas = new Float64Array(taille)
        for (let l = 0; l < this.lignes; l++) {
            for (let k = 0; k < this.colonnes; k++) {
                const cadre = this.calculer_case(k * pas, l * pas)
                if (!cadre) continue
                const indice = l * this.colonnes + k
                const { largeur, hauteur } = this.taille_vue(cadre)
                this.largeurs_max[indice] = largeur
                this.hauteurs_max[indice] = hauteur
                this.bords_gauche[indice] = cadre.gauche * TAILLE_TUILE
                this.bords_droit[indice] = (cadre.droite + 1) * TAILLE_TUILE
                this.bords_haut[indice] = cadre.haut * TAILLE_TUILE
                this.bords_bas[indice] = (cadre.bas + 1) * TAILLE_TUILE
            }
        }
        this.largeurs_voisinage = this.calculer_voisinages(this.largeurs_max)
        this.hauteurs_voisinage = this.calculer_voisinages(this.hauteurs_max)

        // Taille de vue en entrant dans chaque case (la plus petite à ses quatre coins),
        // anticipation comprise : c'est avec elle que la case impose son alignement.
        this.largeurs_entree = new Float64Array(taille).fill(Infinity)
        this.hauteurs_entree = new Float64Array(taille).fill(Infinity)
        for (let indice = 0; indice < taille; indice++) {
            if (!this.largeurs_max[indice]) continue
            const x = (indice % this.colonnes) * pas
            const y = Math.floor(indice / this.colonnes) * pas
            for (const [dx, dy] of [[0, 0], [pas, 0], [0, pas], [pas, pas]]) {
                for (const proche of this.cases_proches({ x: x + dx, y: y + dy })) {
                    this.largeurs_entree[indice] = Math.min(this.largeurs_entree[indice], proche.largeur)
                    this.hauteurs_entree[indice] = Math.min(this.hauteurs_entree[indice], proche.hauteur)
                }
            }
        }
        this.reperer_sauts()
    }

    // Marque les cases entre lesquelles le cadrage libre (cible en leur point de référence,
    // voir point_case) saute de plus
    // de saut_minimal. Un écart entre deux cases voisines peut venir d'un changement
    // continu mais rapide, et un saut peut être compensé par un retour continu : dès que
    // le cadrage change, l'intervalle est resserré par dichotomie (vers la moitié où il
    // change le plus) jusqu'à 1/16 de pixel, où seul un vrai saut reste plus grand.
    reperer_sauts() {
        const { colonnes, lignes, pas } = this
        const valide = (x, y) => !this.carte.touche_mur({ x, y, largeur: this.largeur_cible, hauteur: this.hauteur_cible })
        const centres = new Array(colonnes * lignes).fill(null)
        const points = new Array(colonnes * lignes).fill(null)
        for (let indice = 0; indice < colonnes * lignes; indice++) {
            if (!this.largeurs_max[indice]) continue
            points[indice] = this.point_case((indice % colonnes) * pas, Math.floor(indice / colonnes) * pas)
            centres[indice] = this.cadrage_libre(points[indice].x, points[indice].y).centre_libre
        }
        const ecart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
        const etapes = Math.ceil(Math.log2(pas * 16))
        const saute = (a, b, centre_a, centre_b) => {
            for (let etape = 0; etape < etapes; etape++) {
                if (ecart(centre_a, centre_b) < EPSILON) return false
                const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                // Passage impossible entre les deux : on le traite comme un saut.
                if (!valide(milieu.x, milieu.y)) return true
                const centre_milieu = this.cadrage_libre(milieu.x, milieu.y).centre_libre
                if (ecart(centre_a, centre_milieu) >= ecart(centre_milieu, centre_b)) {
                    b = milieu
                    centre_b = centre_milieu
                } else {
                    a = milieu
                    centre_a = centre_milieu
                }
            }
            return ecart(centre_a, centre_b) > this.saut_minimal
        }
        this.centrage = new Uint8Array(colonnes * lignes)
        const comparer = (a, b) => {
            if (!centres[a] || !centres[b]) return
            if (saute(points[a], points[b], centres[a], centres[b])) {
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

    // Point de référence de la case de coin (x, y) : son centre, ou null si la cible ne
    // peut pas y être. Quand les dimensions de la cible sont des multiples du pas, les
    // murs ne bordent les positions valides que sur des limites de case : l'intérieur
    // d'une case est entièrement valide ou entièrement invalide, et les tuiles touchées
    // y sont les mêmes partout. (Les bords valides d'une case invalide appartiennent
    // aussi à une case voisine valide.)
    point_case(x, y) {
        const point = { x: x + this.pas / 2, y: y + this.pas / 2 }
        if (this.carte.touche_mur({ ...point, largeur: this.largeur_cible, hauteur: this.hauteur_cible })) return null
        return point
    }

    // Cadre de la case de coin (x, y) : le plus grand des cadres des tuiles touchées par
    // la cible en son point de référence, ou null si elle ne peut pas y être.
    calculer_case(x, y) {
        const point = this.point_case(x, y)
        if (!point) return null
        const { gauche, haut, droite, bas } = this.tuiles_occupees(point.x, point.y)
        let plus_grand = null
        for (let ligne = haut; ligne <= bas; ligne++) {
            for (let colonne = gauche; colonne <= droite; colonne++) {
                const cadre = this.cadre_tuile(colonne, ligne)
                if (!plus_grand || surface(cadre) > surface(plus_grand)) plus_grand = cadre
            }
        }
        return plus_grand
    }

    cadre_tuile(colonne, ligne) {
        const indice = ligne * this.carte.largeur + colonne
        this.cadres_tuiles ??= new Map()
        if (!this.cadres_tuiles.has(indice)) {
            this.cadres_tuiles.set(indice, this.etendre_cadre({ gauche: colonne, droite: colonne, haut: ligne, bas: ligne }))
        }
        return this.cadres_tuiles.get(indice)
    }

    // Tuiles (bornes incluses) occupées par la cible de coin (x, y).
    tuiles_occupees(x, y) {
        return {
            gauche: Math.floor(x / TAILLE_TUILE),
            haut: Math.floor(y / TAILLE_TUILE),
            droite: Math.ceil((x + this.largeur_cible) / TAILLE_TUILE) - 1,
            bas: Math.ceil((y + this.hauteur_cible) / TAILLE_TUILE) - 1,
        }
    }

    // Étend le cadre (tuiles, bornes incluses) d'une tuile par côté et par tour. Les
    // quatre côtés décident ensemble, d'après le cadre du début du tour, pour que le
    // résultat ne dépende pas d'un ordre entre eux. Chaque côté examine la ligne juste
    // au-delà de lui :
    // - avec du fond (ou hors de la carte), il s'arrête sans s'étendre ;
    // - sinon il s'étend, et s'arrête si elle contient un mur. Les extrémités de la ligne
    //   qui prolongent un côté perpendiculaire déjà arrêté ne comptent pas : c'est le mur
    //   de ce côté-là, qui se prolonge dans l'angle.
    // Deux côtés voisins qui s'étendent ensemble couvrent aussi la tuile d'angle : si
    // c'est du fond, ils s'arrêtent tous les deux sans s'étendre.
    etendre_cadre(depart) {
        const { carte } = this
        const cadre = { ...depart }
        const arrete = { haut: false, droite: false, bas: false, gauche: false }
        const est_fond = (i, j) => i < 0 || j < 0 || i >= carte.largeur || j >= carte.hauteur || this.fond[j * carte.largeur + i] === 1
        const COTES = {
            haut: { horizontale: true, sens: -1, debut: 'gauche', fin: 'droite' },
            droite: { horizontale: false, sens: 1, debut: 'haut', fin: 'bas' },
            bas: { horizontale: true, sens: 1, debut: 'gauche', fin: 'droite' },
            gauche: { horizontale: false, sens: -1, debut: 'haut', fin: 'bas' },
        }
        const ANGLES = [['haut', 'gauche'], ['haut', 'droite'], ['bas', 'gauche'], ['bas', 'droite']]
        while (!(arrete.haut && arrete.droite && arrete.bas && arrete.gauche)) {
            const decisions = {}
            for (const [cote, { horizontale, sens, debut, fin }] of Object.entries(COTES)) {
                if (arrete[cote]) continue
                const position = cadre[cote] + sens
                let fond = false
                let mur = false
                for (let k = cadre[debut]; k <= cadre[fin]; k++) {
                    const [i, j] = horizontale ? [k, position] : [position, k]
                    if (est_fond(i, j)) fond = true
                    const extremite = (k === cadre[debut] && arrete[debut]) || (k === cadre[fin] && arrete[fin])
                    if (!extremite && carte.est_solide(i, j)) mur = true
                }
                decisions[cote] = fond ? null : { position, mur }
            }
            for (const [vertical, horizontal] of ANGLES) {
                if (!decisions[vertical] || !decisions[horizontal]) continue
                if (est_fond(decisions[horizontal].position, decisions[vertical].position)) {
                    decisions[vertical] = null
                    decisions[horizontal] = null
                }
            }
            for (const cote of Object.keys(COTES)) {
                if (arrete[cote]) continue
                const decision = decisions[cote]
                if (!decision) {
                    arrete[cote] = true
                    continue
                }
                cadre[cote] = decision.position
                if (decision.mur) arrete[cote] = true
            }
        }
        return cadre
    }

    // Taille du cadre (pixels), réduite à la vue maximale.
    taille_vue(cadre) {
        return {
            largeur: Math.min((cadre.droite - cadre.gauche + 1) * TAILLE_TUILE, this.vue_max.largeur),
            hauteur: Math.min((cadre.bas - cadre.haut + 1) * TAILLE_TUILE, this.vue_max.hauteur),
        }
    }

    // Maximum des valeurs dans un carré couvrant toutes les positions à moins de D de
    // chaque case (maximum glissant par lignes puis par colonnes).
    calculer_voisinages(valeurs) {
        const { colonnes, lignes } = this
        const rayon = Math.ceil(this.distance_anticipation / this.pas) + 1
        const par_ligne = new Float64Array(colonnes * lignes)
        for (let l = 0; l < lignes; l++) {
            for (let k = 0; k < colonnes; k++) {
                let maximum = 0
                for (let i = Math.max(0, k - rayon); i <= Math.min(colonnes - 1, k + rayon); i++) {
                    maximum = Math.max(maximum, valeurs[l * colonnes + i])
                }
                par_ligne[l * colonnes + k] = maximum
            }
        }
        const voisinages = new Float64Array(colonnes * lignes)
        for (let l = 0; l < lignes; l++) {
            for (let k = 0; k < colonnes; k++) {
                let maximum = 0
                for (let j = Math.max(0, l - rayon); j <= Math.min(lignes - 1, l + rayon); j++) {
                    maximum = Math.max(maximum, par_ligne[j * colonnes + k])
                }
                voisinages[l * colonnes + k] = maximum
            }
        }
        return voisinages
    }
}

// Suivi d'une cible par une caméra : états de la dernière simulation et de la précédente,
// interpolés à l'affichage.
export class SuiviCamera {
    constructor(camera, cible) {
        this.camera = camera
        this.cible = cible
        this.etat = null
        this.precedente = null
    }

    // À appeler à chaque mise à jour ; immediat supprime la transition à l'affichage.
    suivre(immediat = false) {
        this.etat = this.camera.calculer_etat(this.cible)
        if (immediat) this.precedente = null
    }

    // À appeler avant chaque simulation.
    memoriser_etat() {
        this.precedente = this.etat
    }

    // Vue { x, y, largeur, hauteur } (pixels de la carte) entre la simulation précédente
    // (avancement 0) et la dernière (1), recomposée depuis l'état interpolé.
    vue_affichee(avancement) {
        const precedente = this.precedente ?? this.etat
        const actuel = this.etat
        const point = (a, b) => ({ x: interpoler(a.x, b.x, avancement), y: interpoler(a.y, b.y, avancement) })
        const geometrique = (a, b) => a * (b / a) ** avancement
        return this.camera.composer({
            centre_cible: point(precedente.centre_cible, actuel.centre_cible),
            centre_vise: point(precedente.centre_vise, actuel.centre_vise),
            centre_libre: point(precedente.centre_libre, actuel.centre_libre),
            largeur_libre: geometrique(precedente.largeur_libre, actuel.largeur_libre),
            hauteur_libre: geometrique(precedente.hauteur_libre, actuel.hauteur_libre),
            liberte: interpoler(precedente.liberte, actuel.liberte, avancement),
        })
    }
}
