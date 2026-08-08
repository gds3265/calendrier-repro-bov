REPRO BOVINE — V1.0

Application web/PWA indépendante de suivi de reproduction bovine.

Démarrage :
1. Mettre tous les fichiers à la racine d'un dépôt GitHub Pages (ou serveur web).
2. Ouvrir index.html via l'adresse du site.
3. Sur téléphone, ajouter le site à l'écran d'accueil pour un usage type application.

Base initiale : GDS65_ejegou_bovins_07082026235908.csv
- 98 femelles présentes intégrées
- 12 mâles présents listés dans Taureaux
- dernier vêlage/rang reconstitués à partir des veaux historiques lorsque disponibles

Fonctions V1 :
- Tableau Aujourd'hui et 7 jours
- Calendrier jour/semaine/mois
- Recherche vache par nom ou numéro de travail
- Fiche vache + historique des événements
- Chaleur, IA/saillie, gestation confirmée, diagnostic négatif, vêlage
- Taureaux de monte activables + taureaux IA mémorisés
- Statut pleine / supposée pleine avec nombre de jours
- Alertes paramétrables : retour chaleur, diagnostic, pré-vêlage, terme, post-vêlage
- Import CSV GDS
- Export/restauration JSON
- Données enregistrées localement sur l'appareil

Notifications V1 :
- Permission et notification de synthèse disponibles lorsque l'application est ouverte.
- Les notifications push automatiques en arrière-plan nécessiteront un service serveur/push dans une version suivante.
