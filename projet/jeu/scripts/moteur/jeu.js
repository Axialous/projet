import { GestionnaireEntrees } from './gestionnaire-entrees.js'
import { GestionnaireScenes } from './gestionnaire-scenes.js'
import { ChargeurRessources } from './chargeur-ressources.js'
import { GestionnaireSauvegardes } from './gestionnaire-sauvegardes.js'
import { StockageLocal } from './stockage-local.js'

// Point central du jeu : possède la boucle, les entrées, les scènes, les ressources et les sauvegardes.
// La logique tourne à pas fixe (déterministe), l'affichage à chaque image.
export class Jeu {
    constructor(ecran, configuration, configuration_entrees) {
        this.ecran = ecran
        this.contexte = ecran.getContext('2d')
        this.configuration = configuration
        this.largeur = configuration.largeur
        this.hauteur = configuration.hauteur

        this.actions = new GestionnaireEntrees(configuration_entrees, { ecran })
        this.scenes = new GestionnaireScenes()
        this.ressources = new ChargeurRessources()
        this.sauvegardes = new GestionnaireSauvegardes(new StockageLocal(configuration.prefixe_stockage))

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

        const pas = this.configuration.pas_fixe
        this.accumulateur += delta
        while (this.accumulateur >= pas) {
            this.actions.mettre_a_jour(pas)
            this.scenes.mettre_a_jour(pas)
            this.accumulateur -= pas
        }

        this.contexte.clearRect(0, 0, this.largeur, this.hauteur)
        this.scenes.dessiner(this.contexte)
        if (this.configuration.debogage) this.dessiner_debogage()

        requestAnimationFrame(this.boucle)
    }

    dessiner_debogage() {
        const contexte = this.contexte
        contexte.fillStyle = '#0f0'
        contexte.font = '12px monospace'
        contexte.textAlign = 'left'
        contexte.textBaseline = 'top'
        contexte.fillText(`IPS : ${Math.round(this.ips)}`, 8, 8)
    }
}
