// Durée en secondes → « moins d'une minute », « 12 min », « 1 h 05 ».
export function formater_duree(secondes) {
    const minutes = Math.floor(secondes / 60)
    if (minutes < 1) return "moins d'une minute"
    const heures = Math.floor(minutes / 60)
    if (heures === 0) return `${minutes} min`
    return `${heures} h ${String(minutes % 60).padStart(2, '0')}`
}

// Instant en millisecondes → « 04/11/2026 14:32 ».
export const formater_date = (instant) =>
    new Date(instant).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
