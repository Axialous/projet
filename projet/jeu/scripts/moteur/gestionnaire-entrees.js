import { Clavier } from './peripheriques/clavier.js'
import { Manette } from './peripheriques/manette.js'
import { Souris } from './peripheriques/souris.js'
import { borner } from '../utilitaires/maths.js'

// Gestionnaire d'entrées et d'actions : fait abstraction des périphériques physiques.
// Trois niveaux séparés :
// - entrées physiques : lues par les périphériques (domaines) ;
//   keyboard.key.<code>, controller.axis.<n>, controller.button.<n>, mouse.button.<n>,
//   mouse.wheel.x|y, mouse.motion.x|y (vitesse non bornée), mouse.pointer.position (position) ;
// - entrées composées : section « entrees » de la configuration (jeu/configs/entrees.json) ;
//     scalaire : "domaine.sous_domaine.id", nom d'entrée, ou { n, s }   → n - s
//     vecteur  : nom d'entrée, { h, v } ou { n, e, s, o }              → { x: e - o, y: s - n }
//     position : "domaine.sous_domaine.id" ou nom d'entrée, sans composition → { x, y } ou null
//   Les vecteurs suivent la convention de l'écran et des manettes : y positif vers le bas.
//   Zones mortes des entrées analogiques : sur la longueur du vecteur pour une composition
//   { h, v } d'entrées analogiques (la direction du manche est conservée), axe par axe sinon.
// - actions : section « actions », liste d'entrées nommées ou physiques, toutes du même type.
//   Scalaires et vecteurs : la plus grande valeur absolue l'emporte (composante par composante).
//   Positions : la première disponible dans l'ordre de la liste ; l'action est active tant
//   qu'une position est disponible (pointeur sur l'écran).
//
// Utilisation (appeler mettre_a_jour(delta) au début de chaque mise à jour logique) :
//   actions.valeur('mouvement')            → { x, y }, composantes entre -1 et 1
//                                            (sauf mouse.motion, non borné)
//   actions.valeur('saut')                 → nombre
//   actions.valeur('pointeur')             → { x, y } en coordonnées du jeu, ou null
//   actions.est_active('saut')             → valeur non nulle
//   actions.vient_d_etre_activee('saut')
//   actions.vient_d_etre_relachee('saut')
//   actions.dernier_peripherique           → { type, nom, famille } ou null
//   actions.libelles('saut')               → ['Espace'] ou ['A'] selon le dernier périphérique
//   actions.verrouiller_pointeur(), actions.liberer_pointeur(), actions.pointeur_verrouille

const OPTIONS_PAR_DEFAUT = {
    // Part de la course ignorée près du repos, pour les entrées analogiques.
    zone_morte: 0.15,
    // Vitesse de mouse.motion par pixel parcouru : 1 pixel équivaut à un manche poussé
    // à fond pendant 0,002 s (500 pixels → 1 s).
    sensibilite_souris: 0.002,
    // Écran (canvas) dont la souris suit le pointeur.
    ecran: null,
}

// Ramène |valeur| de [zone_morte, 1] à [0, 1] : valeur neutre dans la zone morte,
// et pas de saut de valeur en sortie de zone.
const reduire = (amplitude, zone_morte) => Math.min(1, (amplitude - zone_morte) / (1 - zone_morte))

function appliquer_zone_morte_axiale(valeur, zone_morte) {
    if (valeur === null || Math.abs(valeur) <= zone_morte) return valeur === null ? null : 0
    return Math.sign(valeur) * reduire(Math.abs(valeur), zone_morte)
}

// Même principe sur la longueur du vecteur : un manche poussé presque droit garde
// sa légère composante latérale, au lieu d'être ramené exactement sur l'axe.
function appliquer_zone_morte_radiale(vecteur, zone_morte) {
    if (vecteur === null) return null
    const longueur = Math.hypot(vecteur.x, vecteur.y)
    if (longueur <= zone_morte) return { x: 0, y: 0 }
    const facteur = reduire(longueur, zone_morte) / longueur
    return { x: vecteur.x * facteur, y: vecteur.y * facteur }
}

