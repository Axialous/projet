import { generer_graine } from '../utilitaires/graine.js'

// Sauvegardes des parties : une sauvegarde par partie, réécrite à chaque moment clé.
// Le nombre de parties n'est pas limité. Chaque partie occupe deux clés du stockage :
// - resume.<id> : { version, creee_le, modifiee_le, duree_jeu }, pour lister les parties
//   sans lire toutes les données ;
// - partie.<id> : { version, partie }, les données complètes.
// Dates en millisecondes (Date.now()), durée de jeu en secondes.
// Toutes les méthodes sont asynchrones : le stockage local pourra être remplacé
// par un stockage distant sans changer le reste du jeu.
//
//   const id = await jeu.sauvegardes.enregistrer(null, donnees, { duree_jeu })  → nouvelle partie
//   await jeu.sauvegardes.enregistrer(id, donnees, { duree_jeu })               → mise à jour
//   const resumes = await jeu.sauvegardes.lister()
//   const donnees = await jeu.sauvegardes.lire(id)

// Version du format des données de partie. À incrémenter quand ce format change, en ajoutant
// la migration correspondante : MIGRATIONS[n](donnees) convertit des données de la version n
// vers la version n + 1.
const VERSION = 3
const MIGRATIONS = {
    // Ajout de la graine : les parties existantes en reçoivent une nouvelle.
    1: (donnees) => ({ ...donnees, graine: generer_graine() }),
    // Ajout de l'état du hasard : aucun flux encore utilisé.
    2: (donnees) => ({ ...donnees, hasard: {} }),
}

const PREFIXE_RESUME = 'resume.'
const PREFIXE_PARTIE = 'partie.'

const est_objet = (valeur) => valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)

const creer_identifiant = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// Lève une erreur si la version ne peut pas être chargée par cette version du jeu.
function verifier_version(version) {
    if (!Number.isInteger(version) || version < 1) throw new Error('version de sauvegarde invalide')
    if (version > VERSION) throw new Error('sauvegarde créée par une version plus récente du jeu')
}

function migrer(donnees, version) {
    for (let actuelle = version; actuelle < VERSION; actuelle++) {
        const migration = MIGRATIONS[actuelle]
        if (!migration) throw new Error(`migration manquante de la version ${actuelle} vers ${actuelle + 1}`)
        donnees = migration(donnees)
    }
    return donnees
}

export class GestionnaireSauvegardes {
    constructor(stockage) {
        this.stockage = stockage
    }

    // Résumés { id, creee_le, modifiee_le, duree_jeu }, du plus récent au plus ancien.
    // Un résumé illisible est renvoyé sous la forme { id, erreur } (en fin de liste).
    async lister() {
        const cles = await this.stockage.lister_cles(PREFIXE_RESUME)
        const resumes = await Promise.all(cles.map((cle) => this.lire_resume(cle.slice(PREFIXE_RESUME.length))))
        return resumes.sort((a, b) => (b.modifiee_le ?? -Infinity) - (a.modifiee_le ?? -Infinity))
    }

    async lire_resume(id) {
        try {
            const texte = await this.stockage.lire(PREFIXE_RESUME + id)
            if (texte === null) throw new Error('sauvegarde introuvable')
            const resume = JSON.parse(texte)
            if (!est_objet(resume)) throw new Error('sauvegarde corrompue')
            verifier_version(resume.version)
            const { creee_le, modifiee_le, duree_jeu } = resume
            if (![creee_le, modifiee_le, duree_jeu].every(Number.isFinite)) throw new Error('sauvegarde corrompue')
            return { id, creee_le, modifiee_le, duree_jeu }
        } catch (erreur) {
            return { id, erreur: erreur instanceof SyntaxError ? 'sauvegarde corrompue' : erreur.message }
        }
    }

    // Écrit les données d'une partie. Sans id, crée une nouvelle partie. Renvoie l'id.
    async enregistrer(id, donnees, { duree_jeu = 0 } = {}) {
        const maintenant = Date.now()
        let creee_le = maintenant
        if (id) {
            const precedent = await this.lire_resume(id)
            if (!precedent.erreur) creee_le = precedent.creee_le
        } else {
            id = creer_identifiant()
        }

        // Les données d'abord, le résumé ensuite : une partie n'apparaît dans la liste
        // qu'une fois ses données écrites.
        await this.stockage.ecrire(PREFIXE_PARTIE + id, JSON.stringify({ version: VERSION, partie: donnees }))
        await this.stockage.ecrire(PREFIXE_RESUME + id, JSON.stringify({
            version: VERSION,
            creee_le,
            modifiee_le: maintenant,
            duree_jeu,
        }))
        return id
    }

    // Données d'une partie, converties au format actuel. Lève une erreur si elles sont illisibles.
    async lire(id) {
        const texte = await this.stockage.lire(PREFIXE_PARTIE + id)
        if (texte === null) throw new Error('sauvegarde introuvable')
        let enveloppe
        try {
            enveloppe = JSON.parse(texte)
        } catch {
            throw new Error('sauvegarde corrompue')
        }
        if (!est_objet(enveloppe) || !est_objet(enveloppe.partie)) throw new Error('sauvegarde corrompue')
        verifier_version(enveloppe.version)
        return migrer(enveloppe.partie, enveloppe.version)
    }

    async supprimer(id) {
        await this.stockage.supprimer(PREFIXE_RESUME + id)
        await this.stockage.supprimer(PREFIXE_PARTIE + id)
    }
}
