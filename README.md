# TurismoBCC

Extension Chrome (Manifest V3) qui ajoute **automatiquement une adresse en Cci (BCC)**
à chaque nouveau message Gmail. Aucune dépendance, aucun serveur : tout tourne en local
dans le navigateur.

## Installation (mode développeur)

1. Ouvre Chrome et va sur `chrome://extensions`
2. Active le **Mode développeur** (interrupteur en haut à droite)
3. Clique sur **Charger l'extension non empaquetée**
4. Sélectionne le dossier `gmail-auto-bcc`
5. Épingle l'icône **T** bleue dans la barre d'outils

## Configuration

1. Clique sur l'icône **TurismoBCC**
2. Saisis l'adresse à mettre en copie cachée (ex. `archive@drive-turismo.com`)
3. Laisse l'interrupteur **Activer** sur ON

L'adresse est mémorisée (synchronisée via ton compte Chrome) et réappliquée
à chaque nouveau message.

## Ce qui est couvert

- ✅ Nouveau message (fenêtre de composition)
- ✅ Réponse / transfert **détaché** (pop-out, avec objet)
- ⚠️ Réponse **en ligne** dans le fil : le champ Objet n'existe pas, donc non
  couverte pour l'instant (passe la réponse en pop-out via ⤢ si besoin).

## Sécurité / vie privée

- L'extension n'agit que sur `mail.google.com`.
- Elle n'écrit **jamais** dans un champ qu'elle n'a pas identifié comme étant le
  Cci (via `name="bcc"` ou l'`aria-label` multilingue) : en cas de doute, elle
  s'abstient plutôt que de risquer d'écrire dans « À » ou « Cc ».
- Aucune donnée n'est envoyée nulle part ; seule l'adresse Cci est stockée
  localement (`chrome.storage.sync`).

## Si l'insertion ne se fait pas

Gmail obfusque et fait évoluer son DOM. Toute la logique de sélection est
regroupée et commentée dans `content.js` (fonctions `findBccInput` et
`findBccToggle`). En cas de casse, ce sont les seuls endroits à ajuster.

## Fichiers

| Fichier         | Rôle                                             |
| --------------- | ------------------------------------------------ |
| `manifest.json` | Déclaration de l'extension (MV3)                 |
| `content.js`    | Détection des fenêtres + insertion du Cci        |
| `popup.html/js` | Réglages (adresse + activation)                  |
| `icons/`        | Logo T                                           |
