// Carte en tuiles : une grille de sols et de murs, avec les collisions des entités.

export const TUILES = {
    MUR: 0,
    SOL: 1,
}

// Côté d'une tuile (pixels).
export const TAILLE_TUILE = 32

const COULEURS = {
    // Sol en damier, pour repérer les déplacements et le zoom.
    sol: '#3b3b46',
    sol_alterne: '#474756',
    bordure: '#5a5a6a',
}

// Couleurs de test : chaque pièce et chaque couloir a sa teinte, pour voir la lumière
// ambiante changer d'une zone à l'autre. false : le sol gris d'origine partout.
const SOLS_COLORES = true

// Couleurs de sol (normale, alternée du damier) de la zone d'indice donné (à partir de 1).
// Teintes espacées de l'angle d'or, pour que des zones d'indices voisins se distinguent.
function couleurs_zone(zone) {
    const teinte = Math.round((zone * 137.508) % 360)
    return [`hsl(${teinte}, 55%, 34%)`, `hsl(${teinte}, 55%, 40%)`]
}

export class Carte {
    // largeur et hauteur en tuiles. La carte commence entièrement en murs.
    constructor(largeur, hauteur) {
        this.largeur = largeur
        this.hauteur = hauteur
        this.tuiles = new Uint8Array(largeur * hauteur).fill(TUILES.MUR)
        // Pièces { x, y, largeur, hauteur } en tuiles, renseignées par le générateur.
        this.pieces = []
        // Zone (pièce ou couloir) de chaque tuile de sol : indice à partir de 1, 0 pour
        // aucune. Renseignées par le générateur.
        this.zones = new Uint16Array(largeur * hauteur)
        // Couleurs de sol déjà calculées, par indice de zone.
        this.couleurs_zones = []
    }

    get largeur_pixels() {
        return this.largeur * TAILLE_TUILE
    }

    get hauteur_pixels() {
        return this.hauteur * TAILLE_TUILE
    }

    // Hors de la carte, tout est mur.
    tuile(x, y) {
        if (x < 0 || y < 0 || x >= this.largeur || y >= this.hauteur) return TUILES.MUR
        return this.tuiles[y * this.largeur + x]
    }

    definir(x, y, tuile) {
        if (x < 0 || y < 0 || x >= this.largeur || y >= this.hauteur) return
        this.tuiles[y * this.largeur + x] = tuile
    }

    // Remplit un rectangle de tuiles (bornes incluses, dans n'importe quel ordre).
    remplir(x1, y1, x2, y2, tuile) {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) this.definir(x, y, tuile)
        }
    }

    zone(x, y) {
        if (x < 0 || y < 0 || x >= this.largeur || y >= this.hauteur) return 0
        return this.zones[y * this.largeur + x]
    }

    definir_zone(x, y, zone) {
        if (x < 0 || y < 0 || x >= this.largeur || y >= this.hauteur) return
        this.zones[y * this.largeur + x] = zone
    }

    // Couleurs de sol (normale, alternée) de la tuile.
    couleurs_sol(x, y) {
        const zone = SOLS_COLORES ? this.zone(x, y) : 0
        if (zone === 0) return [COULEURS.sol, COULEURS.sol_alterne]
        return (this.couleurs_zones[zone] ??= couleurs_zone(zone))
    }

    est_solide(x, y) {
        return this.tuile(x, y) === TUILES.MUR
    }

    // --- Collisions ---

    // Vrai si le rectangle { x, y, largeur, hauteur } (pixels) touche un mur.
    // Un bord posé exactement sur une limite de tuile ne déborde pas sur la suivante.
    touche_mur(rectangle) {
        const x1 = Math.floor(rectangle.x / TAILLE_TUILE)
        const y1 = Math.floor(rectangle.y / TAILLE_TUILE)
        const x2 = Math.ceil((rectangle.x + rectangle.largeur) / TAILLE_TUILE) - 1
        const y2 = Math.ceil((rectangle.y + rectangle.hauteur) / TAILLE_TUILE) - 1
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                if (this.est_solide(x, y)) return true
            }
        }
        return false
    }

    // Déplace l'entité de (dx, dy) pixels en la bloquant contre les murs.
    // Chaque axe est résolu séparément : contre un mur, l'entité glisse le long.
    // Suppose un déplacement inférieur à une tuile par appel et une entité qui
    // ne touche pas de mur au départ.
    deplacer(entite, dx, dy) {
        if (dx !== 0) {
            entite.x += dx
            if (this.touche_mur(entite)) {
                entite.x = dx > 0
                    ? Math.floor((entite.x + entite.largeur) / TAILLE_TUILE) * TAILLE_TUILE - entite.largeur
                    : (Math.floor(entite.x / TAILLE_TUILE) + 1) * TAILLE_TUILE
                entite.vx = 0
            }
        }
        if (dy !== 0) {
            entite.y += dy
            if (this.touche_mur(entite)) {
                entite.y = dy > 0
                    ? Math.floor((entite.y + entite.hauteur) / TAILLE_TUILE) * TAILLE_TUILE - entite.hauteur
                    : (Math.floor(entite.y / TAILLE_TUILE) + 1) * TAILLE_TUILE
                entite.vy = 0
            }
        }
    }

    // --- Affichage ---

    // Dessine les tuiles de la vue { x, y, largeur, hauteur, zoom } (pixels de la carte),
    // directement en pixels de l'écran : les bords arrondis des tuiles voisines
    // coïncident, sans joint par où verrait le fond.
    // Le fond (murs pleins) est laissé à la scène ; les murs qui bordent un sol sont
    // dessinés plus clairs pour marquer les contours.
    dessiner(contexte, vue) {
        const x1 = Math.max(0, Math.floor(vue.x / TAILLE_TUILE))
        const y1 = Math.max(0, Math.floor(vue.y / TAILLE_TUILE))
        const x2 = Math.min(this.largeur - 1, Math.floor((vue.x + vue.largeur) / TAILLE_TUILE))
        const y2 = Math.min(this.hauteur - 1, Math.floor((vue.y + vue.hauteur) / TAILLE_TUILE))
        const vers_ecran_x = (x) => Math.round((x * TAILLE_TUILE - vue.x) * vue.zoom)
        const vers_ecran_y = (y) => Math.round((y * TAILLE_TUILE - vue.y) * vue.zoom)
        for (let y = y1; y <= y2; y++) {
            const haut = vers_ecran_y(y)
            const bas = vers_ecran_y(y + 1)
            for (let x = x1; x <= x2; x++) {
                if (!this.est_visible(x, y)) continue
                if (this.est_solide(x, y)) contexte.fillStyle = COULEURS.bordure
                else contexte.fillStyle = this.couleurs_sol(x, y)[(x + y) % 2]
                const gauche = vers_ecran_x(x)
                contexte.fillRect(gauche, haut, vers_ecran_x(x + 1) - gauche, bas - haut)
            }
        }
    }

    // Tuile dessinée : un sol, ou un mur qui borde un sol. Les autres murs se fondent
    // dans le fond.
    est_visible(x, y) {
        return !this.est_solide(x, y) || this.borde_un_sol(x, y)
    }

    // Vrai si une des 8 tuiles voisines est un sol.
    borde_un_sol(x, y) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if ((dx !== 0 || dy !== 0) && !this.est_solide(x + dx, y + dy)) return true
            }
        }
        return false
    }
}
