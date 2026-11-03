// Classe de base d'une scène (menu, niveau, fin de partie…).
// Surchargez les méthodes utiles dans vos scènes.
export class Scene {
    constructor(jeu) {
        this.jeu = jeu
        this.entites = []
    }

    // Appelé quand la scène devient active. Peut être async (chargement de ressources).
    entrer() {}

    // Appelé quand la scène est quittée.
    sortir() {}

    ajouter(entite) {
        entite.scene = this
        this.entites.push(entite)
        return entite
    }

    mettre_a_jour(delta) {
        for (const entite of this.entites) entite.mettre_a_jour(delta)
        this.entites = this.entites.filter((entite) => !entite.detruite)
    }

    dessiner(contexte) {
        for (const entite of this.entites) entite.dessiner(contexte)
    }
}
