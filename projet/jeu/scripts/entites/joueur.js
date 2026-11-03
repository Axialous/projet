import { Entite } from './entite.js'
import { borner } from '../utilitaires/maths.js'

// Joueur de démonstration : se déplace avec les flèches ou ZQSD (WASD en QWERTY).
export class Joueur extends Entite {
    constructor(x, y) {
        super(x, y, 32, 32)
        this.vitesse = 250 // pixels par seconde
    }

    mettre_a_jour(delta) {
        const entrees = this.jeu.entrees
        let dx = 0
        let dy = 0
        // KeyboardEvent.code désigne la position physique : 'KeyA' correspond à Q en AZERTY.
        if (entrees.est_maintenue('ArrowLeft') || entrees.est_maintenue('KeyA')) dx -= 1
        if (entrees.est_maintenue('ArrowRight') || entrees.est_maintenue('KeyD')) dx += 1
        if (entrees.est_maintenue('ArrowUp') || entrees.est_maintenue('KeyW')) dy -= 1
        if (entrees.est_maintenue('ArrowDown') || entrees.est_maintenue('KeyS')) dy += 1

        // Normalise la diagonale pour garder la même vitesse.
        const longueur = Math.hypot(dx, dy) || 1
        this.vx = (dx / longueur) * this.vitesse
        this.vy = (dy / longueur) * this.vitesse

        super.mettre_a_jour(delta)

        this.x = borner(this.x, 0, this.jeu.largeur - this.largeur)
        this.y = borner(this.y, 0, this.jeu.hauteur - this.hauteur)
    }

    dessiner(contexte) {
        contexte.fillStyle = '#4af'
        contexte.fillRect(this.x, this.y, this.largeur, this.hauteur)
    }
}
