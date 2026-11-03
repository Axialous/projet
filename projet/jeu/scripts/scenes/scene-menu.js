import { Scene } from '../moteur/scene.js'
import { ScenePartie } from './scene-partie.js'

export class SceneMenu extends Scene {
    mettre_a_jour(delta) {
        super.mettre_a_jour(delta)
        const entrees = this.jeu.entrees
        if (entrees.vient_d_etre_appuyee('Enter') || entrees.vient_d_etre_appuyee('Space') || entrees.souris.cliquee) {
            this.jeu.scenes.changer(new ScenePartie(this.jeu))
        }
    }

    dessiner(contexte) {
        const { largeur, hauteur } = this.jeu
        contexte.fillStyle = '#fff'
        contexte.textAlign = 'center'
        contexte.textBaseline = 'middle'
        contexte.font = 'bold 48px sans-serif'
        contexte.fillText('Mon jeu', largeur / 2, hauteur / 2 - 30)
        contexte.font = '20px sans-serif'
        contexte.fillText('Appuyez sur Entrée pour commencer', largeur / 2, hauteur / 2 + 30)
    }
}
