import { Entite } from './entite.js'

// Copie immobile du joueur, laissée là où il se trouvait. Chaque clone a sa propre vue.
export class Clone extends Entite {
    mettre_a_jour() {}

    serialiser() {
        return { x: this.x, y: this.y }
    }

    static restaurer(donnees, largeur, hauteur) {
        const { x, y } = donnees ?? {}
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('position de clone invalide')
        return new Clone(x, y, largeur, hauteur)
    }

    dessiner(contexte, avancement) {
        const { x, y } = this.position_affichee(avancement)
        contexte.fillStyle = '#fa4'
        contexte.fillRect(x, y, this.largeur, this.hauteur)
    }
}
