# Rail Journey Map

Eine statische Web-App, die Bahnverbindungen zwischen zwei Bahnhöfen sucht und den tatsächlichen Streckenverlauf auf einer Karte hervorhebt.

## Funktionen

- Bahnhofssuche mit Autovervollständigung
- mehrere Bahnverbindungen zur Auswahl
- Gleisgeometrie je Zugabschnitt auf OpenStreetMap
- zuschaltbares OpenRailwayMap-Overlay
- berechnete Streckenlänge in Kilometern
- Kennzeichnung, falls ein Abschnitt nur angenähert werden kann
- responsive Oberfläche für Smartphone und Desktop
- automatische Bereitstellung über GitHub Pages

## Datenquellen

- Verbindungen und Fahrt-Polylinien: [v6.db.transport.rest](https://v6.db.transport.rest/)
- Basiskarte: [OpenStreetMap](https://www.openstreetmap.org/)
- Bahn-Infrastruktur-Layer: [OpenRailwayMap](https://www.openrailwaymap.org/)

Die transport.rest-Instanz ist ein frei nutzbarer Community-Dienst ohne Verfügbarkeitsgarantie. Die Anwendung begrenzt Anfragen durch verzögerte Bahnhofssuche und lädt Strecken nur nach einer bewussten Nutzereingabe.

## Lokal starten

Da die App keinen Build-Schritt benötigt, reicht ein einfacher lokaler Webserver:

```bash
python3 -m http.server 8080
```

Danach `http://localhost:8080` öffnen. Das direkte Öffnen der HTML-Datei per `file://` sollte vermieden werden, weil Browser ES-Module dort einschränken.

## Tests

```bash
npm test
npm run check
```

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` veröffentlicht den Inhalt des `main`-Branches. Im Repository muss unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** ausgewählt sein.
