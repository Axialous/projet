# Règles du projet

## Architecture

- Tout passe par Docker : `Makefile` → `compose.yaml` → `projet/Dockerfile`.
- Aucun framework ni dépendance npm : uniquement Node.js et ses modules natifs côté serveur, JavaScript natif (modules ES, Canvas 2D) côté navigateur.
- `projet/` (nom provisoire du projet) contient :
    - `serveur/` : serveur HTTP statique (Node.js) qui sert le dossier `jeu/`.
    - `docs/` : documentation.
    - `jeu/` : le jeu servi au navigateur. Ses dossiers principaux sont directement à sa racine, regroupés par nature (`scripts/`, `styles/`, `textures/`, `sons/`…), sans dossier intermédiaire de type `src/` ou `assets/`.

## Nommage

- Tout est nommé en français : fichiers, dossiers, variables, fonctions, méthodes, propriétés, classes.
- Exception : les cibles du `Makefile` restent en anglais (`up`, `down`, `logs`…).
- Pas d'accents ni de caractères spéciaux dans les noms (`entite`, `entrees`, `arreter`).
- Fichiers et dossiers : mots séparés par des tirets (`gestionnaire-scenes.js`).
- Variables, fonctions, méthodes et propriétés : snake_case (`mettre_a_jour`).
- Classes : PascalCase (`GestionnaireScenes`). Constantes de module : UPPER_SNAKE_CASE (`TYPES_MIME`).
- Les API du navigateur et de Node.js (`addEventListener`, `fillRect`…) gardent leur nom d'origine.

## Style de code

- Indentation : 4 espaces, jamais de tabulation. Seule exception : les lignes de commande du `Makefile`, que make impose en tabulation. Voir `.editorconfig`.
- JavaScript : pas de `;` en fin de ligne.
- Commentaires et textes affichés en français.
