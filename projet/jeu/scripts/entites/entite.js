import { interpoler } from '../utilitaires/maths.js'

// Objet de base du jeu : position, taille, vitesse.
// La position est celle de la simulation ; l'affichage utilise position_affichee(avancement),
// interpolée depuis la position de la simulation précédente.
export class Entite {
    constructor(x = 0, y = 0, largeur = 32, hauteur = 32) {
        this.x = x
        this.y = y
        this.largeur = largeur
        this.hauteur = hauteur
        this.vx = 0
        this.vy = 0
        this.detruite = false
        this.scene = null
        // Position avant la dernière simulation (null : pas d'interpolation, affichée telle quelle).
        this.precedente = null
    }

    get jeu() {
        return this.scene?.jeu
    }

    mettre_a_jour(delta) {
        this.x += this.vx * delta
        this.y += this.vy * delta
    }

    memoriser_etat() {
        this.precedente = { x: this.x, y: this.y }
    }

    // Déplacement instantané (apparition, téléportation) : affiché sans glisser jusqu'à
    // la nouvelle position.
    placer(x, y) {
        this.x = x
        this.y = y
        this.precedente = null
    }

    position_affichee(avancement) {
        if (!this.precedente) return { x: this.x, y: this.y }
        return {
            x: interpoler(this.precedente.x, this.x, avancement),
            y: interpoler(this.precedente.y, this.y, avancement),
        }
    }

    dessiner(contexte, avancement) {
        const { x, y } = this.position_affichee(avancement)
        contexte.fillStyle = '#f0f'
        contexte.fillRect(x, y, this.largeur, this.hauteur)
    }

    // Marque l'entité pour suppression à la fin de la mise à jour.
    detruire() {
        this.detruite = true
    }
}
