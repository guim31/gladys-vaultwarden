# Vaultwarden

Surveillez votre serveur [Vaultwarden](https://github.com/dani-garcia/vaultwarden)
dans Gladys : un appareil « Vaultwarden » (joignable ou non, temps de réponse,
version, mise à jour disponible et dernière version, et avec le jeton
d'administration les utilisateurs, organisations, invitations en attente,
comptes désactivés et la dernière activité), un widget de tableau de bord, et
des déclencheurs de scène quand le serveur devient injoignable, revient, ou
quand une nouvelle version paraît.

Vaultwarden est le serveur léger et auto-hébergé compatible avec les
applications Bitwarden. Cette intégration **ne fait que surveiller le serveur
de l'extérieur** : elle ne se connecte à aucun compte, n'ouvre aucun coffre et
ne lit aucun mot de passe. Elle a été testée contre un vrai Vaultwarden 1.37.5
sous Docker, avec et sans jeton d'administration, avec des comptes créés,
invités et désactivés, et le serveur arrêté. Vos retours sont les bienvenus
sur le [forum Gladys](https://community.gladysassistant.com) ou dans les
[issues](https://github.com/guim31/gladys-vaultwarden/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur Vaultwarden joignable depuis Gladys : l'adresse avec laquelle
  vous ouvrez le coffre web.
- Facultatif : le jeton d'administration du serveur (la variable
  `ADMIN_TOKEN`, celle qui ouvre la page `/admin`), pour le décompte des
  comptes.
- Facultatif : un accès Internet de Gladys vers GitHub, pour la vérification
  des mises à jour.

## Configuration

1. Dans Gladys, installez l'intégration, puis ouvrez son écran
   **Configuration**.
2. Renseignez **Adresse de Vaultwarden** : `https://vault.example.com`, ou
   `192.168.1.20:8080` pour une adresse http de votre réseau. Si Vaultwarden
   est servi sous un sous-chemin (`DOMAIN` finit par `/vault`), saisissez-le
   aussi.
3. Facultatif : renseignez **Jeton d'administration (facultatif)** pour
   obtenir le décompte des comptes.
4. Appuyez sur **Tester la connexion** : il affiche la version, si elle est à
   jour, et les comptes.
5. Dans l'onglet **Découverte**, ajoutez l'appareil **Vaultwarden**.

Les autres réglages :

- **Accepter un certificat auto-signé** : seulement pour une adresse https
  dont le certificat n'est pas signé par une autorité connue.
- **Vérifier les mises à jour** (activé par défaut) : compare la version
  installée à la dernière publiée sur GitHub, lue toutes les 6 heures (GitHub
  autorise 60 requêtes anonymes par heure).
- **Intervalle de rafraîchissement** : fréquence de vérification du serveur (de
  30 s à 15 min, 1 min par défaut). Une vérification, ce sont deux petites
  requêtes : `/alive` et `/api/version`.
- **Langue des noms** : langue des noms de fonctionnalités et des dates, fixée
  à l'ajout de l'appareil.

### Le jeton d'administration

Saisissez le jeton **en clair**, celui que vous tapez sur la page `/admin`.
Si `ADMIN_TOKEN` contient une empreinte Argon2 (`$argon2id$…`), c'est le mot de
passe que vous avez haché, pas l'empreinte.

Avec le jeton, Gladys se connecte à la page d'administration et lit la liste
des comptes (`/admin/users`) toutes les 5 minutes au plus, en gardant la
session jusqu'à son expiration. Elle ne fait que compter : utilisateurs,
organisations, invitations en attente, comptes désactivés, dernière activité.
**Aucun contenu de coffre n'est lisible ainsi** : la page d'administration
elle-même ne voit jamais les mots de passe, chiffrés sur vos appareils.

Un jeton refusé n'est plus essayé avant que vous changiez la configuration ou
appuyiez sur **Tester la connexion** : un outil comme fail2ban surveille
souvent ces connexions. Le jeton est conservé par Gladys comme tout champ
secret et n'est jamais écrit dans les logs.

## Les appareils

Un appareil **Vaultwarden**, avec :

| Fonctionnalité         | Nature | Quand                                                      |
| ---------------------- | ------ | ---------------------------------------------------------- |
| Joignable              | 0 / 1  | toujours                                                   |
| Temps de réponse       | ms     | tant qu'il est joignable                                   |
| Version                | texte  | une fois lue                                               |
| Mise à jour disponible | 0 / 1  | avec **Vérifier les mises à jour**                         |
| Dernière version       | texte  | avec **Vérifier les mises à jour**                         |
| Utilisateurs           | nombre | avec le jeton d'administration (invitations non comprises) |
| Organisations          | nombre | avec le jeton d'administration                             |
| Invitations en attente | nombre | avec le jeton d'administration                             |
| Comptes désactivés     | nombre | avec le jeton d'administration                             |
| Dernière activité      | texte  | avec le jeton d'administration (date et heure)             |

L'intégration lit le serveur avec son propre minuteur : les valeurs sont
publiées quand elles changent, et toutes les 12 heures de toute façon. Ajouter
ou retirer le jeton d'administration, ou activer ou couper la vérification des
mises à jour, change les fonctionnalités : Gladys propose alors de **Mettre à
jour** l'appareil dans l'onglet Découverte.

## Tableau de bord

Le widget **Vaultwarden** affiche, dans une seule liste : le serveur (avec le
nom donné à l'appareil dans Gladys) et son temps de réponse, ou **Injoignable**
en rouge ; la version, marquée à jour ou avec la version à installer ; et, avec
le jeton d'administration, les comptes. Son réglage **Afficher les comptes**
masque les lignes des comptes.

## Scènes

### Déclencheurs

- **Vaultwarden devient injoignable** : le serveur ne répond plus à son
  contrôle de santé, alors qu'il répondait. Variables : le nom du serveur, la
  version installée.
- **Vaultwarden est de nouveau joignable** : le serveur répond de nouveau.
  Variables : le nom du serveur, la version installée, la durée
  d'indisponibilité en minutes.
- **Une mise à jour de Vaultwarden est disponible** : une version plus récente
  que celle installée paraît sur GitHub, une fois par version. Variables : le
  nom du serveur, la version installée, la nouvelle version, le lien vers ses
  notes de version. Une version déjà parue au démarrage de l'intégration est
  signalée par **Mise à jour disponible**, sans le déclencheur.

### Idées de scènes

- Envoyer un message quand le serveur de mots de passe ne répond plus, et un
  autre avec la durée de la panne à son retour.
- Recevoir le lien des notes de version dans un message quand une nouvelle
  version paraît.
- Utiliser **Invitations en attente** dans une condition pour vous rappeler
  une invitation que personne n'a acceptée.

## Dépannage

- **« Vaultwarden ne répond pas »** : vérifiez l'adresse et le port, et que
  Gladys peut les joindre (pare-feu, `127.0.0.1` depuis un conteneur).
- **« Pas de serveur Vaultwarden à cette adresse »** : l'adresse mène à un
  autre service (une page du proxy inverse, un autre port) ou il manque le
  sous-chemin.
- **« Certificat refusé »** : si le certificat est le vôtre, activez
  **Accepter un certificat auto-signé**.
- **« Jeton d'administration refusé »** : saisissez le jeton en clair, pas son
  empreinte Argon2.
- **« La page d'administration de Vaultwarden est désactivée »** : le serveur
  n'a pas d'`ADMIN_TOKEN`, ou `DISABLE_ADMIN_TOKEN` la cache derrière un proxy
  : laissez le jeton vide.
- **« Trop de connexions d'administration »** : Vaultwarden limite les
  connexions à la page d'administration (`ADMIN_RATELIMIT_*`) ; l'intégration
  réessaie 5 minutes plus tard.

## Limites

- Un seul serveur Vaultwarden par installation de l'intégration.
- La page d'administration n'a pas de jeton en lecture seule : le jeton
  d'administration confié à Gladys permettrait de gérer le serveur. Laissez-le
  vide si seules la disponibilité et la version vous intéressent.
- Quand `DISABLE_ADMIN_TOKEN` est activé (page d'administration protégée par
  un proxy plutôt que par un jeton), le décompte des comptes n'est pas
  disponible.
- **Mise à jour disponible** compare des numéros de version : une image
  `testing` construite après la dernière version publiée se lit comme cette
  version.
- Le déclencheur de mise à jour n'est pas mémorisé : une version parue pendant
  que l'intégration était arrêtée est signalée par **Mise à jour disponible**,
  sans le déclencheur.
- Sans lien avec le projet Vaultwarden ni avec Bitwarden Inc. Bitwarden est
  une marque de Bitwarden Inc.
