// Hasard reproductible d'une partie : même graine et mêmes actions dans le même ordre
// donnent les mêmes tirages.
//
// Le hasard est réparti en flux nommés, chacun avec sa propre suite de tirages, pour
// qu'un système n'influence pas les tirages des autres :
//   scene.hasard.flux('butin').entier(1, 6)
//   scene.hasard.flux('ennemis').choisir(directions)
//
// Règles pour rester reproductible :
// - pas de Math.random pour ce qui touche à la partie ; il reste permis pour le purement
//   visuel (particules, tremblement d'écran), qui ne doit jamais consommer un flux ;
// - un tirage fait à chaque image (et non à la suite d'une action) dépend du moment où
//   le joueur agit : le placer dans un flux à part ;
// - éviter Math.sin, Math.cos, Math.exp… dans les calculs qui décident d'un tirage :
//   leurs résultats peuvent différer d'un navigateur à l'autre.

import { est_graine_valide as est_entier_32 } from './graine.js'

const DEUX_PUISSANCE_32 = 0x100000000

// Hachage FNV-1a 32 bits d'un texte (le nom d'un flux).
function hacher(texte) {
    let empreinte = 0x811c9dc5
    for (let i = 0; i < texte.length; i++) {
        empreinte ^= texte.charCodeAt(i)
        empreinte = Math.imul(empreinte, 0x01000193)
    }
    return empreinte >>> 0
}

// Générateur sfc32 (« Small Fast Counting ») : état de 4 entiers de 32 bits, rapide et de
// bonne qualité statistique, calculé uniquement avec des opérations entières.
export class GenerateurAleatoire {
    // Un état [a, b, c, d] issu de etat() reprend la suite exactement où elle s'était arrêtée.
    constructor(etat) {
        if (!Array.isArray(etat) || etat.length !== 4 || !etat.every(est_entier_32)) {
            throw new Error('état du générateur invalide')
        }
        ;[this.a, this.b, this.c, this.d] = etat
    }

    // Générateur neuf à partir de deux entiers de 32 bits (graine et sel).
    static depuis_graine(graine, sel = 0) {
        const generateur = new GenerateurAleatoire([graine, sel, 0x9e3779b9, 1])
        // Les premiers tirages sont encore trop liés à la graine.
        for (let i = 0; i < 15; i++) generateur.entier_32()
        return generateur
    }

    etat() {
        return [this.a, this.b, this.c, this.d]
    }

    // Entier entre 0 et 2^32 - 1.
    entier_32() {
        const resultat = (this.a + this.b + this.d) >>> 0
        this.d = (this.d + 1) >>> 0
        this.a = (this.b ^ (this.b >>> 9)) >>> 0
        this.b = (this.c + (this.c << 3)) >>> 0
        this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0
        this.c = (this.c + resultat) >>> 0
        return resultat
    }

    // Réel dans [0, 1[.
    suivant() {
        return this.entier_32() / DEUX_PUISSANCE_32
    }

    // Réel dans [minimum, maximum[.
    reel(minimum, maximum) {
        return minimum + this.suivant() * (maximum - minimum)
    }

    // Entier entre minimum et maximum inclus.
    entier(minimum, maximum) {
        return minimum + Math.floor(this.suivant() * (maximum - minimum + 1))
    }

    // Vrai avec la probabilité donnée (entre 0 et 1).
    chance(probabilite) {
        return this.suivant() < probabilite
    }

    choisir(tableau) {
        if (tableau.length === 0) throw new Error('choix dans un tableau vide')
        return tableau[this.entier(0, tableau.length - 1)]
    }

    // Mélange le tableau sur place (Fisher-Yates) et le renvoie.
    melanger(tableau) {
        for (let i = tableau.length - 1; i > 0; i--) {
            const j = this.entier(0, i)
            ;[tableau[i], tableau[j]] = [tableau[j], tableau[i]]
        }
        return tableau
    }
}

// Ensemble des flux d'une partie, tous dérivés de sa graine.
export class Hasard {
    // etats : résultat de serialiser(), pour reprendre une partie sauvegardée.
    constructor(graine, etats = {}) {
        if (!est_entier_32(graine)) throw new Error('graine invalide')
        if (etats === null || typeof etats !== 'object' || Array.isArray(etats)) {
            throw new Error('état du hasard invalide')
        }
        this.graine = graine
        this.generateurs = new Map()
        for (const [nom, etat] of Object.entries(etats)) {
            this.generateurs.set(nom, new GenerateurAleatoire(etat))
        }
    }

    // Flux créé au premier appel : sa suite ne dépend que de la graine et de son nom.
    flux(nom) {
        let generateur = this.generateurs.get(nom)
        if (!generateur) {
            generateur = GenerateurAleatoire.depuis_graine(this.graine, hacher(nom))
            this.generateurs.set(nom, generateur)
        }
        return generateur
    }

    // { nom: état } des flux déjà utilisés.
    serialiser() {
        const etats = {}
        for (const [nom, generateur] of this.generateurs) etats[nom] = generateur.etat()
        return etats
    }
}
