import { Carte, TUILES, TAILLE_TUILE } from './carte.js'

// Paramètres de génération (en tuiles).
const PARAMETRES = {
    largeur: 64,
    hauteur: 48,
    nombre_pieces_max: 10,
    tentatives: 60,
    largeur_piece: [6, 12],
    hauteur_piece: [5, 9],
    // Murs minimum entre deux pièces.
    ecart_pieces: 2,
    largeur_couloir: 2,
}

// Carte de test : des pièces rectangulaires sans chevauchement, chacune reliée à la
// plus proche des pièces déjà placées par un couloir en L. Toutes les pièces sont donc
// accessibles. generateur : un flux de utilitaires/hasard.js ; la carte ne dépend que
// de lui, si bien qu'une même graine redonne la même carte.
export function generer_carte(generateur, parametres = PARAMETRES) {
    const carte = new Carte(parametres.largeur, parametres.hauteur)

    for (let i = 0; i < parametres.tentatives && carte.pieces.length < parametres.nombre_pieces_max; i++) {
        const largeur = generateur.entier(...parametres.largeur_piece)
        const hauteur = generateur.entier(...parametres.hauteur_piece)
        // Au moins une tuile de mur entre la pièce et le bord de la carte.
        const piece = {
            x: generateur.entier(1, carte.largeur - largeur - 1),
            y: generateur.entier(1, carte.hauteur - hauteur - 1),
            largeur,
            hauteur,
        }
        if (carte.pieces.some((autre) => pieces_trop_proches(piece, autre, parametres.ecart_pieces))) continue

        carte.remplir(piece.x, piece.y, piece.x + largeur - 1, piece.y + hauteur - 1, TUILES.SOL)
        const plus_proche = piece_la_plus_proche(piece, carte.pieces)
        if (plus_proche) creuser_couloir(carte, centre(plus_proche), centre(piece), parametres.largeur_couloir, generateur)
        carte.pieces.push(piece)
    }

    return carte
}

// Centre d'une pièce, en tuiles entières.
const centre = (piece) => ({
    x: piece.x + Math.floor(piece.largeur / 2),
    y: piece.y + Math.floor(piece.hauteur / 2),
})

// Position de départ (pixels) d'une entité de la taille donnée, centrée dans la première pièce.
export function position_depart(carte, largeur, hauteur) {
    const { x, y } = centre(carte.pieces[0])
    return {
        x: x * TAILLE_TUILE + (TAILLE_TUILE - largeur) / 2,
        y: y * TAILLE_TUILE + (TAILLE_TUILE - hauteur) / 2,
    }
}

function pieces_trop_proches(a, b, ecart) {
    return (
        a.x - ecart < b.x + b.largeur &&
        a.x + a.largeur + ecart > b.x &&
        a.y - ecart < b.y + b.hauteur &&
        a.y + a.hauteur + ecart > b.y
    )
}

// Distance au carré entre centres : calcul entier, identique sur tous les navigateurs.
function piece_la_plus_proche(piece, pieces) {
    const c = centre(piece)
    let meilleure = null
    let meilleure_distance = Infinity
    for (const autre of pieces) {
        const o = centre(autre)
        const distance = (o.x - c.x) ** 2 + (o.y - c.y) ** 2
        if (distance < meilleure_distance) {
            meilleure = autre
            meilleure_distance = distance
        }
    }
    return meilleure
}

// Couloir en L de a vers b, horizontal puis vertical ou l'inverse (au hasard).
function creuser_couloir(carte, a, b, largeur, generateur) {
    const e = largeur - 1
    if (generateur.chance(0.5)) {
        carte.remplir(a.x, a.y, b.x + e, a.y + e, TUILES.SOL)
        carte.remplir(b.x, a.y, b.x + e, b.y + e, TUILES.SOL)
    } else {
        carte.remplir(a.x, a.y, a.x + e, b.y + e, TUILES.SOL)
        carte.remplir(a.x, b.y, b.x + e, b.y + e, TUILES.SOL)
    }
}
