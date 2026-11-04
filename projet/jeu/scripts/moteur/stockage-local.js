// Stockage clé → texte dans le localStorage du navigateur, sous un préfixe propre au jeu.
// Pour changer de support (serveur…), fournir une autre classe avec les mêmes méthodes,
// toutes asynchrones :
//   lister_cles(prefixe) → clés (sans le préfixe du jeu) commençant par prefixe
//   lire(cle)            → texte, ou null si la clé n'existe pas
//   ecrire(cle, texte)
//   supprimer(cle)
export class StockageLocal {
    constructor(prefixe) {
        this.prefixe = prefixe
    }

    // L'accès au localStorage peut lever une exception (navigation privée, données du site bloquées…).
    get stockage() {
        let stockage = null
        try {
            stockage = window.localStorage
        } catch {
            // Traité ci-dessous.
        }
        if (!stockage) throw new Error('stockage local indisponible')
        return stockage
    }

    async lister_cles(prefixe = '') {
        const stockage = this.stockage
        const debut = this.prefixe + prefixe
        const cles = []
        for (let indice = 0; indice < stockage.length; indice++) {
            const cle = stockage.key(indice)
            if (cle?.startsWith(debut)) cles.push(cle.slice(this.prefixe.length))
        }
        return cles
    }

    async lire(cle) {
        return this.stockage.getItem(this.prefixe + cle)
    }

    async ecrire(cle, texte) {
        try {
            this.stockage.setItem(this.prefixe + cle, texte)
        } catch (erreur) {
            if (erreur?.name === 'QuotaExceededError') throw new Error('espace de stockage insuffisant')
            throw erreur
        }
    }

    async supprimer(cle) {
        this.stockage.removeItem(this.prefixe + cle)
    }
}