const TYPES = ['scalaire', 'vecteur', 'position']

const NEUTRES = {
    scalaire: () => 0,
    vecteur: () => ({ x: 0, y: 0 }),
    position: () => null,
}

// Plus grande valeur absolue ; en cas d'égalité, la première de la liste l'emporte.
const plus_grande = (valeurs) => valeurs.reduce((retenue, valeur) => (Math.abs(valeur) > Math.abs(retenue) ? valeur : retenue), 0)

// Fusion des entrées d'une action, en ignorant les entrées indisponibles (null).
// Vecteurs : comparaison indépendante sur chaque composante, sans normalisation.
function fusionner(valeurs, type) {
    const disponibles = valeurs.filter((valeur) => valeur !== null)
    if (type === 'position') return disponibles[0] ?? null
    if (type === 'scalaire') return plus_grande(disponibles)
    return {
        x: plus_grande(disponibles.map((valeur) => valeur.x)),
        y: plus_grande(disponibles.map((valeur) => valeur.y)),
    }
}

// Combine des composantes : null seulement si elles sont toutes indisponibles.
function combiner(lecteurs, calculer) {
    const valeurs = lecteurs.map((lire) => lire())
    if (valeurs.every((valeur) => valeur === null)) return null
    return calculer(...valeurs.map((valeur) => valeur ?? 0))
}

const difference = (positive, negative) => borner(positive - negative, -1, 1)

function est_non_nulle(valeur, type) {
    if (type === 'position') return valeur !== null
    if (type === 'vecteur') return valeur.x !== 0 || valeur.y !== 0
    return valeur !== 0
}

export class GestionnaireEntrees {
    constructor(configuration, options = {}) {
        this.options = { ...OPTIONS_PAR_DEFAUT, ...options }

        // Domaines physiques : ajouter ici un périphérique pour prendre en charge un nouveau domaine.
        // Chacun fournit type, lecteur(sous_domaine, id), echantillonner(delta) et libelle(sous_domaine, id).
        // lecteur() renvoie { lire, analogique, type? } (type « scalaire » par défaut).
        this.domaines = {
            keyboard: new Clavier(this.options),
            controller: new Manette(),
            mouse: new Souris(this.options.ecran, this.options),
        }
        this.dernier_peripherique = null

        this.definitions = configuration.entrees ?? {}
        this.entrees_compilees = new Map()
        this.etats_actions = new Map()

        // Toutes les entrées sont compilées, même inutilisées, pour signaler les erreurs au chargement.
        for (const nom of Object.keys(this.definitions)) this.compiler_entree(nom, [])
        for (const [nom, definition] of Object.entries(configuration.actions ?? {})) {
            this.compiler_action(nom, definition)
        }
    }

    // --- Compilation de la configuration ---
    // Chaque entrée devient { type, evaluer, brut, sources, analogique } : evaluer() renvoie
    // la valeur après zone morte (null si indisponible), brut() la valeur avant zone morte,
    // sources liste les entrées physiques d'origine.

    compiler_entree(nom, pile) {
        if (this.entrees_compilees.has(nom)) return this.entrees_compilees.get(nom)
        if (pile.includes(nom)) {
            throw new Error(`Entrées : référence circulaire (${[...pile, nom].join(' → ')})`)
        }

        const definition = this.definitions[nom]
        if (!TYPES.includes(definition?.type)) {
            throw new Error(`Entrée « ${nom} » : type « ${definition?.type} » invalide (attendu : ${TYPES.join(' ou ')})`)
        }
        const noeud = this.compiler_reference(definition.entree, definition.type, [...pile, nom])
        const { evaluer, brut, sources, analogique } = noeud
        const entree = { nom, type: definition.type, evaluer, brut, sources, analogique }
        this.entrees_compilees.set(nom, entree)
        return entree
    }

