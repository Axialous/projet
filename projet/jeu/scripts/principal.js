import { CONFIGURATION } from './configuration.js'
import { Jeu } from './moteur/jeu.js'
import { SceneMenu } from './scenes/scene-menu.js'

const ecran = document.getElementById('ecran')
ecran.width = CONFIGURATION.largeur
ecran.height = CONFIGURATION.hauteur

const jeu = new Jeu(ecran, CONFIGURATION)
jeu.scenes.changer(new SceneMenu(jeu))
jeu.demarrer()
