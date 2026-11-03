// Objet de base du jeu : position, taille, vitesse.
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
    }

    get jeu() {
        return this.scene?.jeu
    }

    mettre_a_jour(delta) {
        this.x += this.vx * delta
        this.y += this.vy * delta
    }

    dessiner(contexte) {
        contexte.fillStyle = '#f0f'
        contexte.fillRect(this.x, this.y, this.largeur, this.hauteur)
    }

    // Marque l'entité pour suppression à la fin de la mise à jour.
    detruire() {
        this.detruite = true
    }
}
