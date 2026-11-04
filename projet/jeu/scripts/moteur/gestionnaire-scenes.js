// Gère la scène active et les transitions entre scènes.
// Pendant le chargement de la nouvelle scène, l'ancienne reste affichée mais n'est plus
// mise à jour. Si ce chargement échoue, l'ancienne scène reprend et l'erreur est propagée.
export class GestionnaireScenes {
    constructor() {
        this.actuelle = null
        this.en_transition = false
    }

    async changer(scene) {
        if (this.en_transition) return
        this.en_transition = true
        try {
            await scene.entrer()
        } finally {
            this.en_transition = false
        }
        this.actuelle?.sortir()
        this.actuelle = scene
    }

    // L'état est mémorisé à chaque simulation, même quand la scène ne change rien (pause) :
    // l'affichage interpole alors entre deux états identiques, sans trembler.
    mettre_a_jour(delta) {
        if (this.en_transition || !this.actuelle) return
        this.actuelle.memoriser_etat()
        this.actuelle.mettre_a_jour(delta)
    }

    // Pendant une transition, la scène n'est plus simulée : elle est figée sur son dernier état.
    dessiner(contexte, avancement = 1) {
        this.actuelle?.dessiner(contexte, this.en_transition ? 1 : avancement)
    }
}
