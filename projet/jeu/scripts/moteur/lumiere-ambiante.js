// Lumière ambiante (façon « ambilight ») : à chaque image, les couleurs de ce qui est affiché
// pour le jeu, assombries et étendues sur tout le fond de l'écran.
//
// L'image capturée, limitée aux zones de jeu (le reste est transparent), est réduite de
// moitié en moitié jusqu'à un pixel : chaque niveau moyenne les couleurs du précédent, en
// tenant compte de leur opacité. On remonte ensuite jusqu'à la résolution voulue en
// glissant chaque niveau, agrandi, sous le suivant : les vides se remplissent des couleurs
// des zones de jeu proches, puis, plus loin, de leur moyenne d'ensemble. Le résultat,
// agrandi à la taille de l'écran par lissage, donne un fond flou et continu.
export class LumiereAmbiante {
    // resolution : largeur (pixels) de l'image de fond, avant agrandissement.
    // luminosite : facteur appliqué aux couleurs (0 : noir, 1 : couleurs d'origine).
    constructor({ resolution = 64, luminosite = 0.2 } = {}) {
        this.resolution = resolution
        this.luminosite = luminosite
        // Niveaux de réduction, du plus grand (moitié de l'écran) à 1 × 1.
        this.niveaux = []
        this.cible = 0
        this.largeur_source = 0
        this.hauteur_source = 0
        // Faux tant qu'aucune image n'a été capturée.
        this.prete = false
    }

    // Oublie la dernière capture (changement de scène…).
    effacer() {
        this.prete = false
    }

    // Recrée les niveaux quand la taille de la source change.
    adapter_niveaux(largeur, hauteur) {
        if (largeur === this.largeur_source && hauteur === this.hauteur_source) return
        this.largeur_source = largeur
        this.hauteur_source = hauteur
        this.niveaux = []
        this.cible = -1
        let l = largeur
        let h = hauteur
        do {
            l = Math.max(1, Math.ceil(l / 2))
            h = Math.max(1, Math.ceil(h / 2))
            const contexte = new OffscreenCanvas(l, h).getContext('2d')
            contexte.imageSmoothingEnabled = true
            contexte.imageSmoothingQuality = 'low'
            this.niveaux.push(contexte)
            if (this.cible < 0 && l <= this.resolution) this.cible = this.niveaux.length - 1
        } while (l > 1 || h > 1)
    }

    // source : canvas de l'écran. rectangles : zones de jeu, en pixels réels de la source.
    capturer(source, rectangles) {
        if (this.commencer_capture(source)) this.terminer_capture(rectangles)
    }

    // Capture en deux temps, pour prendre ce que la source ne montre pas tel quel (le jeu
    // avant estompage de ses bords…) : commencer_capture copie la source, réduite, dans
    // le premier niveau, et renvoie son contexte (null si la source est vide). Sa
    // transformation y fait dessiner en pixels réels de la source : on peut y ajouter des
    // dessins, puis terminer_capture fait le reste.
    commencer_capture(source) {
        const { width: largeur, height: hauteur } = source
        if (largeur <= 0 || hauteur <= 0) return null
        this.adapter_niveaux(largeur, hauteur)
        const premier = this.niveaux[0]
        premier.setTransform(1, 0, 0, 1, 0, 0)
        premier.globalCompositeOperation = 'copy'
        premier.drawImage(source, 0, 0, premier.canvas.width, premier.canvas.height)
        premier.globalCompositeOperation = 'source-over'
        premier.setTransform(premier.canvas.width / largeur, 0, 0, premier.canvas.height / hauteur, 0, 0)
        return premier
    }

    // rectangles : zones de jeu, en pixels réels de la source ; le reste est ignoré.
    terminer_capture(rectangles) {
        const niveaux = this.niveaux
        const dimensions = (contexte) => [contexte.canvas.width, contexte.canvas.height]
        const premier = niveaux[0]
        if (rectangles.length === 0) {
            premier.setTransform(1, 0, 0, 1, 0, 0)
            return
        }

        // Premier niveau limité aux zones de jeu.
        premier.globalCompositeOperation = 'destination-in'
        premier.beginPath()
        for (const { x, y, largeur: l, hauteur: h } of rectangles) premier.rect(x, y, l, h)
        premier.fillStyle = '#fff'
        premier.fill()
        premier.setTransform(1, 0, 0, 1, 0, 0)

        // Réductions successives.
        for (let k = 1; k < niveaux.length; k++) {
            const contexte = niveaux[k]
            contexte.globalCompositeOperation = 'copy'
            contexte.drawImage(niveaux[k - 1].canvas, 0, 0, ...dimensions(contexte))
        }

        // Le dernier pixel, couleur moyenne des zones de jeu, rendu opaque : un pixel
        // d'opacité a dessiné sur lui-même garde sa couleur et passe à 1 − (1 − a)².
        const dernier = niveaux[niveaux.length - 1]
        dernier.globalCompositeOperation = 'source-over'
        for (let i = 0; i < 12; i++) dernier.drawImage(dernier.canvas, 0, 0)

        // Remontée : chaque niveau, opaque, comble les vides du suivant, qui le devient.
        for (let k = niveaux.length - 2; k >= this.cible; k--) {
            const contexte = niveaux[k]
            contexte.globalCompositeOperation = 'destination-over'
            contexte.drawImage(niveaux[k + 1].canvas, 0, 0, ...dimensions(contexte))
        }

        // Image affichée, assombrie : dans son propre canvas, que la capture suivante ne
        // touche pas avant d'être terminée.
        const cible = niveaux[this.cible]
        const [l, h] = dimensions(cible)
        this.image ??= new OffscreenCanvas(1, 1).getContext('2d')
        if (this.image.canvas.width !== l || this.image.canvas.height !== h) {
            this.image.canvas.width = l
            this.image.canvas.height = h
        }
        const gris = Math.round(Math.max(0, Math.min(1, this.luminosite)) * 255)
        this.image.globalCompositeOperation = 'copy'
        this.image.drawImage(cible.canvas, 0, 0)
        this.image.globalCompositeOperation = 'multiply'
        this.image.fillStyle = `rgb(${gris}, ${gris}, ${gris})`
        this.image.fillRect(0, 0, l, h)
        this.prete = true
    }

    // Dessine le fond sur tout l'écran (pixels réels), décalé de (x, y) : pour dessiner dans
    // un canvas qui ne couvre qu'une partie de l'écran, à partir de ce point.
    dessiner(contexte, x = 0, y = 0) {
        if (!this.prete) return
        contexte.save()
        contexte.setTransform(1, 0, 0, 1, -x, -y)
        contexte.imageSmoothingEnabled = true
        contexte.imageSmoothingQuality = 'high'
        contexte.drawImage(this.image.canvas, 0, 0, this.largeur_source, this.hauteur_source)
        contexte.restore()
    }
}
