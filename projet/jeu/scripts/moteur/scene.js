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

    // Appelé avant chaque simulation : retient l'état à partir duquel l'affichage interpole.
    // Surchargez-le pour y ajouter ce qui s'interpole hors des entités (caméra…).
    memoriser_etat() {
        for (const entite of this.entites) entite.memoriser_etat()
    }

    mettre_a_jour(delta) {
        for (const entite of this.entites) entite.mettre_a_jour(delta)
        this.entites = this.entites.filter((entite) => !entite.detruite)
    }

    // avancement : de 0 (état de la simulation précédente) à 1 (dernière simulation).
    dessiner(contexte, avancement) {
        for (const entite of this.entites) entite.dessiner(contexte, avancement)
    }
}
