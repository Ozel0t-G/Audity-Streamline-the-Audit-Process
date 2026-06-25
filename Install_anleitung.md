# Audity: vollständige Bereinigung und Neuinstallation

> **Achtung:** Dieser Ablauf löscht die bestehende Audity-Installation einschließlich PostgreSQL-Daten, hochgeladener Nachweise in MinIO und Archivdaten dauerhaft. Er ist nur für eine bewusst gewünschte, leere Neuinstallation gedacht.

Zielserver: `150.230.20.17`  
SSH-Benutzer: `ubuntu`  
Lokaler SSH-Schlüssel: `audity/Keys/ssh-key-2026-06-05.key`

## A. Was Codex macht

Nach deiner ausdrücklichen Freigabe für den Löschschritt erledige ich auf dem Server:

1. Prüfen, aus welchem Verzeichnis und mit welcher Compose-Datei Audity aktuell läuft.
2. Die vorhandenen Audity-Container und zugehörigen Compose-Ressourcen erfassen und dir die Löschliste zeigen.
3. Optional eine letzte Sicherung erstellen, falls du doch Daten behalten möchtest.
4. Audity stoppen und die Container, Netzwerke und **Audity-Datenvolumes** entfernen.
5. Prüfen, dass keine `audity-*`-Container und keine alten Audity-Volumes mehr vorhanden sind.
6. Die Anwendung aus dem `production`-Branch frisch bereitstellen und den Installationslauf starten, sofern du mich auch dafür beauftragst.
7. Den Start, Datenbank-Migrationen und die Healthchecks kontrollieren.

Ich lösche weder Container noch Volumes, bevor du den Satz **„Löschen freigegeben“** sendest.

## B. Was du vorher entscheiden bzw. vorbereiten musst

### 1. Endgültiges Löschen bestätigen

Entscheide, ob vorhandene Audits, Benutzer, Einstellungen, Datenbankdaten, hochgeladene Dateien und Archive wirklich entfallen dürfen.

Wenn du möglicherweise etwas behalten willst, fordere vor der Freigabe ein Backup an. Besonders wichtig sind:

- PostgreSQL-Datenbank
- MinIO-/Evidence-Daten
- die bisherige `.env` (enthält Secrets und Konfiguration)
- eigene Framework-Dateien in `user_frameworks/`

### 2. Öffentliche Adresse festlegen

Lege eine dieser Varianten fest:

- Testbetrieb ohne Domain: `http://150.230.20.17`
- Produktivbetrieb mit Domain, empfohlen: `https://audity.deine-domain.tld`

Für eine Domain müssen DNS und TLS vorbereitet sein:

1. Einen `A`-Record für die Domain auf `150.230.20.17` setzen.
2. Port `80` öffnen; für HTTPS zusätzlich Port `443`.
3. Einen TLS-Reverse-Proxy (z. B. Caddy, nginx, Traefik oder Load Balancer) vor Audity konfigurieren.

Die MinIO-Ports `9000` und `9001` sollten nicht öffentlich offen sein. Sie sind nur für Administration bzw. interne Nutzung gedacht.

### 3. Initialen Admin festlegen

Lege die E-Mail-Adresse für den ersten Instance Admin fest, z. B. `admin@deine-domain.tld`. Das Installationsskript erzeugt ein sicheres Passwort und gibt es am Ende einmalig aus. Dieses Passwort und die spätere `.env` müssen sicher abgelegt werden.

## C. Serverzugang

Vom Projektordner auf dem eigenen Rechner:

```bash
ssh -i audity/Keys/ssh-key-2026-06-05.key ubuntu@150.230.20.17
```

Auf dem Server wird im Folgenden das Audity-Verzeichnis als `AUDITY_DIR` bezeichnet. Zuerst den tatsächlichen Pfad ermitteln:

```bash
docker inspect audity-api --format '{{ range .Mounts }}{{ println .Source }}{{ end }}'
```

Falls die Ausgabe z. B. `/opt/audity/...` zeigt:

```bash
export AUDITY_DIR=/opt/audity
cd "$AUDITY_DIR"
```

## D. Löschschritt – nur nach Freigabe

### 1. Vor dem Löschen kontrollieren

