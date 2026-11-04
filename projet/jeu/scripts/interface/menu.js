// Menu à plusieurs niveaux, piloté par les actions :
// - « navigation » : déplace la sélection (axe vertical) ; maintenue, elle se répète ;
// - « validation » : choisit l'élément sélectionné ou ouvre son sous-menu ;
// - « annulation »  : revient au niveau précédent (à la racine, appelle au_retour_racine) ;
// - « pointeur » (position) : survoler un élément le sélectionne ;
// - « clic »       : valide l'élément sous le pointeur (un clic à côté est sans effet).
//
// Une page : { titre, elements: [{ libelle, choisir?, sous_menu?, desactive? }] }
//   choisir()  : appelée à la validation de l'élément ;
//   sous_menu  : page, ou fonction qui la construit à l'ouverture (contenu à jour) ;
//   desactive  : élément affiché grisé, sélectionnable mais sans effet.
// Au-delà de ELEMENTS_VISIBLES éléments, la liste défile pour suivre la sélection.
// menu.message : texte affiché sous la liste (erreur…), effacé à la prochaine action.

// Inclinaison minimale du manche pour déplacer la sélection.
const SEUIL_NAVIGATION = 0.5
// Répétition quand la navigation reste maintenue (secondes).
const DELAI_REPETITION = 0.4
const INTERVALLE_REPETITION = 0.12

const ECART_ELEMENTS = 44
const ELEMENTS_VISIBLES = 7
// Largeur de la bande cliquable des éléments, en part de la largeur de l'écran.
const LARGEUR_ELEMENTS = 0.7

export class Menu {
    constructor(jeu, page, options = {}) {
        this.jeu = jeu
        this.pile = [{ page, selection: 0 }]
        this.au_retour_racine = options.au_retour_racine ?? null
        // Une direction déjà maintenue à l'ouverture ne déplace pas la sélection.
        this.direction = this.lire_direction()
        this.attente = 0
        this.message = null
        // Un pointeur immobile à l'ouverture ne prend pas la sélection.
        this.position_precedente = this.jeu.actions.valeur('pointeur')
    }

    get niveau() {
        return this.pile.at(-1)
    }

    get est_a_la_racine() {
        return this.pile.length === 1
    }

    ouvrir(page) {
        this.pile.push({ page, selection: 0 })
        this.message = null
    }

    // Revient au niveau précédent. Renvoie false si le menu est déjà à la racine.
    revenir() {
        if (this.est_a_la_racine) return false
        this.pile.pop()
        this.message = null
        return true
    }

    mettre_a_jour(delta) {
        const actions = this.jeu.actions
        if (actions.vient_d_etre_activee('annulation')) {
            this.message = null
            if (!this.revenir()) this.au_retour_racine?.()
            return
        }
        if (actions.vient_d_etre_activee('validation')) {
            this.message = null
            this.valider()
            return
        }
        if (this.gerer_pointeur()) return
        this.naviguer(delta)
    }

    // Survol et clic. Renvoie true si un clic a validé un élément.
    gerer_pointeur() {
        const actions = this.jeu.actions
        const position = actions.valeur('pointeur')
        const precedente = this.position_precedente
        this.position_precedente = position
        const indice = position ? this.element_sous(position) : null
        if (indice === null) return false

        const a_bouge = !precedente || precedente.x !== position.x || precedente.y !== position.y
        const clic = actions.vient_d_etre_activee('clic')
        if ((a_bouge || clic) && indice !== this.niveau.selection) {
            this.niveau.selection = indice
            this.message = null
        }
        if (!clic) return false
        this.message = null
        this.valider()
        return true
    }

    // Indice de l'élément visible sous la position, ou null.
    element_sous({ x, y }) {
        const { premier, visibles, haut } = this.disposition()
        const { largeur } = this.jeu
        if (Math.abs(x - largeur / 2) > (largeur * LARGEUR_ELEMENTS) / 2) return null
        const rang = Math.round((y - haut) / ECART_ELEMENTS)
        return rang >= 0 && rang < visibles ? premier + rang : null
    }

