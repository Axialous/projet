// Paramètres globaux du jeu.
export const CONFIGURATION = {
    // Pixels réels du canvas au plus ; au-delà, le navigateur étire l'image.
    pixels_max: 2560 * 1440,
    // Fréquence de la simulation (logique du jeu), indépendante de celle de l'affichage :
    // l'affichage interpole entre les deux dernières simulations.
    simulations_par_seconde: 16,
    // Fond de l'écran aux couleurs de ce qui est affiché pour le jeu (façon « ambilight »),
    // ou null pour un fond uni. resolution : largeur (pixels) de l'image de fond avant
    // agrandissement, plus faible pour plus de flou ; luminosite : de 0 (noir) à 1.
    lumiere_ambiante: { resolution: 64, luminosite: 0.2 },
    debogage: true,
    // Préfixe des clés du stockage local, pour ne pas mélanger les données de plusieurs jeux
    // servis depuis la même adresse.
    prefixe_stockage: 'mon-jeu.',
}
