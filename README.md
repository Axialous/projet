# Projet (nom provisoire)

Jeu vidéo en JavaScript natif (Canvas 2D), servi par un petit serveur Node.js dans Docker.
Aucun framework, aucune dépendance npm.

## Démarrer

```bash
make            # construit et lance le jeu → http://localhost:3000
make logs       # suit les journaux du serveur
make down       # arrête
make help       # liste toutes les commandes
```

Les dossiers `projet/jeu/` et `projet/serveur/` sont montés dans le conteneur : modifiez un fichier puis rafraîchissez le navigateur.
Pour changer de port : `make PORT=8080`. Sans Docker : `make local`.

## Structure

```
Makefile                        Commandes du projet
compose.yaml                    Service Docker « projet »
projet/
    Dockerfile                  Image node:24-alpine
    package.json
    serveur/
        serveur.js              Serveur HTTP statique (modules natifs Node.js)
    docs/                       Documentation
    jeu/                        Tout ce qui est servi au navigateur
        index.html
        styles/
            principal.css
        textures/               Images, accessibles via /textures/...
        sons/                   Sons, accessibles via /sons/...
        scripts/
            principal.js        Point d'entrée : crée le jeu et lance le menu
            configuration.js    Taille, pas de temps, débogage
            moteur/             Moteur, indépendant du jeu
                jeu.js                      Boucle (logique à pas fixe, affichage par image)
                entrees.js                  Clavier et souris
                scene.js                    Classe de base des scènes
                gestionnaire-scenes.js      Scène active et transitions
                chargeur-ressources.js      Chargement des textures et sons
            entites/            entite.js (base), joueur.js (démo)
            scenes/             scene-menu.js, scene-partie.js
            utilitaires/        maths.js (borner, interpoler, collisions…)
```

## Commandes en jeu

- Menu : Entrée, Espace ou clic pour lancer
- Partie : flèches ou ZQSD pour se déplacer, Échap pour revenir au menu

## Conventions

Voir [CLAUDE.md](CLAUDE.md) : noms en français, tirets dans les noms de fichiers, snake_case dans le code, indentation de 4 espaces, pas de `;` en JS.
