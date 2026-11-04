import { Scene } from '../moteur/scene.js'
import { Menu } from '../interface/menu.js'
import { Joueur } from '../entites/joueur.js'
import { generer_graine, formater_graine } from '../utilitaires/graine.js'
import { Hasard } from '../utilitaires/hasard.js'
// Import circulaire (menu <-> partie) sans risque : SceneMenu n'est utilisé qu'à l'exécution.
import { SceneMenu } from './scene-menu.js'

// Durée d'affichage des notifications (secondes).
const DUREE_NOTIFICATION = 2.5

// Partie en cours. Sans sauvegarde, c'est une nouvelle partie, sauvegardée dès son
// initialisation ; avec { id, donnees }, la partie reprend depuis cette sauvegarde.
// Appeler sauvegarder() à chaque moment clé.
export class ScenePartie extends Scene {
    constructor(jeu, sauvegarde = null) {
        super(jeu)
        this.sauvegarde = sauvegarde
    }

    async entrer() {
        // Chargez ici les ressources du niveau, par exemple :
        // await this.jeu.ressources.charger_texture('joueur', '/textures/joueur.png')
        const { largeur, hauteur } = this.jeu
        this.joueur = this.ajouter(new Joueur(largeur / 2 - 16, hauteur / 2 - 16))
        // Menu de la partie : ouvert, il met la partie en pause.
        this.menu = null
        this.notification = null
        // Pointeur verrouillé lors de la mise à jour précédente.
        this.etait_verrouille = false
        // Temps de jeu effectif, hors pause (secondes).
        this.duree_jeu = 0
        // Graine tirée à la création de la partie, conservée par la sauvegarde.
        // Tout le hasard de la partie passe par this.hasard (voir utilitaires/hasard.js).
        this.graine = generer_graine()
        this.hasard = new Hasard(this.graine)

        this.id_sauvegarde = null
        // Les écritures s'enchaînent sans se chevaucher.
        this.sauvegardes_en_cours = Promise.resolve()

        if (this.sauvegarde) {
            // Une erreur ici annule le changement de scène : le menu principal reste affiché.
            this.restaurer(this.sauvegarde.donnees)
            this.id_sauvegarde = this.sauvegarde.id
            this.sauvegarde = null
        } else {
            // Sauvegarde initiale : la partie apparaît aussitôt dans « Charger une partie ».
            await this.sauvegarder()
        }
    }

    // --- Sauvegarde ---

    serialiser() {
        return {
            graine: this.graine,
            hasard: this.hasard.serialiser(),
            duree_jeu: this.duree_jeu,
            joueur: this.joueur.serialiser(),
        }
    }

    restaurer(donnees) {
        // Valide la graine et l'état des flux.
        this.hasard = new Hasard(donnees.graine, donnees.hasard)
        this.graine = donnees.graine
        if (!Number.isFinite(donnees.duree_jeu)) throw new Error('durée de jeu invalide')
        this.duree_jeu = donnees.duree_jeu
        this.joueur.restaurer(donnees.joueur)
    }

    // L'état est figé au moment de l'appel, même si l'écriture attend la précédente.
    // Un échec est signalé à l'écran sans interrompre la partie.
    sauvegarder() {
        const donnees = this.serialiser()
        const duree_jeu = this.duree_jeu
        this.sauvegardes_en_cours = this.sauvegardes_en_cours.then(async () => {
            try {
                this.id_sauvegarde = await this.jeu.sauvegardes.enregistrer(this.id_sauvegarde, donnees, { duree_jeu })
                this.notifier('Partie sauvegardée')
            } catch (erreur) {
                console.error(erreur)
                this.notifier(`Échec de la sauvegarde : ${erreur.message}`, true)
            }
        })
        return this.sauvegardes_en_cours
    }

    notifier(texte, erreur = false) {
        this.notification = { texte, erreur, restant: DUREE_NOTIFICATION }
    }

    // --- Mise à jour ---

    mettre_a_jour(delta) {
        if (this.notification) {
            this.notification.restant -= delta
            if (this.notification.restant <= 0) this.notification = null
        }

        const actions = this.jeu.actions

        if (!this.menu) {
            // Verrouillage perdu sans que le jeu l'ait demandé : Échap, que le navigateur
            // intercepte pour libérer le pointeur, ou changement de fenêtre.
            const verrouille = actions.pointeur_verrouille
            const verrouillage_perdu = this.etait_verrouille && !verrouille
            this.etait_verrouille = verrouille
            if (actions.vient_d_etre_activee('menu') || verrouillage_perdu) {
                this.ouvrir_menu()
                return
            }
            // Un clic dans l'écran capture la souris (mouvement relatif pour l'action « vue »).
            if (actions.vient_d_etre_activee('clic') && !verrouille) actions.verrouiller_pointeur()
            this.duree_jeu += delta
            super.mettre_a_jour(delta)
            return
        }

        // Si une même touche déclenche « menu » et « annulation », l'annulation l'emporte :
        // dans un sous-menu elle ramène au niveau précédent au lieu de fermer le menu
        // (à la racine, l'annulation ferme aussi le menu).
        if (actions.vient_d_etre_activee('menu') && !actions.vient_d_etre_activee('annulation')) {
            this.fermer_menu()
            return
        }
        this.menu.mettre_a_jour(delta)
    }

    ouvrir_menu() {
        // Le pointeur redevient visible pour utiliser le menu à la souris.
        this.etait_verrouille = false
        this.jeu.actions.liberer_pointeur()
        this.menu = new Menu(
            this.jeu,
            {
                titre: 'Pause',
                elements: [
                    { libelle: 'Reprendre', choisir: () => this.fermer_menu() },
                    { libelle: 'Menu principal', sous_menu: () => this.creer_page_quitter() },
                ],
            },
            { au_retour_racine: () => this.fermer_menu() },
        )
    }

    fermer_menu() {
        this.menu = null
    }

    creer_page_quitter() {
        return {
            titre: 'Quitter la partie ?',
            elements: [
                { libelle: 'Non', choisir: () => this.menu.revenir() },
                { libelle: 'Oui', choisir: () => this.quitter() },
            ],
        }
    }

    // Attend la fin des écritures, pour que le menu principal liste la sauvegarde à jour.
    async quitter() {
        this.jeu.actions.liberer_pointeur()
        await this.sauvegardes_en_cours
        await this.jeu.scenes.changer(new SceneMenu(this.jeu))
    }

    // --- Affichage ---

    dessiner(contexte) {
        contexte.fillStyle = '#222'
        contexte.fillRect(0, 0, this.jeu.largeur, this.jeu.hauteur)
        super.dessiner(contexte)

        contexte.font = '14px monospace'
        contexte.textAlign = 'right'
        contexte.textBaseline = 'top'
        contexte.fillStyle = '#888'
        contexte.fillText(`Graine : ${formater_graine(this.graine)}`, this.jeu.largeur - 8, 8)

        if (this.menu) {
            contexte.fillStyle = 'rgba(0, 0, 0, 0.7)'
            contexte.fillRect(0, 0, this.jeu.largeur, this.jeu.hauteur)
            this.menu.dessiner(contexte)
        }

        if (this.notification) {
            const { texte, erreur, restant } = this.notification
            contexte.globalAlpha = Math.min(1, restant / 0.5)
            contexte.font = '16px sans-serif'
            contexte.textAlign = 'right'
            contexte.textBaseline = 'bottom'
            contexte.fillStyle = erreur ? '#f66' : '#ccc'
            contexte.fillText(texte, this.jeu.largeur - 16, this.jeu.hauteur - 16)
            contexte.globalAlpha = 1
        }
    }
}
