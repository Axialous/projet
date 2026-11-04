import { CONFIGURATION } from './configuration.js'
import { Jeu } from './moteur/jeu.js'
import { SceneMenu } from './scenes/scene-menu.js'
import { charger_json } from './utilitaires/json.js'

const ecran = document.getElementById('ecran')
ecran.width = CONFIGURATION.largeur
ecran.height = CONFIGURATION.hauteur

const configuration_entrees = await charger_json('/configs/entrees.json')

const jeu = new Jeu(ecran, CONFIGURATION, configuration_entrees)
jeu.scenes.changer(new SceneMenu(jeu))
jeu.demarrer()
