// Serveur HTTP statique minimal, uniquement avec les modules natifs de Node.js.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT) || 3000
const DOSSIER_JEU = resolve(fileURLToPath(new URL('../jeu', import.meta.url)))

const TYPES_MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
}

// Convertit l'URL demandée en chemin de fichier, sans pouvoir sortir de DOSSIER_JEU.
function resoudre_chemin(url) {
    const chemin_url = decodeURIComponent(new URL(url, 'http://localhost').pathname)
    const chemin_fichier = normalize(join(DOSSIER_JEU, chemin_url))
    if (chemin_fichier !== DOSSIER_JEU && !chemin_fichier.startsWith(DOSSIER_JEU + sep)) {
        return null
    }
    return chemin_fichier
}

async function trouver_fichier(chemin_fichier) {
    try {
        const infos = await stat(chemin_fichier)
        return infos.isDirectory() ? join(chemin_fichier, 'index.html') : chemin_fichier
    } catch {
        return null
    }
}

function envoyer(reponse, statut, contenu, type_contenu = 'text/plain; charset=utf-8') {
    reponse.writeHead(statut, { 'Content-Type': type_contenu, 'Cache-Control': 'no-cache' })
    reponse.end(contenu)
}

const serveur = createServer(async (requete, reponse) => {
    if (requete.method !== 'GET' && requete.method !== 'HEAD') {
        return envoyer(reponse, 405, 'Méthode non autorisée')
    }

    let chemin_fichier
    try {
        chemin_fichier = resoudre_chemin(requete.url)
    } catch {
        return envoyer(reponse, 400, 'Requête invalide')
    }
    if (!chemin_fichier) {
        return envoyer(reponse, 403, 'Accès interdit')
    }

    const cible = await trouver_fichier(chemin_fichier)
    if (!cible) {
        return envoyer(reponse, 404, 'Fichier introuvable')
    }

    try {
        const contenu = await readFile(cible)
        const type_contenu = TYPES_MIME[extname(cible).toLowerCase()] || 'application/octet-stream'
        envoyer(reponse, 200, requete.method === 'HEAD' ? undefined : contenu, type_contenu)
    } catch {
        envoyer(reponse, 404, 'Fichier introuvable')
    }
})

serveur.listen(PORT, () => {
    console.log(`Jeu disponible sur http://localhost:${PORT}`)
})

// Arrêt propre quand Docker envoie SIGTERM.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => serveur.close(() => process.exit(0)))
}
