# Journal des Modifications (Changelog)

Toutes les évolutions notables du projet **FiLiGRA** sont consignées dans ce fichier.

---

## [v1.4.0] - 2026-10-08

### 📸 Support Complet des Photos & Redimensionnement en Résolution (%)
- **Traitement Intégral des Photos** : Importation de photos et images dans tous les formats communs (JPG, JPEG, PNG, WebP, AVIF, GIF, SVG, BMP, TIFF, HEIC/HEIF).
- **Export Qualité Maximale par Défaut** : Lors de l'import d'une image, l'export est automatiquement calibré à la qualité maximale (100% / sans perte).
- **Sélecteur de Format & Qualité Image** : Choix du format de sortie (Conserver Source, PNG sans perte, JPEG 100% max, WebP 100% max) et curseur de qualité fin.
- **Redimensionnement en Résolution (%)** : Contrôle dédié permettant d'ajuster l'échelle de résolution de l'image de sortie de 10% à 200% (boutons rapides 25%, 50%, 75%, 100%, 150%, 200%) avec calcul en temps réel des dimensions en pixels.
- **Pipeline Image HD Instantané** : Composition 2D Canvas haute fidélité ultra-rapide 100% locale, sans latence ni perte de qualité.
- **File d'Attente Mixte Photos & Vidéos** : Possibilité de charger par lot des photos et vidéos pour un traitement en chaîne avec sauvegarde automatique.
- **UI Dynamique et Adaptative** : L'interface s'adapte automatiquement selon que le média chargé est une photo ou une vidéo (titres, puces d'informations, contrôles de timeline, estimations de poids).

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
