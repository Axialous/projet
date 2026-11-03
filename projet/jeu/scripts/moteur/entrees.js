// État du clavier et de la souris.
// - est_maintenue(code) : touche maintenue
// - vient_d_etre_appuyee(code) : touche enfoncée pendant cette mise à jour
// Les codes sont ceux de KeyboardEvent.code (ex. 'ArrowLeft', 'KeyW', 'Space').
export class Entrees {
    constructor(ecran) {
        this.ecran = ecran
        this.maintenues = new Set()
        this.appuyees = new Set()
        this.souris = { x: 0, y: 0, enfoncee: false, cliquee: false }

        window.addEventListener('keydown', (evenement) => {
            if (!this.maintenues.has(evenement.code)) this.appuyees.add(evenement.code)
            this.maintenues.add(evenement.code)
            if (evenement.code.startsWith('Arrow') || evenement.code === 'Space') {
                evenement.preventDefault()
            }
        })
        window.addEventListener('keyup', (evenement) => this.maintenues.delete(evenement.code))
        window.addEventListener('blur', () => this.maintenues.clear())

        ecran.addEventListener('mousemove', (evenement) => this.suivre_souris(evenement))
        ecran.addEventListener('mousedown', (evenement) => {
            this.suivre_souris(evenement)
            this.souris.enfoncee = true
            this.souris.cliquee = true
        })
        window.addEventListener('mouseup', () => {
            this.souris.enfoncee = false
        })
    }

    // Convertit les coordonnées de la page en coordonnées de l'écran de jeu (gère le redimensionnement CSS).
    suivre_souris(evenement) {
        const cadre = this.ecran.getBoundingClientRect()
        this.souris.x = ((evenement.clientX - cadre.left) / cadre.width) * this.ecran.width
        this.souris.y = ((evenement.clientY - cadre.top) / cadre.height) * this.ecran.height
    }

    est_maintenue(code) {
        return this.maintenues.has(code)
    }

    vient_d_etre_appuyee(code) {
        return this.appuyees.has(code)
    }

    // Appelé par Jeu après chaque mise à jour logique.
    terminer_mise_a_jour() {
        this.appuyees.clear()
        this.souris.cliquee = false
    }
}
