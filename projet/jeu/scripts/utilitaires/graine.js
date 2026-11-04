// Graine d'une partie : entier non signé de 32 bits, la taille d'état des générateurs
// pseudo-aléatoires simples (mulberry32, sfc32). Affichée en 8 chiffres hexadécimaux.

// Tirée avec crypto, indépendante de Math.random.
export const generer_graine = () => crypto.getRandomValues(new Uint32Array(1))[0]

export const est_graine_valide = (graine) => Number.isInteger(graine) && graine >= 0 && graine <= 0xffffffff

// 1052003367 → « 3EB45C27 »
export const formater_graine = (graine) => graine.toString(16).toUpperCase().padStart(8, '0')
