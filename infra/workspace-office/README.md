# Référence d’infrastructure ONLYOFFICE — AgriCapital 360

Ce dossier est une référence de déploiement facultative pour un serveur ONLYOFFICE Docs/Nextcloud. Il ne crée aucun lien de menu dans le CRM et ne signifie pas que le serveur est déployé ou connecté.

## Décision d’intégration

- Le seul point d’entrée utilisateur des outils documentaires est **AgriCapital 360**, dans l’onglet **Éditeur intégré**.
- Aucune URL publique de serveur documentaire n’est codée dans le frontend ou dans `.env.example`.
- Le CRM ne doit pas ouvrir une suite bureautique séparée ni afficher une intégration comme opérationnelle sans test réel.
- L’éditeur intégré actuel est un éditeur riche pour les documents texte et des outils d’import/export pour les formats bureautiques. Il ne doit pas être présenté comme l’éditeur natif complet ONLYOFFICE.

## Peut-on copier directement le dépôt ONLYOFFICE dans le CRM ?

Non, pas en copiant seulement ses fichiers frontend. Le dépôt officiel regroupe plusieurs composants (serveur, moteur de conversion, SDK JavaScript et applications web). L’interface web seule ne fournit pas le moteur qui ouvre, convertit, coédite et sauvegarde les fichiers. La solution réaliste est d’utiliser la version communautaire officielle du Document Server comme composant déployé, puis de l’afficher à l’intérieur d’AgriCapital 360. Il ne faut pas importer arbitrairement des milliers de fichiers sources dans l’application Vite/Vercel.

Source officielle : https://github.com/ONLYOFFICE/DocumentServer

## Déploiement de référence

Ce dossier peut servir à préparer un serveur Linux administré avec Docker. Avant toute mise en service, vérifier le DNS, TLS, la persistance des fichiers, les sauvegardes, les limites de ressources et les conditions de licence. Ne jamais committer les secrets du serveur.

La configuration de ce dossier n’est pas une preuve que le serveur est disponible en production. L’intégration ne peut être déclarée terminée qu’après un test complet dans AgriCapital 360 : créer un document, l’ouvrir dans l’éditeur natif, le modifier, enregistrer, rouvrir et confirmer que le même fichier et les droits d’accès sont respectés.
