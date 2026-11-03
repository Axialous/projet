// Chargement et cache des textures et des sons.
// Les fichiers du dossier jeu/ sont servis depuis la racine du site :
//
//   await jeu.ressources.charger_texture('joueur', '/textures/joueur.png')
//   const texture = jeu.ressources.texture('joueur')
export class ChargeurRessources {
    constructor() {
        this.textures = new Map()
        this.sons = new Map()
    }

    charger_texture(cle, source) {
        if (this.textures.has(cle)) return Promise.resolve(this.textures.get(cle))
        return new Promise((resoudre, rejeter) => {
            const image = new Image()
            image.onload = () => {
                this.textures.set(cle, image)
                resoudre(image)
            }
            image.onerror = () => rejeter(new Error(`Texture introuvable : ${source}`))
            image.src = source
        })
    }

    charger_son(cle, source) {
        if (this.sons.has(cle)) return Promise.resolve(this.sons.get(cle))
        return new Promise((resoudre, rejeter) => {
            const audio = new Audio()
            audio.oncanplaythrough = () => {
                this.sons.set(cle, audio)
                resoudre(audio)
            }
            audio.onerror = () => rejeter(new Error(`Son introuvable : ${source}`))
            audio.src = source
        })
    }

    texture(cle) {
        return this.textures.get(cle)
    }

    jouer_son(cle, volume = 1) {
        const son = this.sons.get(cle)
        if (!son) return
        const copie = son.cloneNode()
        copie.volume = volume
        copie.play().catch(() => {})
    }
}
