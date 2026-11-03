COMPOSE = docker compose
SERVICE = projet
PORT ?= 3000

export PORT

.DEFAULT_GOAL := up

.PHONY: help build up down restart logs shell ps clean re local

help: ## Affiche cette aide
	@grep -E '^[a-z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

build: ## Construit l'image du jeu
	$(COMPOSE) build

up: ## Lance le jeu en arrière-plan (port 3000, ou PORT=...)
	$(COMPOSE) up -d --build
	@echo "Jeu disponible sur http://localhost:$(PORT)"

down: ## Arrête les conteneurs
	$(COMPOSE) down

restart: down up ## Redémarre les conteneurs

logs: ## Affiche les journaux du serveur
	$(COMPOSE) logs -f $(SERVICE)

shell: ## Ouvre un terminal dans le conteneur
	$(COMPOSE) exec $(SERVICE) sh

ps: ## Liste les conteneurs
	$(COMPOSE) ps

clean: ## Arrête et supprime conteneurs, images et volumes du projet
	$(COMPOSE) down --rmi local --volumes --remove-orphans

re: clean up ## Reconstruit tout depuis zéro

local: ## Lance le serveur sans Docker (nécessite Node.js)
	cd projet && node --watch serveur/serveur.js
