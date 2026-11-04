import { Entite } from './entite.js'
import { borner } from '../utilitaires/maths.js'

// Joueur de démonstration : se déplace avec l'action « mouvement ».
export class Joueur extends Entite {
    constructor(x, y) {
        super(x, y, 32, 32)
        this.vitesse = 250 // pixels par seconde
    }

    mettre_a_jour(delta) {
        // Manche gauche ou WASD (ZQSD en AZERTY). Le vecteur n'est pas normalisé :
        // on borne sa longueur à 1 pour que la diagonale ne soit pas plus rapide.
        const { x, y } = this.jeu.actions.valeur('mouvement')
        const longueur = Math.max(1, Math.hypot(x, y))
        this.vx = (x / longueur) * this.vitesse
        this.vy = (y / longueur) * this.vitesse

        super.mettre_a_jour(delta)

        this.x = borner(this.x, 0, this.jeu.largeur - this.largeur)
        this.y = borner(this.y, 0, this.jeu.hauteur - this.hauteur)
    }

    serialiser() {
        return { x: this.x, y: this.y }
    }

    restaurer(donnees) {
        const { x, y } = donnees ?? {}
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('position du joueur invalide')
        this.x = x
        this.y = y
    }

    dessiner(contexte) {
        contexte.fillStyle = '#4af'
        contexte.fillRect(this.x, this.y, this.largeur, this.hauteur)
    }
}
