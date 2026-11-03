// Gère la scène active et les transitions entre scènes.
export class GestionnaireScenes {
    constructor() {
        this.actuelle = null
    }

    async changer(scene) {
        this.actuelle?.sortir()
        this.actuelle = null
        await scene.entrer()
        this.actuelle = scene
    }

    mettre_a_jour(delta) {
        this.actuelle?.mettre_a_jour(delta)
    }

    dessiner(contexte) {
        this.actuelle?.dessiner(contexte)
    }
}
