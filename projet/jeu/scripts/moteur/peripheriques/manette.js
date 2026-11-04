// Intensité qu'un axe ou un bouton doit franchir pour que la manette compte comme utilisée.
const SEUIL_ACTIVITE = 0.5

// Familles reconnues d'après l'identifiant de la manette (nom ou identifiant USB du fabricant).
const FAMILLES = [
    ['xbox', /xbox|xinput|045e/i],
    ['playstation', /playstation|dualshock|dualsense|054c/i],
    ['nintendo', /nintendo|switch|joy-con|057e/i],
]

// Libellés des boutons de la disposition « standard » du W3C, par famille.
const LIBELLES_BOUTONS = {
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Affichage', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→', 'Xbox'],
    playstation: ['Croix', 'Rond', 'Carré', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'],
    nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'],
}

const LIBELLES_AXES = ['Manche gauche', 'Manche gauche', 'Manche droit', 'Manche droit']

const famille_de = (identifiant) => FAMILLES.find(([, motif]) => motif.test(identifiant))?.[0] ?? null

// Domaine physique « controller », sous-domaines « axis » et « button » (Gamepad API).
// Les valeurs sont brutes : la zone morte est appliquée par le gestionnaire d'entrées.
// Toutes les manettes connectées sont fusionnées : pour chaque indice, la valeur
// de plus grande valeur absolue.
export class Manette {
    constructor() {
        this.type = 'manette'
        this.axes = []
        this.boutons = []
        // État précédent de chaque manette (par indice), pour détecter son utilisation.
        this.precedents = new Map()
        this.famille = null
    }

    // Renvoie { lire, analogique } pour l'entrée physique, ou null si elle n'existe pas.
    // lire() renvoie null quand l'entrée est indisponible (aucune manette connectée…).
    lecteur(sous_domaine, identifiant) {
        const indice = Number(identifiant)
        if (!/^\d+$/.test(identifiant)) return null
        if (sous_domaine === 'axis') return { lire: () => this.axes[indice] ?? null, analogique: true }
        if (sous_domaine === 'button') return { lire: () => this.boutons[indice] ?? null, analogique: true }
        return null
    }

    // Fige l'état des manettes pour la mise à jour en cours.
    // Renvoie la manette qui vient d'être utilisée, sinon null : un axe ou un bouton doit
    // franchir le seuil d'activité, ainsi un manche immobile ou qui dérive ne compte pas.
    echantillonner() {
        const axes = []
        const boutons = []
        const precedents = new Map()
        let utilisee = null

        for (const manette of navigator.getGamepads?.() ?? []) {
            if (!manette?.connected) continue
            const axes_manette = [...manette.axes]
            const boutons_manette = manette.buttons.map((bouton) => bouton.value || (bouton.pressed ? 1 : 0))
            fusionner(axes, axes_manette)
            fusionner(boutons, boutons_manette)

            const precedent = this.precedents.get(manette.index) ?? { axes: [], boutons: [] }
            if (franchit(axes_manette, precedent.axes) || franchit(boutons_manette, precedent.boutons)) {
                utilisee = manette
            }
            precedents.set(manette.index, { axes: axes_manette, boutons: boutons_manette })
        }

        this.axes = axes
        this.boutons = boutons
        this.precedents = precedents
        if (!utilisee) return null
        this.famille = famille_de(utilisee.id)
        return { type: this.type, nom: utilisee.id, famille: this.famille }
    }

    // Libellé adapté à la famille de la dernière manette utilisée.
    libelle(sous_domaine, identifiant) {
        const indice = Number(identifiant)
        if (sous_domaine === 'axis') return LIBELLES_AXES[indice] ?? `Axe ${indice}`
        return LIBELLES_BOUTONS[this.famille]?.[indice] ?? `Bouton ${indice}`
    }
}

function fusionner(resultat, valeurs) {
    valeurs.forEach((valeur, indice) => {
        if (resultat[indice] === undefined || Math.abs(valeur) > Math.abs(resultat[indice])) {
            resultat[indice] = valeur
        }
    })
}

const franchit = (actuelles, precedentes) =>
    actuelles.some((valeur, indice) =>
        Math.abs(valeur) >= SEUIL_ACTIVITE && !(Math.abs(precedentes[indice]) >= SEUIL_ACTIVITE))