    compiler_reference(reference, type, pile) {
        const contexte = `Entrée « ${pile.at(-1)} »`

        if (typeof reference === 'string') {
            if (Object.hasOwn(this.definitions, reference)) {
                const entree = this.compiler_entree(reference, pile)
                if (entree.type !== type) {
                    throw new Error(`${contexte} : « ${reference} » est de type ${entree.type}, ${type} attendu`)
                }
                return entree
            }
            if (type === 'vecteur') {
                throw new Error(`${contexte} : « ${reference} » n'est pas une entrée vecteur définie`)
            }
            return this.compiler_physique(reference, contexte, type)
        }

        if (reference === null || typeof reference !== 'object' || Array.isArray(reference)) {
            throw new Error(`${contexte} : champ « entree » invalide`)
        }
        if (type === 'position') {
            throw new Error(`${contexte} : une position ne se compose pas (entrée physique ou nommée attendue)`)
        }

        const cles = Object.keys(reference).sort().join(',')
        const attendues = type === 'scalaire' ? ['n,s'] : ['h,v', 'e,n,o,s']
        if (!attendues.includes(cles)) {
            const formats = attendues.map((format) => `{ ${format.split(',').join(', ')} }`).join(' ou ')
            throw new Error(`${contexte} : composition { ${cles} } invalide pour un ${type} (attendu : ${formats})`)
        }

        const composantes = {}
        for (const [cle, sous_reference] of Object.entries(reference)) {
            composantes[cle] = this.compiler_reference(sous_reference, 'scalaire', pile)
        }
        const sources = Object.values(composantes).flatMap((composante) => composante.sources)
        const { n, e, s, o, h, v } = composantes

        if (cles === 'h,v' && h.analogique && v.analogique) {
            // Zone morte sur la longueur : les composantes sont lues avant leur propre zone morte.
            const brut = () => combiner([h.brut, v.brut], (x, y) => ({ x, y }))
            return { sources, brut, evaluer: () => appliquer_zone_morte_radiale(brut(), this.options.zone_morte), analogique: true }
        }
        // Composantes non analogiques (souris…) : ni zone morte, ni bornage.
        const evaluer = cles === 'h,v'
            ? () => combiner([h.evaluer, v.evaluer], (x, y) => ({ x, y }))
            : cles === 'n,s'
                ? () => combiner([n.evaluer, s.evaluer], difference)
                : () => combiner([n.evaluer, e.evaluer, s.evaluer, o.evaluer],
                    (vn, ve, vs, vo) => ({ x: difference(ve, vo), y: difference(vs, vn) }))
        return { sources, evaluer, brut: evaluer, analogique: false }
    }

    // type_attendu : type que l'entrée physique doit avoir (null : tout type accepté).
    compiler_physique(chemin, contexte, type_attendu = null) {
        const [nom_domaine, sous_domaine, identifiant, ...reste] = chemin.split('.')
        const domaine = Object.hasOwn(this.domaines, nom_domaine) ? this.domaines[nom_domaine] : null
        if (!domaine) {
            const connus = Object.keys(this.domaines).join(', ')
            throw new Error(`${contexte} : « ${chemin} » n'est ni une entrée définie ni un domaine physique connu (${connus})`)
        }
        const lecteur = reste.length === 0 && identifiant ? domaine.lecteur(sous_domaine, identifiant) : null
        if (!lecteur) {
            throw new Error(`${contexte} : entrée physique « ${chemin} » invalide (sous-domaine ou identifiant inconnu)`)
        }
        const { lire, analogique } = lecteur
        const type = lecteur.type ?? 'scalaire'
        if (type_attendu && type !== type_attendu) {
            throw new Error(`${contexte} : « ${chemin} » est de type ${type}, ${type_attendu} attendu`)
        }
        const evaluer = analogique ? () => appliquer_zone_morte_axiale(lire(), this.options.zone_morte) : lire
        return { type, sources: [chemin], evaluer, brut: lire, analogique }
    }

