import { Scene } from '../moteur/scene.js'
import { Menu } from '../interface/menu.js'
import { Joueur } from '../entites/joueur.js'
import { Clone } from '../entites/clone.js'
import { generer_graine, formater_graine } from '../utilitaires/graine.js'
import { Hasard } from '../utilitaires/hasard.js'
import { generer_carte, position_depart } from '../monde/generateur-carte.js'
import { TAILLE_TUILE } from '../monde/carte.js'
import { Camera, SuiviCamera } from '../monde/camera.js'
// Import circulaire (menu <-> partie) sans risque : SceneMenu n'est utilisé qu'à l'exécution.
import { SceneMenu } from './scene-menu.js'

// Durée d'affichage des notifications (secondes).
const DUREE_NOTIFICATION = 2.5
// Stabilité (secondes) des proportions de l'écran avant de reconstruire la
// caméra, dont le précalcul ne doit pas se répéter pendant un redimensionnement.
const DELAI_RECONSTRUCTION_CAMERA = 0.5
const TOLERANCE_PROPORTION = 1e-3

const COULEURS = {
    // Hors des cadres des caméras, et vers où s'estompent leurs bords, quand la lumière
    // ambiante est désactivée ou pas encore prête.
    bandes: '#000000',
    // La masse des murs.
    fond: '#16161c',
}

// Arrêts des dégradés d'estompage, du contour (0 : noir, tout fond) à une tuile de lui
// (1 : blanc, intact). Le mélange se fait sur les valeurs sRGB, où le premier tiers d'un
// dégradé linéaire paraît déjà noir. L'opacité suit donc, en lumière (valeur sRGB
// ^ 2,2), une courbe en S : plate au contour, sans marquer de ligne, puis visible sur
// toute la tuile.
const ARRETS_ESTOMPAGE = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16
    const gris = Math.round(255 * (t * t * (3 - 2 * t)) ** (1 / 2.2))
    return [t, `rgb(${gris}, ${gris}, ${gris})`]
})

function ajouter_arrets_estompage(degrade) {
    for (const [position, couleur] of ARRETS_ESTOMPAGE) degrade.addColorStop(position, couleur)
}

// Met la vue (pixels de la carte) à l'échelle de la zone (pixels réels), et la centre,
// en laissant autour, sur l'axe le plus serré, une marge (pixels de la carte) mise à la
// même échelle : la vue agrandie de la marge de chaque côté remplit la zone. Le cadre est
// arrondi aux pixels entiers, et la vue ajustée pour le remplir exactement.
function placer_cadre(vue, zone, marge) {
    const zoom = Math.min(zone.largeur / (vue.largeur + 2 * marge), zone.hauteur / (vue.hauteur + 2 * marge))
    const largeur = Math.max(1, Math.floor(vue.largeur * zoom + 1e-6))
    const hauteur = Math.max(1, Math.floor(vue.hauteur * zoom + 1e-6))
    const largeur_vue = largeur / zoom
    const hauteur_vue = hauteur / zoom
    return {
        cadre: {
            x: zone.x + Math.floor((zone.largeur - largeur) / 2),
            y: zone.y + Math.floor((zone.hauteur - hauteur) / 2),
            largeur,
            hauteur,
        },
        vue: {
            x: vue.x + (vue.largeur - largeur_vue) / 2,
            y: vue.y + (vue.hauteur - hauteur_vue) / 2,
            largeur: largeur_vue,
            hauteur: hauteur_vue,
            zoom,
        },
    }
}

// Décalages, sur un axe, qui ramènent à ecart_max au plus chaque vide entre les
// intervalles [debut, fin] : un intervalle est décalé de la somme des réductions des vides
// qui le précèdent. Des intervalles qui se recouvrent ont le même décalage.
function resserrer(intervalles, ecart_max) {
    const ordre = intervalles.map((_, i) => i).sort((a, b) => intervalles[a].debut - intervalles[b].debut)
    const decalages = new Array(intervalles.length)
    let decalage = 0
    let fin = intervalles[ordre[0]].debut
    for (const i of ordre) {
        const { debut, fin: fin_intervalle } = intervalles[i]
        if (debut - fin > ecart_max) decalage += debut - fin - ecart_max
        decalages[i] = decalage
        fin = Math.max(fin, fin_intervalle)
    }
    return decalages
}

