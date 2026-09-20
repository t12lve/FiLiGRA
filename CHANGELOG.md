# Journal des Modifications (Changelog)

Toutes les évolutions notables du projet **FiLiGRA** sont consignées dans ce fichier.

---

## [v1.3.1] - 2026-09-20

### 🚀 PWA, Compatibilité & Correctifs
- **Icônes PWA PC & Mobile (`ico.png`)** : Utilisation exclusive de `ico.png` (véritable logo triangulaire néon FiLiGRA) dans le `manifest.json`, les balises `favicon`, `shortcut icon` et `apple-touch-icon`. Remplacement préventif de tous les assets d'icônes pour éliminer l'ancienne icône temporaire.
- **Typographie** : Remplacement de tous les tirets cadratins `—` par des tirets simples `-` sur l'ensemble du projet (titre, manifest, interface, logs et documentation).
- **Compatibilité Safari (iOS, iPadOS, macOS Sonoma+)** :
  - Hardening du Service Worker (`sw.js`) pour éviter le crash Fetch sur statut 304/204.
  - Gestion des requêtes partielles HTTP Range pour le streaming Safari.
  - Détection avancée iPadOS (Safari tactile sur MacIntel) et macOS Sonoma ("Ajouter au Dock").
  - Web Share API (`navigator.share`) pour enregistrer la vidéo directement dans l'application **Photos** sur iPhone et iPad.
  - Support de l'encoche et de la Dynamic Island (`env(safe-area-inset-top)`).
- **Compatibilité Firefox (Android & Desktop)** :
  - Prise en charge de l'installation sur Firefox Android via le menu dédié.
  - Recommandations ergonomiques pour Firefox Bureau.
- **Guide d'installation multi-navigateurs** :
  - Détection automatique du navigateur actif avec badge temps réel.
  - Onglets interactifs par navigateur dans le tiroir d'aide.
  - Modale guidée étape par étape avec illustrations visuelles.

---

## [v1.2.0] - 2026-09-19

### ✨ Nouvelles Fonctionnalités
- **File d'attente d'encodage** : Possibilité d'importer et d'encoder plusieurs vidéos à la suite.
- **Auto-save dossier** : Sauvegarde directe dans un dossier local via l'API File System Access (Chrome, Edge) sans confirmation à chaque vidéo.
- **Téléchargement automatique immédiat** en fallback pour les autres navigateurs.

---

## [v1.1.2] - 2026-09-19

### 🐛 Correctifs
- Ajustement des poignées tactiles et des zones de prévisualisation mobile.
- Amélioration de la fluidité du drag-and-drop de filigrane sur mobile.

---

## [v1.1.1] - 2026-09-19

### ⚡ Améliorations
- Conservation de la cadence (fps) source de la vidéo.
- Activation de l'API Screen Wake Lock pour maintenir l'écran allumé pendant l'encodage.

---

## [v1.1.0] - 2026-09-19

### 📱 PWA & Mobile
- Support initial PWA et Service Worker COI (Cross-Origin Isolation).
- Poignées d'ajustement du filigrane tactiles.
- Détection des zones sûres TikTok, Instagram Reels, YouTube Shorts.

---

## [v1.0.0] - 2026-09-19

### 🎉 Version Initiale
- Studio client-side d'incrustation de filigrane vidéo propulsé par FFmpeg.wasm.
- 100% sans serveur, respect total de la confidentialité.
- Export MP4 H.264 compatible web et mobile (`yuv420p`, `faststart`).