    compiler_action(nom, definition) {
        const contexte = `Action « ${nom} »`
        const references = definition?.entrees
        if (!Array.isArray(references) || references.length === 0) {
            throw new Error(`${contexte} : « entrees » doit être une liste non vide`)
        }

        // Entrée nommée, ou référence physique directe (scalaire ou position).
        const entrees = references.map((reference) => {
            if (typeof reference !== 'string') throw new Error(`${contexte} : référence d'entrée invalide`)
            if (Object.hasOwn(this.definitions, reference)) return this.compiler_entree(reference, [])
            return { nom: reference, ...this.compiler_physique(reference, contexte) }
        })

        const type = entrees[0].type
        const intruse = entrees.find((entree) => entree.type !== type)
        if (intruse) {
            throw new Error(`${contexte} : « ${intruse.nom} » est de type ${intruse.type}, ${type} attendu`)
        }

        this.etats_actions.set(nom, {
            type,
            entrees,
            valeur: NEUTRES[type](),
            active: false,
            activee: false,
            relachee: false,
        })
    }

    // --- Mise à jour ---

    // À appeler une fois au début de chaque mise à jour logique (delta : sa durée, en secondes).
    mettre_a_jour(delta = 0) {
        for (const domaine of Object.values(this.domaines)) {
            const utilise = domaine.echantillonner(delta)
            if (utilise) this.dernier_peripherique = utilise
        }

        for (const etat of this.etats_actions.values()) {
            const etait_active = etat.active
            etat.valeur = fusionner(etat.entrees.map((entree) => entree.evaluer()), etat.type)
            etat.active = est_non_nulle(etat.valeur, etat.type)
            etat.activee = etat.active && !etait_active
            etat.relachee = !etat.active && etait_active
        }
    }

    // --- Lecture des actions ---

    etat(nom) {
        const etat = this.etats_actions.get(nom)
        if (!etat) throw new Error(`Action inconnue : « ${nom} »`)
        return etat
    }

    // Valeur précise, accessible indépendamment de l'état actif.
    valeur(nom) {
        const { valeur } = this.etat(nom)
        return valeur === null || typeof valeur === 'number' ? valeur : { ...valeur }
    }

    est_active(nom) {
        return this.etat(nom).active
    }

    vient_d_etre_activee(nom) {
        return this.etat(nom).activee
    }

    vient_d_etre_relachee(nom) {
        return this.etat(nom).relachee
    }

    // --- Indications affichées en jeu ---

    // Entrées physiques d'origine associées à une action, pour un type de périphérique donné
    // (par défaut le dernier utilisé).
    sources(nom, type = this.dernier_peripherique?.type ?? 'clavier_souris') {
        const sources = this.etat(nom).entrees.flatMap((entree) => entree.sources)
        return [...new Set(sources)].filter((chemin) => this.domaines[chemin.split('.')[0]].type === type)
    }

    // Libellés de ces entrées : touches selon la disposition réelle du clavier,
    // boutons selon la famille de la dernière manette utilisée.
    libelles(nom, type) {
        const libelles = this.sources(nom, type).map((chemin) => {
            const [nom_domaine, sous_domaine, identifiant] = chemin.split('.')
            return this.domaines[nom_domaine].libelle(sous_domaine, identifiant)
        })
        return [...new Set(libelles)]
    }

    // --- Verrouillage du pointeur ---

    // À appeler peu après un geste de l'utilisateur (clic…), sinon le navigateur refuse.
    verrouiller_pointeur() {
        this.domaines.mouse.verrouiller()
    }

    liberer_pointeur() {
        this.domaines.mouse.liberer()
    }

    get pointeur_verrouille() {
        return this.domaines.mouse.est_verrouillee
    }
}