    // Fenêtre d'éléments visibles, centrée sur la sélection autant que possible.
    // haut : ordonnée du centre de la première ligne visible.
    disposition() {
        const { page, selection } = this.niveau
        const nombre = page.elements.length
        const visibles = Math.min(nombre, ELEMENTS_VISIBLES)
        const premier = Math.max(0, Math.min(nombre - visibles, selection - Math.floor(visibles / 2)))
        const haut = this.jeu.hauteur * 0.52 - ((visibles - 1) * ECART_ELEMENTS) / 2
        return { nombre, visibles, premier, haut }
    }

    valider() {
        const element = this.niveau.page.elements[this.niveau.selection]
        if (!element || element.desactive) return
        if (element.sous_menu) {
            this.ouvrir(typeof element.sous_menu === 'function' ? element.sous_menu() : element.sous_menu)
        } else {
            element.choisir?.()
        }
    }

    lire_direction() {
        const { y } = this.jeu.actions.valeur('navigation')
        return Math.abs(y) >= SEUIL_NAVIGATION ? Math.sign(y) : 0
    }

    naviguer(delta) {
        const direction = this.lire_direction()
        if (direction === 0) {
            this.direction = 0
            return
        }
        if (direction !== this.direction) {
            this.direction = direction
            this.attente = DELAI_REPETITION
            this.deplacer(direction, true)
            return
        }
        this.attente -= delta
        if (this.attente <= 0) {
            this.attente += INTERVALLE_REPETITION
            this.deplacer(direction, false)
        }
    }

    // Boucle d'un bout à l'autre sur un appui, mais pas pendant la répétition :
    // en maintenant la direction, la sélection s'arrête au dernier élément.
    deplacer(direction, boucler) {
        const nombre = this.niveau.page.elements.length
        if (nombre === 0) return
        const cible = this.niveau.selection + direction
        this.niveau.selection = boucler
            ? (cible + nombre) % nombre
            : Math.max(0, Math.min(nombre - 1, cible))
        this.message = null
    }

    // --- Affichage ---

    dessiner(contexte) {
        const { largeur, hauteur } = this.jeu
        const { page, selection } = this.niveau

        contexte.textAlign = 'center'
        contexte.textBaseline = 'middle'
        contexte.fillStyle = '#fff'
        contexte.font = 'bold 48px sans-serif'
        contexte.fillText(page.titre, largeur / 2, hauteur * 0.28)

        const { nombre, visibles, premier, haut } = this.disposition()

        for (let rang = 0; rang < visibles; rang++) {
            const indice = premier + rang
            const element = page.elements[indice]
            const choisi = indice === selection
            contexte.font = choisi ? 'bold 24px sans-serif' : '24px sans-serif'
            contexte.fillStyle = element.desactive ? '#555' : choisi ? '#fff' : '#999'
            const libelle = choisi ? `▸ ${element.libelle} ◂` : element.libelle
            contexte.fillText(libelle, largeur / 2, haut + rang * ECART_ELEMENTS)
        }

        contexte.font = '16px sans-serif'
        contexte.fillStyle = '#777'
        if (premier > 0) contexte.fillText('▲', largeur / 2, haut - ECART_ELEMENTS * 0.75)
        if (premier + visibles < nombre) {
            contexte.fillText('▼', largeur / 2, haut + (visibles - 0.25) * ECART_ELEMENTS)
        }

        if (this.message) {
            contexte.font = '18px sans-serif'
            contexte.fillStyle = '#f66'
            contexte.fillText(this.message, largeur / 2, hauteur - 80)
        }

        this.dessiner_indications(contexte)
    }

    // Touches à utiliser, d'après le dernier périphérique employé.
    dessiner_indications(contexte) {
        const actions = this.jeu.actions
        const indications = [['validation', 'Valider']]
        if (!this.est_a_la_racine || this.au_retour_racine) indications.push(['annulation', 'Retour'])

        const texte = indications
            .map(([action, libelle]) => {
                const touche = actions.libelles(action)[0]
                return touche ? `${touche} : ${libelle}` : null
            })
            .filter(Boolean)
            .join('     ')

        contexte.font = '16px sans-serif'
        contexte.fillStyle = '#777'
        contexte.fillText(texte, this.jeu.largeur / 2, this.jeu.hauteur - 40)
    }
}
