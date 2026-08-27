# Installation sur un VPS Debian

Guide d'installation en production de la couche de diffusion (Meilisearch + API + client web + audio) sur un serveur Debian 12 (bookworm). Voir [README.md](README.md) pour l'architecture générale.

Omeka S (la base source) n'a pas besoin d'être sur ce serveur — voir [Où vivent les données](#où-vivent-les-données-source-vs-diffusion).

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Préparation du système](#2-préparation-du-système)
3. [Installation de Meilisearch](#3-installation-de-meilisearch)
4. [Déploiement du code](#4-déploiement-du-code)
5. [Où vivent les données (source vs diffusion)](#5-où-vivent-les-données-source-vs-diffusion)
6. [Service systemd pour l'API](#6-service-systemd-pour-lapi)
7. [Apache et HTTPS](#7-apache-et-https)
8. [Vérification](#8-vérification)
9. [Maintenance](#9-maintenance)
10. [Sécurité — récapitulatif](#10-sécurité--récapitulatif)

## 1. Prérequis

- Un VPS Debian 12, accès `sudo` ou root.
- Un nom de domaine pointé vers l'IP du VPS (recommandé — nécessaire pour le HTTPS et pour la reconnaissance vocale du navigateur, qui exige une origine sécurisée).
- Soit un accès réseau depuis le VPS vers la base MySQL/MariaDB d'Omeka S, soit les artefacts déjà générés ailleurs (`audios/`, `data/`, un export Meilisearch) à transférer — voir [section 5](#5-où-vivent-les-données-source-vs-diffusion).

## 2. Préparation du système

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y python3 python3-venv python3-pip ffmpeg git curl rsync apache2 ufw
```

Compte système dédié, sans shell de connexion — l'app ne doit pas tourner en root :

```bash
sudo useradd --system --create-home --home-dir /opt/flux-conceptuel-auto \
  --shell /usr/sbin/nologin fluxconceptuel
```

Pare-feu minimal : seuls SSH, HTTP et HTTPS sont exposés. Meilisearch (7700) et l'API (8000) restent en écoute sur `127.0.0.1` uniquement — jamais accessibles directement depuis l'extérieur.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 3. Installation de Meilisearch

```bash
curl -L https://install.meilisearch.com | sh
sudo mv ./meilisearch /usr/local/bin/meilisearch
sudo mkdir -p /var/lib/meilisearch
sudo chown fluxconceptuel:fluxconceptuel /var/lib/meilisearch
```

Générez une **clé maîtresse** — en développement local le projet tourne sans clé, ce qui n'est acceptable que sur `127.0.0.1` : en production, sans clé, n'importe qui pouvant atteindre le port pourrait lire ou effacer tout l'index.

```bash
openssl rand -base64 48
# gardez cette valeur, elle sert deux fois : le service Meilisearch (ci-dessous)
# et MEILI_KEY dans le .env de l'API (section 5)
```

`/etc/systemd/system/meilisearch.service` :

```ini
[Unit]
Description=Meilisearch
After=network.target

[Service]
Type=simple
User=fluxconceptuel
Group=fluxconceptuel
Environment=MEILI_MASTER_KEY=REMPLACER_PAR_LA_CLE_GENEREE
Environment=MEILI_ENV=production
ExecStart=/usr/local/bin/meilisearch --db-path /var/lib/meilisearch --http-addr 127.0.0.1:7700 --no-analytics
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now meilisearch
sudo systemctl status meilisearch   # doit être "active (running)"
```

## 4. Déploiement du code

```bash
sudo -u fluxconceptuel git clone <url-du-dépôt> /opt/flux-conceptuel-auto/app
```

(à défaut d'un dépôt git accessible depuis le VPS, `rsync` depuis la machine de développement fonctionne tout aussi bien — voir la commande dans la [section 5](#5-où-vivent-les-données-source-vs-diffusion))

```bash
cd /opt/flux-conceptuel-auto/app
sudo -u fluxconceptuel python3 -m venv .venv
sudo -u fluxconceptuel ./.venv/bin/pip install -r requirements.txt
sudo -u fluxconceptuel ./.venv/bin/pip install gunicorn
```

Créez le `.env` (jamais commité — permissions restrictives) :

```bash
sudo -u fluxconceptuel tee .env > /dev/null <<'EOF'
MEILI_URL=http://127.0.0.1:7700
MEILI_KEY=REMPLACER_PAR_LA_CLE_GENEREE
OUT_DIR=/opt/flux-conceptuel-auto/app/audios

# uniquement nécessaire si le pipeline d'export tourne sur CE serveur
# (voir section 5, option A) — sinon laisser vide ou supprimer ces lignes
DB_HOST=
DB_USER=
DB_PASS=
DB_NAME=
SRC_ROOT=
EOF
sudo chmod 600 .env
```

## 5. Où vivent les données (source vs diffusion)

Omeka S reste la source de vérité et n'a pas besoin d'être sur ce VPS. Deux façons de peupler la couche de diffusion :

**Option A — le pipeline tourne sur le VPS**, qui a un accès réseau à la base MySQL/MariaDB d'Omeka S (renseignez `DB_*` et `SRC_ROOT` dans le `.env`, `SRC_ROOT` pointant vers un accès au dossier `files/original/` d'Omeka S monté ou synchronisé sur ce serveur) :

```bash
cd /opt/flux-conceptuel-auto/app
sudo -u fluxconceptuel ./scripts/export_manifest.sh
sudo -u fluxconceptuel ./scripts/convert_batch.sh
sudo -u fluxconceptuel ./.venv/bin/python3 scripts/mine_concept_phrases.py
sudo -u fluxconceptuel ./.venv/bin/python3 scripts/export_meilisearch.py
```

**Option B — les artefacts sont générés ailleurs** (par exemple sur la machine de développement, comme documenté dans le README) et transférés :

```bash
# depuis la machine où audios/ et data/ ont été générés
rsync -avz --progress audios/ deploy@vps:/opt/flux-conceptuel-auto/app/audios/
rsync -avz --progress data/   deploy@vps:/opt/flux-conceptuel-auto/app/data/
```

Puis, sur le VPS (Meilisearch démarré, base joignable au moins le temps de cet export) :

```bash
sudo -u fluxconceptuel ./.venv/bin/python3 scripts/export_meilisearch.py
```

Alternative plus rapide si la base n'est pas joignable depuis le VPS : copier directement le répertoire de données Meilisearch déjà construit (service arrêté des deux côtés pendant la copie) :

```bash
sudo systemctl stop meilisearch          # sur le VPS
rsync -avz --progress meilisearch/data/ deploy@vps:/var/lib/meilisearch/
sudo chown -R fluxconceptuel:fluxconceptuel /var/lib/meilisearch
sudo systemctl start meilisearch
```

## 6. Service systemd pour l'API

En production, `gunicorn` pilotant des workers `uvicorn` est plus robuste qu'un simple `uvicorn --reload` (relance automatique des workers en cas de crash, plusieurs workers en parallèle).

`/etc/systemd/system/flux-api.service` :

```ini
[Unit]
Description=Flux Conceptuel Auto — API
After=network.target meilisearch.service
Requires=meilisearch.service

[Service]
Type=simple
User=fluxconceptuel
Group=fluxconceptuel
WorkingDirectory=/opt/flux-conceptuel-auto/app
EnvironmentFile=/opt/flux-conceptuel-auto/app/.env
ExecStart=/opt/flux-conceptuel-auto/app/.venv/bin/gunicorn api.main:app \
  -k uvicorn.workers.UvicornWorker -w 2 --bind 127.0.0.1:8000 \
  --access-logfile - --error-logfile -
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ajustez `-w 2` (nombre de workers) selon les cœurs disponibles — 2 suffisent largement pour ce trafic.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now flux-api
sudo systemctl status flux-api
```

## 7. Apache et HTTPS

Pour la performance, **Apache sert directement les fichiers statiques** (le client web et les fichiers audio) — bien plus efficace qu'un serveur ASGI Python pour ça — et ne proxifie que les appels `/api/`. Les requêtes `Range` (avance rapide dans l'audio) sont supportées nativement par Apache pour les fichiers statiques, sans module supplémentaire.

Activez les modules nécessaires — `proxy`/`proxy_http` pour le reverse-proxy vers l'API, `headers` pour les en-têtes de cache, `ssl` pour le HTTPS :

```bash
sudo a2enmod proxy proxy_http headers ssl
```

`/etc/apache2/sites-available/flux-conceptuel-auto.conf` :

```apache
<VirtualHost *:80>
    ServerName flux.exemple.tld
    DocumentRoot /opt/flux-conceptuel-auto/app/web

    ProxyPreserveHost On
    ProxyPass /api/ http://127.0.0.1:8000/api/
    ProxyPassReverse /api/ http://127.0.0.1:8000/api/

    Alias /audio/ /opt/flux-conceptuel-auto/app/audios/
    <Directory /opt/flux-conceptuel-auto/app/audios/>
        Require all granted
        Header set Cache-Control "public, max-age=31536000, immutable"
    </Directory>

    <Directory /opt/flux-conceptuel-auto/app/web/>
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/flux-conceptuel-error.log
    CustomLog ${APACHE_LOG_DIR}/flux-conceptuel-access.log combined
</VirtualHost>
```

```bash
sudo a2ensite flux-conceptuel-auto
sudo a2dissite 000-default   # évite un conflit avec le site par défaut
sudo apache2ctl configtest && sudo systemctl reload apache2
```

HTTPS via Let's Encrypt — **nécessaire** pour que la reconnaissance vocale fonctionne dans le navigateur (les navigateurs refusent le micro sur une origine non sécurisée autre que `localhost`) :

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d flux.exemple.tld
```

`certbot` crée automatiquement le VirtualHost 443 correspondant (`SSLEngine on` et chemins de certificat) et programme le renouvellement automatique (vérifiez avec `sudo systemctl status certbot.timer`).

`certbot` modifie le bloc `server` pour écouter en 443 et programme le renouvellement automatique (vérifiez avec `sudo systemctl status certbot.timer`).

## 8. Vérification

```bash
curl https://flux.exemple.tld/api/health
# {"status":"ok","meilisearch":{"status":"available"}}

curl -I https://flux.exemple.tld/audio/<un-hash>.opus
# HTTP/2 200, content-type: audio/ogg
```

Puis dans un navigateur : ouvrir `https://flux.exemple.tld/`, vérifier le chargement des thèmes, lancer un fragment (lecture réelle), faire une recherche, ouvrir la topologie d'un concept.

## 9. Maintenance

**Mettre à jour le code :**

```bash
cd /opt/flux-conceptuel-auto/app
sudo -u fluxconceptuel git pull
sudo -u fluxconceptuel ./.venv/bin/pip install -r requirements.txt
sudo systemctl restart flux-api
```

**Ré-exécuter le pipeline** (après de nouvelles transcriptions dans Omeka S) : relancer les 4 scripts de la [section 5](#5-où-vivent-les-données-source-vs-diffusion) — chacun est conçu pour être rejoué sans étape de nettoyage préalable (la conversion audio reprend là où elle s'est arrêtée, l'export Meilisearch reconstruit les index en entier).

**Journaux :**

```bash
sudo journalctl -u flux-api -f
sudo journalctl -u meilisearch -f
sudo tail -f /var/log/apache2/flux-conceptuel-error.log
```

**Sauvegardes** — trois éléments à conserver, tous régénérables depuis Omeka S mais coûteux à reconstruire (la conversion audio seule prend plusieurs minutes sur des dizaines de milliers de fichiers) :

- `/var/lib/meilisearch` (ou `meilisearch/data/`) — l'index de recherche
- `audios/` — les fichiers Opus (3,7 Go)
- `data/concept_phrases.json` — les concepts composés minés

## 10. Sécurité — récapitulatif

- Meilisearch (7700) et l'API brute (8000) écoutent sur `127.0.0.1` uniquement ; seul Apache (80/443) est exposé au pare-feu.
- Clé maîtresse Meilisearch obligatoire en production (jamais la configuration « sans clé » du développement local).
- `.env` en permissions `600`, jamais commité (`.gitignore` du dépôt l'exclut déjà).
- L'app tourne sous un compte système dédié sans shell, pas en root.
- HTTPS obligatoire — sans ça, la reconnaissance vocale du client sera bloquée par le navigateur de toute façon.
