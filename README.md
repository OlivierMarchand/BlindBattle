# Blind Battle

Blind-test multijoueur temps réel (2–8 joueurs) avec salons à code, score de vitesse, séries, bonus et malus.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000` dans plusieurs navigateurs/téléphones.

## Musique

### Mode démo — zéro configuration
Le jeu contient un mini catalogue synthétique original. Il fonctionne immédiatement.

### Mode Jamendo
Ajouter une variable d’environnement `JAMENDO_CLIENT_ID`. Le lobby ajoute automatiquement les thèmes Pop, Rock, Électro, Hip-Hop, Funk & Groove et Chill. Les morceaux sont récupérés avec l’API Jamendo au lancement de la partie.

```bash
JAMENDO_CLIENT_ID=xxxxxxxx npm start
```

Jamendo demande un Client ID. Vérifier les licences/conditions adaptées à l’usage visé avant une diffusion publique ou commerciale.

### MassiveMusic / autre fournisseur
La logique musique est isolée dans `music-provider.js`. Un autre catalogue peut donc remplacer ou compléter Jamendo sans modifier le gameplay Socket.IO.

## Déploiement
Le projet est un serveur Node/Express + Socket.IO. Une plateforme qui garde un processus Node actif et supporte les WebSockets convient (Railway, Render, etc.).

Commande de démarrage :

```bash
npm start
```

Le serveur écoute `process.env.PORT`.

## Gameplay actuel
- création/rejoint d’un salon via code 5 caractères ;
- 2 à 8 joueurs ;
- choix du thème et de 3 à 8 manches ;
- réponses libres titre **ou** artiste, avec petite tolérance aux fautes ;
- points selon rapidité + bonus de première réponse + séries ;
- power-ups : Bouclier, Freeze, Blackout, Taxe ;
- classement live et revanche.