// Rectangle qui englobe les vues.
function englober(vues) {
    const gauche = Math.min(...vues.map((vue) => vue.x))
    const haut = Math.min(...vues.map((vue) => vue.y))
    const droite = Math.max(...vues.map((vue) => vue.x + vue.largeur))
    const bas = Math.max(...vues.map((vue) => vue.y + vue.hauteur))
    return { x: gauche, y: haut, largeur: droite - gauche, hauteur: bas - haut }
}

// Partie en cours. Sans sauvegarde, c'est une nouvelle partie, sauvegardée dès son
// initialisation ; avec { id, donnees }, la partie reprend depuis cette sauvegarde.
// Appeler sauvegarder() à chaque moment clé.
export class ScenePartie extends Scene {
    constructor(jeu, sauvegarde = null) {
        super(jeu)
        this.sauvegarde = sauvegarde
    }

    async entrer() {
        // La lumière ambiante ne doit pas reprendre les couleurs d'une partie précédente.
        this.jeu.lumiere_ambiante?.effacer()
        // Chargez ici les ressources du niveau, par exemple :
        // await this.jeu.ressources.charger_texture('joueur', '/textures/joueur.png')
        // Placé une fois la carte générée, ou restauré depuis la sauvegarde.
        this.joueur = this.ajouter(new Joueur(0, 0))
        // Clones, du plus ancien au plus récent.
        this.clones = []
        this.carte = null
        // Une caméra partagée, et un suivi par corps : le joueur puis chaque clone.
        this.camera = null
        this.suivis = [new SuiviCamera(null, this.joueur)]
        // Voir surveiller_proportions.
        this.duree_proportion_changee = 0
        this.largeur_surveillee = 0
        this.hauteur_surveillee = 0
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
            this.creer_monde(this.graine)
            this.placer_joueur_au_depart()
            this.suivre_tous(true)
            // Sauvegarde initiale : la partie apparaît aussitôt dans « Charger une partie ».
            await this.sauvegarder()
        }
    }

    // La carte ne dépend que de la graine : elle n'est pas sauvegardée mais régénérée.
    // Son flux est tiré d'un Hasard neuf, pour ne pas dépendre de l'état restauré.
    creer_monde(graine) {
        this.carte = generer_carte(new Hasard(graine).flux('carte'))
        this.creer_camera()
    }

    creer_camera() {
        const { largeur, hauteur } = this.jeu
        this.camera = new Camera(this.carte, Math.max(1, largeur), Math.max(1, hauteur), this.joueur.largeur, this.joueur.hauteur)
        for (const suivi of this.suivis) suivi.camera = this.camera
        this.duree_proportion_changee = 0
    }

    suivre_tous(immediat = false) {
        for (const suivi of this.suivis) suivi.suivre(immediat)
    }

    // --- Clones ---

    // Les clones ont la taille du joueur : la caméra leur sert aussi.
    ajouter_clone(clone) {
        this.ajouter(clone)
        this.clones.push(clone)
        const suivi = new SuiviCamera(this.camera, clone)
        suivi.suivre(true)
        this.suivis.push(suivi)
    }

    supprimer_plus_ancien_clone() {
        const clone = this.clones.shift()
        if (!clone) return
        clone.detruire()
        this.suivis = this.suivis.filter((suivi) => suivi.cible !== clone)
    }

    // Reconstruit la caméra une fois les nouvelles proportions de l'écran
    // stabilisées ; en attendant, l'ancienne reste utilisable.
    surveiller_proportions(delta) {
        const { largeur, hauteur } = this.jeu
        if (largeur <= 0 || hauteur <= 0) return
        const ecart = Math.abs(hauteur / largeur / this.camera.proportion - 1)
        if (ecart <= TOLERANCE_PROPORTION) {
            this.duree_proportion_changee = 0
            return
        }
        if (largeur !== this.largeur_surveillee || hauteur !== this.hauteur_surveillee) {
            this.largeur_surveillee = largeur
            this.hauteur_surveillee = hauteur
            this.duree_proportion_changee = 0
            return
        }
        this.duree_proportion_changee += delta
        if (this.duree_proportion_changee < DELAI_RECONSTRUCTION_CAMERA) return
        this.creer_camera()
        this.suivre_tous(true)
    }

    placer_joueur_au_depart() {
        const { x, y } = position_depart(this.carte, this.joueur.largeur, this.joueur.hauteur)
        this.joueur.placer(x, y)
    }

    // --- Sauvegarde ---

    serialiser() {
        return {
            graine: this.graine,
            hasard: this.hasard.serialiser(),
            duree_jeu: this.duree_jeu,
            joueur: this.joueur.serialiser(),
            clones: this.clones.map((clone) => clone.serialiser()),
        }
    }

    restaurer(donnees) {
        // Valide la graine et l'état des flux.
        this.hasard = new Hasard(donnees.graine, donnees.hasard)
        this.graine = donnees.graine
        if (!Number.isFinite(donnees.duree_jeu)) throw new Error('durée de jeu invalide')
        this.duree_jeu = donnees.duree_jeu
        this.creer_monde(this.graine)
        this.joueur.restaurer(donnees.joueur)
        // Sauvegarde d'une version précédente de la carte : le joueur serait dans un mur.
        if (this.carte.touche_mur(this.joueur)) this.placer_joueur_au_depart()
        for (const donnees_clone of donnees.clones ?? []) {
            const clone = Clone.restaurer(donnees_clone, this.joueur.largeur, this.joueur.hauteur)
            if (!this.carte.touche_mur(clone)) this.ajouter_clone(clone)
        }
        this.suivre_tous(true)
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

    memoriser_etat() {
        super.memoriser_etat()
        for (const suivi of this.suivis) suivi.memoriser_etat()
    }

    mettre_a_jour(delta) {
        this.surveiller_proportions(delta)
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
            if (actions.vient_d_etre_activee('saut')) {
                this.ajouter_clone(new Clone(this.joueur.x, this.joueur.y, this.joueur.largeur, this.joueur.hauteur))
            }
            if (actions.vient_d_etre_activee('furtivite')) this.supprimer_plus_ancien_clone()
            super.mettre_a_jour(delta)
            this.suivre_tous()
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

    dessiner(contexte, avancement) {
        this.dessiner_fond(contexte)
        this.dessiner_monde(contexte, avancement)

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
            // Fondu continu entre deux simulations.
            const restant_affiche = restant - avancement * this.jeu.pas
            contexte.globalAlpha = Math.max(0, Math.min(1, restant_affiche / 0.5))
            contexte.font = '16px sans-serif'
            contexte.textAlign = 'right'
            contexte.textBaseline = 'bottom'
            contexte.fillStyle = erreur ? '#f66' : '#ccc'
            contexte.fillText(texte, this.jeu.largeur - 16, this.jeu.hauteur - 16)
            contexte.globalAlpha = 1
        }
    }

    // La lumière ambiante, si elle est active et a déjà capturé une image.
    fond_ambiant() {
        return this.jeu.lumiere_ambiante?.prete ? this.jeu.lumiere_ambiante : null
    }

    // Fond de tout l'écran, hors des cadres : la lumière ambiante, capturée à l'image
    // précédente (une image de retard, invisible), ou à défaut la couleur des bandes.
    // (x, y) : position, en pixels réels de l'écran, du coin du canvas où l'on dessine.
    dessiner_fond(contexte, x = 0, y = 0) {
        const ambiante = this.fond_ambiant()
        if (ambiante) {
            ambiante.dessiner(contexte, x, y)
            return
        }
        contexte.save()
        contexte.setTransform(1, 0, 0, 1, 0, 0)
        contexte.fillStyle = COULEURS.bandes
        contexte.fillRect(0, 0, contexte.canvas.width, contexte.canvas.height)
        contexte.restore()
    }

    // Une seule vue, qui englobe les cadres de tous les corps : seuls ces cadres sont
    // visibles, chacun à sa place dans la carte, les vides entre eux ramenés à une tuile au
    // plus sur chaque axe. En pixels réels, pour que les bords des tuiles tombent sur des
    // pixels entiers.
    dessiner_monde(contexte, avancement) {
        const zone = this.jeu.en_pixels_reels({ x: 0, y: 0, largeur: this.jeu.largeur, hauteur: this.jeu.hauteur })
        if (zone.largeur <= 0 || zone.hauteur <= 0) return
        const vues = this.suivis.map((suivi) => suivi.vue_affichee(avancement))
        const decalages_x = resserrer(vues.map((v) => ({ debut: v.x, fin: v.x + v.largeur })), TAILLE_TUILE)
        const decalages_y = resserrer(vues.map((v) => ({ debut: v.y, fin: v.y + v.hauteur })), TAILLE_TUILE)
        // Positions des cadres dans la vue d'ensemble (carte resserrée).
        const resserrees = vues.map((v, i) => ({ ...v, x: v.x - decalages_x[i], y: v.y - decalages_y[i] }))
        // Une tuile de marge entre les cadres et les bords de l'écran.
        const { cadre, vue } = placer_cadre(englober(resserrees), zone, TAILLE_TUILE)
        const vers_cadre_x = (x) => Math.round((x - vue.x) * vue.zoom)
        const vers_cadre_y = (y) => Math.round((y - vue.y) * vue.zoom)
        // Bords des cadres (pixels de la vue d'ensemble).
        const bords = resserrees.map(({ x, y, largeur, hauteur }) => ({
            gauche: vers_cadre_x(x),
            haut: vers_cadre_y(y),
            droite: vers_cadre_x(x + largeur),
            bas: vers_cadre_y(y + hauteur),
        }))
        // La vue d'ensemble ramenée dans la carte, pour chaque cadre.
        const vues_cadres = bords.map((_, i) => ({ ...vue, x: vue.x + decalages_x[i], y: vue.y + decalages_y[i] }))
        // cible : contexte où dessiner, dont la transformation de base, (echelle_x, 0, 0,
        // echelle_y, 0, 0), convertit les pixels réels de l'écran (1 pour l'écran même).
        const dans_cadre = (i, dessin, cible = contexte, echelle_x = 1, echelle_y = 1) => {
            const bord = bords[i]
            cible.save()
            cible.setTransform(echelle_x, 0, 0, echelle_y, cadre.x * echelle_x, cadre.y * echelle_y)
            cible.beginPath()
            cible.rect(bord.gauche, bord.haut, bord.droite - bord.gauche, bord.bas - bord.haut)
            cible.clip()
            dessin(vues_cadres[i], cible)
            cible.restore()
        }
        const dessiner_entites = (vue_cadre, cible) => {
            cible.transform(vue.zoom, 0, 0, vue.zoom, -vue_cadre.x * vue.zoom, -vue_cadre.y * vue.zoom)
            super.dessiner(cible, avancement)
        }
        // La carte de chaque cadre, puis l'estompage du contour de leur réunion, puis les
        // entités par-dessus.
        bords.forEach((_, i) => dans_cadre(i, (vue_cadre) => {
            contexte.fillStyle = COULEURS.fond
            contexte.fillRect(0, 0, cadre.largeur, cadre.hauteur)
            this.carte.dessiner(contexte, vue_cadre)
        }))
        // Capture pour la lumière ambiante : la carte avant estompage, sans quoi ses bords,
        // déjà mêlés au fond (assombri) de l'image précédente, l'assombriraient encore d'image
        // en image, et les sols s'estomperaient vers le noir. Les entités y sont ajoutées.
        const ambiante = this.jeu.lumiere_ambiante
        const capture = ambiante?.commencer_capture(contexte.canvas)
        this.appliquer_estompage(contexte, cadre, bords, vues_cadres)
        bords.forEach((_, i) => dans_cadre(i, dessiner_entites))
        if (capture) {
            const { a: echelle_x, d: echelle_y } = capture.getTransform()
            bords.forEach((_, i) => dans_cadre(i, dessiner_entites, capture, echelle_x, echelle_y))
            ambiante.terminer_capture(bords.map((bord) => ({
                x: cadre.x + bord.gauche,
                y: cadre.y + bord.haut,
                largeur: bord.droite - bord.gauche,
                hauteur: bord.bas - bord.haut,
            })))
        }
    }

    // Mélange la vue d'ensemble avec le fond (voir dessiner_fond) selon le masque d'estompage :
    // image × masque + fond × (1 − masque). Le masque vaut 1 − opacité, en niveaux de gris.
    appliquer_estompage(contexte, cadre, bords, vues_cadres) {
        const canevas = (nom) => {
            this[nom] ??= new OffscreenCanvas(1, 1)
            if (this[nom].width !== cadre.largeur || this[nom].height !== cadre.hauteur) {
                this[nom].width = cadre.largeur
                this[nom].height = cadre.hauteur
            }
            return this[nom].getContext('2d')
        }
        const masque = canevas('canevas_masque')
        masque.globalCompositeOperation = 'source-over'
        masque.fillStyle = '#fff'
        masque.fillRect(0, 0, cadre.largeur, cadre.hauteur)
        // Le plus sombre l'emporte : là où des dégradés se superposent, l'opacité est celle
        // du plus proche bord, sans cumul, ce qui la garde continue.
        masque.globalCompositeOperation = 'darken'
        this.estomper_bords(masque, bords, vues_cadres)

        contexte.save()
        contexte.setTransform(1, 0, 0, 1, cadre.x, cadre.y)
        contexte.globalCompositeOperation = 'multiply'
        contexte.drawImage(masque.canvas, 0, 0)
        if (this.fond_ambiant() || COULEURS.bandes !== '#000000') {
            // Fond × (1 − masque), ajouté à l'image.
            const fond = canevas('canevas_fond_estompe')
            fond.globalCompositeOperation = 'source-over'
            fond.fillStyle = '#fff'
            fond.fillRect(0, 0, cadre.largeur, cadre.hauteur)
            fond.globalCompositeOperation = 'difference'
            fond.drawImage(masque.canvas, 0, 0)
            fond.globalCompositeOperation = 'multiply'
            this.dessiner_fond(fond, cadre.x, cadre.y)
            contexte.globalCompositeOperation = 'lighter'
            contexte.drawImage(fond.canvas, 0, 0)
        }
        contexte.restore()
    }

    // Dessine dans le masque (blanc : intact, noir : fond) l'estompage des sols à moins
    // d'une tuile du contour de la réunion des cadres, en dégradé jusqu'au contour : des
    // cadres qui se recouvrent ou se touchent n'ont pas de bord entre eux. Une bande de largeur fixe, plutôt que les seules tuiles coupées par le
    // contour, varie sans à-coup quand le contour se déplace.
    //
    // Les bords des cadres découpent la vue en cellules, chacune dans la réunion ou hors
    // d'elle. Pour une cellule de la réunion, on cherche sur chaque axe où l'on en sort, en
    // passant de cellule en cellule : le dégradé part de là. En face d'un angle rentrant,
    // la sortie la plus proche est en diagonale, vers l'angle : un dégradé circulaire
    // centré sur l'angle prolonge ceux des deux bords qui le forment.
    estomper_bords(contexte, bords, vues_cadres) {
        const bande = Math.max(1, Math.round(TAILLE_TUILE * vues_cadres[0].zoom))
        const uniques = (valeurs) => [...new Set(valeurs)].sort((a, b) => a - b)
        const xs = uniques(bords.flatMap((bord) => [bord.gauche, bord.droite]))
        const ys = uniques(bords.flatMap((bord) => [bord.haut, bord.bas]))
        // Cadre qui couvre chaque cellule (-1 : hors de la réunion). Des cadres qui se
        // recouvrent ont le même décalage : n'importe lequel convient.
        const couvrant = (c, r) => {
            const x = (xs[c] + xs[c + 1]) / 2
            const y = (ys[r] + ys[r + 1]) / 2
            return bords.findIndex((bord) => x > bord.gauche && x < bord.droite && y > bord.haut && y < bord.bas)
        }
        const cellules = ys.slice(0, -1).map((_, r) => xs.slice(0, -1).map((_, c) => couvrant(c, r)))
        const dedans = (c, r) => r >= 0 && r < cellules.length && c >= 0 && c < cellules[r].length && cellules[r][c] >= 0
        const sortie = (c, r, dc, dr) => {
            while (dedans(c + dc, r + dr)) {
                c += dc
                r += dr
            }
            return dc ? xs[c + (dc > 0 ? 1 : 0)] : ys[r + (dr > 0 ? 1 : 0)]
        }
        cellules.forEach((ligne, r) => ligne.forEach((i, c) => {
            if (i < 0) return
            const cellule = { gauche: xs[c], droite: xs[c + 1], haut: ys[r], bas: ys[r + 1] }
            const gauche = sortie(c, r, -1, 0)
            const droite = sortie(c, r, 1, 0)
            const haut = sortie(c, r, 0, -1)
            const bas = sortie(c, r, 0, 1)
            const cotes = [
                { zone: { ...cellule, droite: Math.min(cellule.droite, gauche + bande) }, debut: [gauche, 0], fin: [gauche + bande, 0] },
                { zone: { ...cellule, gauche: Math.max(cellule.gauche, droite - bande) }, debut: [droite, 0], fin: [droite - bande, 0] },
                { zone: { ...cellule, bas: Math.min(cellule.bas, haut + bande) }, debut: [0, haut], fin: [0, haut + bande] },
                { zone: { ...cellule, haut: Math.max(cellule.haut, bas - bande) }, debut: [0, bas], fin: [0, bas - bande] },
            ]
            for (const { zone, debut, fin } of cotes) {
                if (zone.droite <= zone.gauche || zone.bas <= zone.haut) continue
                const degrade = contexte.createLinearGradient(...debut, ...fin)
                ajouter_arrets_estompage(degrade)
                contexte.fillStyle = degrade
                this.remplir_sols(contexte, zone, vues_cadres[i])
            }
        }))

        // Angles rentrants : sommet de la grille dont une cellule voisine est hors de la
        // réunion, et les trois autres dedans. Le dégradé couvre le quart de disque opposé.
        for (let r = 1; r < ys.length - 1; r++) {
            for (let c = 1; c < xs.length - 1; c++) {
                for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                    // Cellule face à l'angle (côté sx, sy du sommet) et cellule opposée, dehors.
                    const cq = sx > 0 ? c : c - 1
                    const rq = sy > 0 ? r : r - 1
                    const co = sx > 0 ? c - 1 : c
                    const ro = sy > 0 ? r - 1 : r
                    if (!dedans(cq, rq) || dedans(co, ro) || !dedans(cq, ro) || !dedans(co, rq)) continue
                    const x = xs[c]
                    const y = ys[r]
                    const carre = {
                        gauche: Math.min(x, x + sx * bande),
                        droite: Math.max(x, x + sx * bande),
                        haut: Math.min(y, y + sy * bande),
                        bas: Math.max(y, y + sy * bande),
                    }
                    const degrade = contexte.createRadialGradient(x, y, 0, x, y, bande)
                    ajouter_arrets_estompage(degrade)
                    contexte.fillStyle = degrade
                    // Cellules de la réunion du quart, de ce côté de l'angle.
                    cellules.forEach((ligne, rc) => ligne.forEach((i, cc) => {
                        if (i < 0 || (sx > 0 ? cc < c : cc >= c) || (sy > 0 ? rc < r : rc >= r)) return
                        const zone = {
                            gauche: Math.max(carre.gauche, xs[cc]),
                            droite: Math.min(carre.droite, xs[cc + 1]),
                            haut: Math.max(carre.haut, ys[rc]),
                            bas: Math.min(carre.bas, ys[rc + 1]),
                        }
                        if (zone.droite > zone.gauche && zone.bas > zone.haut) this.remplir_sols(contexte, zone, vues_cadres[i])
                    }))
                }
            }
        }
    }

    // Remplit, avec le style courant, les parties de la zone (pixels de la vue d'ensemble)
    // qui recouvrent des tuiles de sol. Même arrondi que Carte.dessiner.
    remplir_sols(contexte, zone, vue) {
        const vers_ecran_x = (i) => Math.round((i * TAILLE_TUILE - vue.x) * vue.zoom)
        const vers_ecran_y = (j) => Math.round((j * TAILLE_TUILE - vue.y) * vue.zoom)
        const vers_tuile_x = (x) => Math.floor((vue.x + x / vue.zoom) / TAILLE_TUILE)
        const vers_tuile_y = (y) => Math.floor((vue.y + y / vue.zoom) / TAILLE_TUILE)
        for (let j = vers_tuile_y(zone.haut); j <= vers_tuile_y(zone.bas); j++) {
            for (let i = vers_tuile_x(zone.gauche); i <= vers_tuile_x(zone.droite); i++) {
                if (this.carte.est_solide(i, j)) continue
                const x1 = Math.max(zone.gauche, vers_ecran_x(i))
                const x2 = Math.min(zone.droite, vers_ecran_x(i + 1))
                const y1 = Math.max(zone.haut, vers_ecran_y(j))
                const y2 = Math.min(zone.bas, vers_ecran_y(j + 1))
                if (x2 > x1 && y2 > y1) contexte.fillRect(x1, y1, x2 - x1, y2 - y1)
            }
        }
    }
}
