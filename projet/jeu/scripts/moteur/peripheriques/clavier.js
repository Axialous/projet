// Libellés des touches qui ne produisent pas de caractère.
const LIBELLES_TOUCHES = {
    Space: 'Espace',
    Enter: 'Entrée',
    Escape: 'Échap',
    Tab: 'Tab',
    Backspace: 'Retour arrière',
    ShiftLeft: 'Maj gauche',
    ShiftRight: 'Maj droite',
    ControlLeft: 'Ctrl gauche',
    ControlRight: 'Ctrl droite',
    AltLeft: 'Alt',
    AltRight: 'Alt Gr',
    ArrowUp: '↑',
    ArrowRight: '→',
    ArrowDown: '↓',
    ArrowLeft: '←',
}

// Domaine physique « keyboard », sous-domaine « key ».
// Les identifiants sont ceux de KeyboardEvent.code : positions physiques d'un clavier
// QWERTY ('KeyW' correspond à la touche Z en AZERTY).
export class Clavier {
    constructor() {
        // Même type que la souris : les indications mélangent touches et boutons de souris.
        this.type = 'clavier_souris'
        this.maintenues = new Set()
        // Touches appuyées depuis le dernier échantillonnage : un appui bref,
        // relâché avant la mise à jour suivante, reste ainsi visible une fois.
        this.en_attente = new Set()
        // État figé lors de l'échantillonnage.
        this.enfoncees = new Set()
        this.codes_bloques = new Set()
        this.utilise = false

        // Caractères réellement imprimés sur les touches de l'utilisateur.
        this.disposition = null
        this.caracteres_observes = new Map()
        this.charger_disposition()

        window.addEventListener('keydown', (evenement) => {
            if (this.codes_bloques.has(evenement.code)) evenement.preventDefault()
            if (evenement.repeat) return
            this.observer_caractere(evenement)
            this.maintenues.add(evenement.code)
            this.en_attente.add(evenement.code)
            this.utilise = true
        })
        window.addEventListener('keyup', (evenement) => this.maintenues.delete(evenement.code))
        window.addEventListener('blur', () => this.maintenues.clear())
        window.addEventListener('focus', () => this.charger_disposition())
    }

    // Renvoie { lire, analogique } pour l'entrée physique, ou null si elle n'existe pas.
    lecteur(sous_domaine, code) {
        if (sous_domaine !== 'key' || !/^[A-Za-z0-9]+$/.test(code)) return null
        // Empêche l'action par défaut du navigateur (défilement avec les flèches ou Espace…).
        this.codes_bloques.add(code)
        return { lire: () => (this.enfoncees.has(code) ? 1 : 0), analogique: false }
    }

    // Fige l'état des touches pour la mise à jour en cours.
    // Renvoie le périphérique s'il a été utilisé depuis l'échantillonnage précédent, sinon null.
    echantillonner() {
        this.enfoncees = new Set([...this.maintenues, ...this.en_attente])
        this.en_attente.clear()
        const utilise = this.utilise
        this.utilise = false
        return utilise ? { type: this.type, nom: 'Clavier', famille: null } : null
    }

    // API Keyboard Map (navigateurs Chromium) : correspondance code → caractère.
    charger_disposition() {
        navigator.keyboard?.getLayoutMap?.()
            .then((carte) => {
                this.disposition = carte
            })
            .catch(() => {})
    }

    // Repli pour les autres navigateurs : on apprend la disposition à mesure que le joueur tape.
    observer_caractere(evenement) {
        if (evenement.ctrlKey || evenement.altKey || evenement.metaKey) return
        if (evenement.key.length !== 1 || evenement.key === ' ') return
        this.caracteres_observes.set(evenement.code, evenement.key.toUpperCase())
    }

    // Nom de la touche telle qu'elle apparaît sur le clavier de l'utilisateur.
    libelle(sous_domaine, code) {
        const caractere = this.disposition?.get(code)
        if (caractere && caractere !== ' ') return caractere.toUpperCase()
        if (this.caracteres_observes.has(code)) return this.caracteres_observes.get(code)
        if (LIBELLES_TOUCHES[code]) return LIBELLES_TOUCHES[code]
        if (code.startsWith('Key')) return code.slice(3)
        if (code.startsWith('Digit')) return code.slice(5)
        if (code.startsWith('Numpad')) return `Pavé ${code.slice(6)}`
        return code
    }
}
