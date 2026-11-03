// Contraint une valeur entre un minimum et un maximum.
export const borner = (valeur, minimum, maximum) => Math.max(minimum, Math.min(maximum, valeur))

// Interpolation linéaire entre a et b (t entre 0 et 1).
export const interpoler = (a, b, t) => a + (b - a) * t

export const aleatoire_entre = (minimum, maximum) => minimum + Math.random() * (maximum - minimum)

// Collision entre deux rectangles alignés sur les axes ({ x, y, largeur, hauteur }).
export const rectangles_se_chevauchent = (a, b) =>
    a.x < b.x + b.largeur &&
    a.x + a.largeur > b.x &&
    a.y < b.y + b.hauteur &&
    a.y + a.hauteur > b.y
