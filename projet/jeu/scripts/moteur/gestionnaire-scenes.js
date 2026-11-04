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

    mettre_a_jour(delta) {
        if (!this.en_transition) this.actuelle?.mettre_a_jour(delta)
    }

    dessiner(contexte) {
        this.actuelle?.dessiner(contexte)
    }
}
