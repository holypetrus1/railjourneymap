# Rail Journey Map

Eine statische Web-App, die Bahnverbindungen zwischen zwei Bahnhöfen sucht und den tatsächlichen Streckenverlauf auf einer Karte hervorhebt.

## Funktionen

- Bahnhofssuche mit Autovervollständigung
- mehrere Bahnverbindungen zur Auswahl
- Gleisgeometrie je Zugabschnitt auf OpenStreetMap
- zuschaltbares OpenRailwayMap-Overlay
- berechnete Streckenlänge in Kilometern
- Kennzeichnung, falls ein Abschnitt nur angenähert werden kann
- hochauflösender PNG-Export der ausgewählten Karte inklusive Linie und Kilometerangabe
- responsive Oberfläche für Smartphone und Desktop
- automatische Bereitstellung über GitHub Pages

## PNG-Export

Nach Auswahl einer Verbindung wird oben rechts die Schaltfläche **PNG speichern** aktiviert. Die App rendert die aktuell eingepasste Karte clientseitig neu und erzeugt eine PNG-Datei mit ungefähr 2.560 Pixeln Breite. Auf kleinen Displays wird dafür ein höherer Skalierungsfaktor verwendet; eine Pixelgrenze schützt mobile Browser vor übermäßigem Speicherverbrauch.

Die Exportdatei enthält die sichtbare Streckenlinie, die Verbindungsübersicht mit Kilometerangabe sowie die Kartenattribution. Die Bedienelemente der Karte werden nicht in das Bild übernommen. Falls eine externe Kartenebene den Export im Browser blockiert, kann OpenRailwayMap vorübergehend deaktiviert werden.

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
