// Libellés des boutons (indices de MouseEvent.button).
const LIBELLES_BOUTONS = ['Clic gauche', 'Clic milieu', 'Clic droit', 'Bouton 4', 'Bouton 5']

// Conversion des deltas de la molette en crans, selon WheelEvent.deltaMode.
const PIXELS_PAR_CRAN = 100
const LIGNES_PAR_CRAN = 3
// Crans en attente au plus, par axe : une molette libre ou l'inertie d'un pavé tactile
// ne doivent pas continuer à faire défiler longtemps après le geste.
const CRANS_EN_ATTENTE_MAX = 3

// Distance (pixels) que le pointeur doit parcourir pour que la souris compte comme utilisée.
const SEUIL_ACTIVITE = 8

const AXES = ['x', 'y']

const document_disponible = () => (typeof document === 'undefined' ? null : document)

// Domaine physique « mouse », sous-domaines :
// - button.<n>        : bouton n de MouseEvent.button (0 gauche, 1 milieu, 2 droit…), 0 ou 1 ;
// - wheel.x / wheel.y : impulsion -1, 0 ou 1. Chaque cran dure une mise à jour et est suivi
//                       d'une mise à jour neutre, pour que des crans successifs comptent
//                       comme autant d'activations ;
// - motion.x / motion.y : déplacement converti en vitesse (non bornée), comme un manche :
//                       pixels × sensibilite_souris ÷ delta ;
// - pointer.position  : type « position », { x, y } en coordonnées du jeu, ou null si le
//                       pointeur est hors de l'écran, n'a pas encore bougé ou est verrouillé.
export class Souris {
    constructor(ecran, options = {}) {
        // Même type que le clavier : les indications mélangent touches et boutons de souris.
        this.type = 'clavier_souris'
        this.ecran = ecran ?? null
        this.sensibilite = options.sensibilite_souris ?? 1

        this.maintenus = new Set()
        // Boutons appuyés depuis le dernier échantillonnage (clic bref visible une fois).
        this.en_attente = new Set()
        this.mouvement_en_attente = { x: 0, y: 0 }
        this.crans_en_attente = { x: 0, y: 0 }
        this.position_courante = null
        this.distance_parcourue = 0
        this.utilisee = false

        // État figé lors de l'échantillonnage.
        this.enfonces = new Set()
        this.vitesse = { x: 0, y: 0 }
        this.impulsion = { x: 0, y: 0 }
        this.position = null

        // Actions par défaut du navigateur à empêcher, pour les seules entrées utilisées.
        this.boutons_bloques = new Set()
        this.molette_bloquee = false

        if (this.ecran) this.ecouter()
    }

    ecouter() {
        const ecran = this.ecran
        ecran.addEventListener('mousedown', (evenement) => {
            if (this.boutons_bloques.has(evenement.button)) evenement.preventDefault()
            this.suivre_position(evenement)
            this.maintenus.add(evenement.button)
            this.en_attente.add(evenement.button)
            this.utilisee = true
        })
        // Relâché n'importe où : le bouton ne reste pas enfoncé si le pointeur a quitté l'écran.
        window.addEventListener('mouseup', (evenement) => this.maintenus.delete(evenement.button))
        window.addEventListener('blur', () => this.maintenus.clear())
        ecran.addEventListener('contextmenu', (evenement) => {
            if (this.boutons_bloques.has(2)) evenement.preventDefault()
        })

        ecran.addEventListener('mousemove', (evenement) => {
            this.mouvement_en_attente.x += evenement.movementX ?? 0
            this.mouvement_en_attente.y += evenement.movementY ?? 0
            this.distance_parcourue += Math.hypot(evenement.movementX ?? 0, evenement.movementY ?? 0)
            if (this.distance_parcourue >= SEUIL_ACTIVITE) {
                this.distance_parcourue = 0
                this.utilisee = true
            }
            this.suivre_position(evenement)
        })
        ecran.addEventListener('mouseleave', () => {
            this.position_courante = null
        })

        ecran.addEventListener('wheel', (evenement) => {
            if (this.molette_bloquee) evenement.preventDefault()
            const diviseur = evenement.deltaMode === 0 ? PIXELS_PAR_CRAN : evenement.deltaMode === 1 ? LIGNES_PAR_CRAN : 1
            this.ajouter_crans('x', evenement.deltaX / diviseur)
            this.ajouter_crans('y', evenement.deltaY / diviseur)
        }, { passive: false })

        // Position inconnue tant que le pointeur est verrouillé, et jusqu'au prochain mouvement après.
        document_disponible()?.addEventListener('pointerlockchange', () => {
            this.position_courante = null
        })
    }

