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

- Bahnhofssuche, Verbindungen und Streckengeometrien: [Transitous](https://transitous.org/) über die versionierte [MOTIS-API](https://api.transitous.org/)
- Übersicht der in Transitous eingebundenen Fahrplandaten: [Transitous Sources](https://transitous.org/sources/)
- Basiskarte: [OpenStreetMap](https://www.openstreetmap.org/)
- Bahn-Infrastruktur-Layer: [OpenRailwayMap](https://www.openrailwaymap.org/)

Transitous ist ein frei nutzbarer, gemeinschaftlich betriebener Routingdienst. Die Anwendung verwendet für die Bahnhofssuche `v1/geocode` und für die Verbindungssuche `v6/plan` mit detaillierten Zugabschnitten und Streckengeometrien.

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

## Lizenz

Der Quellcode steht unter der [MIT-Lizenz](./LICENSE).
