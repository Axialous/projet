// Paramètres globaux du jeu.
export const CONFIGURATION = {
    largeur: 800,
    hauteur: 600,
    // Fréquence de la simulation (logique du jeu), indépendante de celle de l'affichage :
    // l'affichage interpole entre les deux dernières simulations.
    simulations_par_seconde: 16,
    debogage: true,
    // Préfixe des clés du stockage local, pour ne pas mélanger les données de plusieurs jeux
    // servis depuis la même adresse.
    prefixe_stockage: 'mon-jeu.',
}