    ajouter_crans(axe, crans) {
        if (crans === 0) return
        // Un changement de sens annule les crans en attente dans l'autre sens.
        const attente = Math.sign(crans) === Math.sign(this.crans_en_attente[axe]) ? this.crans_en_attente[axe] : 0
        this.crans_en_attente[axe] = Math.max(-CRANS_EN_ATTENTE_MAX, Math.min(CRANS_EN_ATTENTE_MAX, attente + crans))
    }

    // Coordonnées du jeu : pixels CSS depuis le coin haut gauche de l'écran.
    suivre_position(evenement) {
        if (this.est_verrouillee) return
        const cadre = this.ecran.getBoundingClientRect()
        this.position_courante = {
            x: evenement.clientX - cadre.left,
            y: evenement.clientY - cadre.top,
        }
    }

    // Renvoie { lire, analogique, type? } pour l'entrée physique, ou null si elle n'existe pas.
    lecteur(sous_domaine, identifiant) {
        if (sous_domaine === 'button' && /^\d+$/.test(identifiant)) {
            const bouton = Number(identifiant)
            this.boutons_bloques.add(bouton)
            return { lire: () => (this.enfonces.has(bouton) ? 1 : 0), analogique: false }
        }
        if (!AXES.includes(identifiant) && sous_domaine !== 'pointer') return null
        if (sous_domaine === 'wheel') {
            this.molette_bloquee = true
            return { lire: () => this.impulsion[identifiant], analogique: false }
        }
        if (sous_domaine === 'motion') return { lire: () => this.vitesse[identifiant], analogique: false }
        if (sous_domaine === 'pointer' && identifiant === 'position') {
            return { type: 'position', lire: () => this.position, analogique: false }
        }
        return null
    }

    // Fige l'état de la souris pour la mise à jour en cours (delta : durée de la mise à jour).
    // Renvoie le périphérique s'il a été utilisé depuis l'échantillonnage précédent, sinon null.
    echantillonner(delta) {
        this.enfonces = new Set([...this.maintenus, ...this.en_attente])
        this.en_attente.clear()

        for (const axe of AXES) {
            const mouvement = this.mouvement_en_attente[axe]
            this.vitesse[axe] = delta > 0 ? (mouvement * this.sensibilite) / delta : 0
            this.mouvement_en_attente[axe] = 0

            // Une mise à jour neutre après chaque cran.
            if (this.impulsion[axe] !== 0 || Math.abs(this.crans_en_attente[axe]) < 1) {
                this.impulsion[axe] = 0
            } else {
                this.impulsion[axe] = Math.sign(this.crans_en_attente[axe])
                this.crans_en_attente[axe] -= this.impulsion[axe]
                this.utilisee = true
            }
        }

        this.position = this.position_courante && { ...this.position_courante }

        const utilisee = this.utilisee
        this.utilisee = false
        return utilisee ? { type: this.type, nom: 'Souris', famille: null } : null
    }

    libelle(sous_domaine, identifiant) {
        if (sous_domaine === 'button') return LIBELLES_BOUTONS[identifiant] ?? `Bouton ${Number(identifiant) + 1}`
        if (sous_domaine === 'wheel') return 'Molette'
        return 'Souris'
    }

    // --- Verrouillage du pointeur (Pointer Lock) ---

    get est_verrouillee() {
        return Boolean(this.ecran) && document_disponible()?.pointerLockElement === this.ecran
    }

    // Le navigateur n'accepte la demande que peu après un geste de l'utilisateur (clic…).
    verrouiller() {
        if (!this.ecran?.requestPointerLock || this.est_verrouillee) return
        try {
            this.ecran.requestPointerLock()?.catch?.(() => {})
        } catch {
            // Refusé par le navigateur : le jeu reste utilisable sans verrouillage.
        }
    }

    liberer() {
        if (this.est_verrouillee) document.exitPointerLock()
    }
}
