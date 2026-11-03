import { Scene } from '../moteur/scene.js'
import { Joueur } from '../entites/joueur.js'
// Import circulaire (menu <-> partie) sans risque : SceneMenu n'est utilisé qu'à l'exécution.
import { SceneMenu } from './scene-menu.js'

export class ScenePartie extends Scene {
    async entrer() {
        // Chargez ici les ressources du niveau, par exemple :
        // await this.jeu.ressources.charger_texture('joueur', '/textures/joueur.png')
        const { largeur, hauteur } = this.jeu
        this.joueur = this.ajouter(new Joueur(largeur / 2 - 16, hauteur / 2 - 16))
    }

    mettre_a_jour(delta) {
        super.mettre_a_jour(delta)
        if (this.jeu.entrees.vient_d_etre_appuyee('Escape')) {
            this.jeu.scenes.changer(new SceneMenu(this.jeu))
        }
    }

    dessiner(contexte) {
        contexte.fillStyle = '#222'
        contexte.fillRect(0, 0, this.jeu.largeur, this.jeu.hauteur)
        super.dessiner(contexte)
    }
}