```bash
cd "$AUDITY_DIR"
docker compose -f docker-compose.prod.yml ps
docker ps -a --filter name=audity- --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker volume ls --format 'table {{.Name}}\t{{.Driver}}' | grep audity
```

Wenn die bestehende Installation mit der Entwicklungs-Compose-Datei läuft, statt `docker-compose.prod.yml` in den folgenden Befehlen `docker-compose.yml` verwenden.

### 2. Container und Compose-Volumes entfernen

```bash
cd "$AUDITY_DIR"
docker compose -f docker-compose.prod.yml down --volumes --remove-orphans
```

Der Befehl entfernt die zur Compose-Installation gehörenden Audity-Container, Netzwerke und benannten Volumes. Falls im Kontrollschritt noch alte Audity-Container oder -Volumes auftauchen, erst die Namen kontrollieren und dann ausschließlich diese entfernen:

```bash
docker rm -f <alter-audity-container>
docker volume rm <altes-audity-volume>
```

Keine allgemeinen Docker-Bereinigungen wie `docker system prune -a --volumes` verwenden: Sie könnten Daten anderer Anwendungen auf dem Server löschen.

### 3. Erfolg prüfen

```bash
docker ps -a --filter name=audity-
docker volume ls --format '{{.Name}}' | grep audity || true
```

Die Ausgabe darf keine alten Audity-Container oder Datenvolumes mehr zeigen.

## E. Frische Installation

### 1. Produktionscode bereitstellen

Wenn das alte Projektverzeichnis ebenfalls verworfen werden soll:

```bash
cd /opt
git clone --branch production --single-branch https://github.com/Ozel0t-G/Audity-Streamline-the-Audit-Process.git Audity-Streamline-the-Audit-Process
cd /opt/Audity-Streamline-the-Audit-Process/audity
```

Wenn das Verzeichnis bereits den aktuellen `production`-Branch enthält, genügt:

```bash
cd "$AUDITY_DIR"
git fetch origin
git switch production
git pull --ff-only origin production
```

### 2. Voraussetzungen prüfen

```bash
docker --version
docker compose version
openssl version
curl --version
```

### 3. Neu installieren

Die Installationsroutine erzeugt eine neue `.env`, sichere Secrets, einen Datenbanknutzer, Storage-Zugangsdaten und ein Initial-Admin-Passwort:

```bash
cd /opt/Audity-Streamline-the-Audit-Process/audity
export AUDITY_PUBLIC_URL=http://150.230.20.17
export AUDITY_SEED_ADMIN_EMAIL=admin@deine-domain.tld
./scripts/install.sh
```

Bei Verwendung einer Domain ersetzt du die öffentliche URL vor dem Installieren, beispielsweise:

```bash
export AUDITY_PUBLIC_URL=https://audity.deine-domain.tld
```

Direkt nach Ende des Skripts:

1. Das angezeigte Initialpasswort sichern.
2. Die Datei `.env` sicher sichern; sie enthält alle Geheimnisse.
3. Die Anwendung über `AUDITY_PUBLIC_URL` öffnen und den ersten Login durchführen.

### 4. Optional: auf veröffentlichte Produktionsimages 0.2.4 wechseln

Die Erstinstallation baut den ausgecheckten Produktionscode lokal. Falls danach explizit die veröffentlichten GHCR-Images verwendet werden sollen:

```bash
cd /opt/Audity-Streamline-the-Audit-Process/audity
./scripts/update.sh 0.2.4
```

Danach werden zukünftige Updates ebenfalls über den Updater bzw. `./scripts/update.sh` ausgeführt.

## F. Abnahme nach der Installation

```bash
cd /opt/Audity-Streamline-the-Audit-Process/audity
docker compose ps
curl -fsS http://localhost:3000/health
```

Erwartung:

- `audity-api`, `audity-web`, `audity-worker`, PostgreSQL, Redis und MinIO sind gesund.
- Der Healthcheck antwortet erfolgreich.
- Login mit der festgelegten Admin-E-Mail und dem beim Installieren erzeugten Passwort funktioniert.
- Der Updater ist erreichbar und kann im Admin-Bereich angezeigt werden.

Für einen Bild-/Produktionsbetrieb zusätzlich prüfen:

```bash
AUDITY_COMPOSE_FILE=docker-compose.prod.yml ./scripts/healthcheck.sh
```
