import { Entite } from './entite.js'

// Joueur de démonstration : se déplace avec l'action « mouvement », bloqué par les
// murs de la carte de la scène.
export class Joueur extends Entite {
    constructor(x, y) {
        // Plus petit qu'une tuile, pour passer dans les couloirs sans se coincer.
        super(x, y, 24, 24)
        this.vitesse = 100 // pixels par seconde (lent, pour tester la caméra)
    }

    mettre_a_jour(delta) {
        // Manche gauche ou WASD (ZQSD en AZERTY). Le vecteur n'est pas normalisé :
        // on borne sa longueur à 1 pour que la diagonale ne soit pas plus rapide.
        const { x, y } = this.jeu.actions.valeur('mouvement')
        const longueur = Math.max(1, Math.hypot(x, y))
        this.vx = (x / longueur) * this.vitesse
        this.vy = (y / longueur) * this.vitesse

        this.scene.carte.deplacer(this, this.vx * delta, this.vy * delta)
    }

    serialiser() {
        return { x: this.x, y: this.y }
    }

    restaurer(donnees) {
        const { x, y } = donnees ?? {}
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('position du joueur invalide')
        this.placer(x, y)
    }

    dessiner(contexte, avancement) {
        const { x, y } = this.position_affichee(avancement)
        contexte.fillStyle = '#4af'
        contexte.fillRect(x, y, this.largeur, this.hauteur)
    }
}
