// Paramètres globaux du jeu.
export const CONFIGURATION = {
    largeur: 800,
    hauteur: 600,
    // Pas de temps fixe pour la logique (60 mises à jour par seconde).
    pas_fixe: 1 / 60,
    debogage: true,
    // Préfixe des clés du stockage local, pour ne pas mélanger les données de plusieurs jeux
    // servis depuis la même adresse.
    prefixe_stockage: 'mon-jeu.',
}
