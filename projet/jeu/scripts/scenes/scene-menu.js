import { Scene } from '../moteur/scene.js'
import { Menu } from '../interface/menu.js'
import { formater_date, formater_duree } from '../utilitaires/temps.js'
import { ScenePartie } from './scene-partie.js'

// Menu principal.
export class SceneMenu extends Scene {
    async entrer() {
        let resumes = []
        try {
            resumes = await this.jeu.sauvegardes.lister()
        } catch (erreur) {
            console.error(erreur)
        }
        // Évite de lancer deux chargements pendant la lecture d'une sauvegarde.
        this.occupe = false

        this.menu = new Menu(this.jeu, {
            titre: 'Mon jeu',
            elements: [
                { libelle: 'Nouvelle partie', choisir: () => this.jeu.scenes.changer(new ScenePartie(this.jeu)) },
                {
                    libelle: 'Charger une partie',
                    // Grisé tant qu'aucune partie ne peut être chargée.
                    desactive: !resumes.some((resume) => !resume.erreur),
                    sous_menu: () => this.creer_page_chargement(resumes),
                },
            ],
        })
    }

    // Parties sauvegardées, de la plus récente à la plus ancienne.
    creer_page_chargement(resumes) {
        return {
            titre: 'Charger une partie',
            elements: resumes.map((resume) => {
                if (resume.erreur) return { libelle: `Illisible : ${resume.erreur}`, desactive: true }
                return {
                    libelle: `${formater_date(resume.modifiee_le)} — ${formater_duree(resume.duree_jeu)}`,
                    choisir: () => this.charger(resume.id),
                }
            }),
        }
    }

    async charger(id) {
        if (this.occupe) return
        this.occupe = true
        try {
            const donnees = await this.jeu.sauvegardes.lire(id)
            await this.jeu.scenes.changer(new ScenePartie(this.jeu, { id, donnees }))
        } catch (erreur) {
            console.error(erreur)
            this.menu.message = `Chargement impossible : ${erreur.message}`
        } finally {
            this.occupe = false
        }
    }

    mettre_a_jour(delta) {
        super.mettre_a_jour(delta)
        this.menu.mettre_a_jour(delta)
    }

    dessiner(contexte, avancement) {
        super.dessiner(contexte, avancement)
        this.menu.dessiner(contexte)
    }
}
