import { GestionnaireEntrees } from './gestionnaire-entrees.js'
import { GestionnaireScenes } from './gestionnaire-scenes.js'
import { ChargeurRessources } from './chargeur-ressources.js'
import { GestionnaireSauvegardes } from './gestionnaire-sauvegardes.js'
import { StockageLocal } from './stockage-local.js'
import { LumiereAmbiante } from './lumiere-ambiante.js'

// Point central du jeu : possède la boucle, les entrées, les scènes, les ressources et les sauvegardes.
// La logique tourne à pas fixe (déterministe), à configuration.simulations_par_seconde ;
// l'affichage, à chaque image, interpole entre les deux dernières simulations.
//
// Les dessins se font en pixels CSS, sur tout l'écran (largeur × hauteur). echelle :
// pixels réels du canvas par pixel CSS (densité de l'écran, plafonnée par
// configuration.pixels_max).
export class Jeu {
    constructor(ecran, configuration, configuration_entrees) {
        this.ecran = ecran
        this.contexte = ecran.getContext('2d')
        this.configuration = configuration
        this.largeur = 0
        this.hauteur = 0
        this.echelle = 1
        this.densite = 0
        this.adapter_taille()
        // Durée d'une simulation (secondes).
        this.pas = 1 / configuration.simulations_par_seconde

        this.actions = new GestionnaireEntrees(configuration_entrees, { ecran })
        this.scenes = new GestionnaireScenes()
        this.ressources = new ChargeurRessources()
        this.sauvegardes = new GestionnaireSauvegardes(new StockageLocal(configuration.prefixe_stockage))
        // Fond aux couleurs du jeu, null si désactivé.
        this.lumiere_ambiante = configuration.lumiere_ambiante ? new LumiereAmbiante(configuration.lumiere_ambiante) : null

        this.en_cours = false
        this.accumulateur = 0
        this.instant_precedent = 0
        this.ips = 0

        this.boucle = this.boucle.bind(this)
    }

    demarrer() {
        this.en_cours = true
        this.instant_precedent = performance.now()
        requestAnimationFrame(this.boucle)
    }

    arreter() {
        this.en_cours = false
    }

    boucle(instant) {
        if (!this.en_cours) return

        // Limite le delta pour éviter la « spirale de la mort » après un onglet inactif.
        const delta = Math.min((instant - this.instant_precedent) / 1000, 0.25)
        this.instant_precedent = instant
        this.ips = delta > 0 ? 1 / delta : 0

        const pas = this.pas
        this.accumulateur += delta
        while (this.accumulateur >= pas) {
            this.actions.mettre_a_jour(pas)
            this.scenes.mettre_a_jour(pas)
            this.accumulateur -= pas
        }

        // Avancement (entre 0 et 1) vers la prochaine simulation : l'affichage montre
        // l'état interpolé entre la simulation précédente et la dernière, avec un pas de retard.
        const avancement = this.accumulateur / pas
        this.adapter_taille()
        this.contexte.setTransform(this.echelle, 0, 0, this.echelle, 0, 0)
        this.contexte.clearRect(0, 0, this.largeur, this.hauteur)
        this.scenes.dessiner(this.contexte, avancement)
        if (this.configuration.debogage) this.dessiner_debogage()

        requestAnimationFrame(this.boucle)
    }

    // Suit la taille affichée du canvas et la densité de pixels (zoom du navigateur,
    // changement d'écran).
    adapter_taille() {
        const largeur = this.ecran.clientWidth
        const hauteur = this.ecran.clientHeight
        const densite = window.devicePixelRatio || 1
        if (largeur === this.largeur && hauteur === this.hauteur && densite === this.densite) return
        this.largeur = largeur
        this.hauteur = hauteur
        this.densite = densite

        const surface = Math.max(1, largeur * hauteur)
        this.echelle = Math.min(densite, Math.sqrt(this.configuration.pixels_max / surface))
        this.ecran.width = Math.max(1, Math.round(largeur * this.echelle))
        this.ecran.height = Math.max(1, Math.round(hauteur * this.echelle))
    }

    // Rectangle en pixels CSS converti en pixels réels, bords arrondis.
    en_pixels_reels({ x, y, largeur, hauteur }) {
        const e = this.echelle
        const gauche = Math.round(x * e)
        const haut = Math.round(y * e)
        return {
            x: gauche,
            y: haut,
            largeur: Math.round((x + largeur) * e) - gauche,
            hauteur: Math.round((y + hauteur) * e) - haut,
        }
    }

    dessiner_debogage() {
        const contexte = this.contexte
        contexte.fillStyle = '#0f0'
        contexte.font = '12px monospace'
        contexte.textAlign = 'left'
        contexte.textBaseline = 'top'
        contexte.fillText(`IPS : ${Math.round(this.ips)}`, 8, 8)
        contexte.fillText(`Simulations : ${this.configuration.simulations_par_seconde}/s`, 8, 22)
    }
}
