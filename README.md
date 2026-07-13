# Rail Journey Map

Eine statische Web-App zum Planen und Exportieren mehrtägiger Bahnreisen.

## Funktionen

- Bahnhofssuche und Verbindungsauswahl über Transitous/MOTIS
- bis zu zwei Via-Bahnhöfe pro Suchanfrage
- bis zu zehn gespeicherte Tour-Segmente
- frei wählbare Farbe und Gruppen-/Tagesbezeichnung je Segment
- mehrere Segmente können dieselbe Farbe und Gruppe verwenden
- Reihenfolge ändern, Segmente entfernen und Zwischenhalte einsehen
- persistente Tour im lokalen Browser-Speicher
- Gesamtstrecke, Fahrzeit und Gruppenanzahl
- OpenStreetMap mit optionalem OpenRailwayMap-Overlay
- separater Exportbereich mit 16:9, 4:3, 1:1 und 4:5
- hochauflösender PNG-Export mit 2.560 oder 3.840 Pixel Breite
- mobile Navigation für **Suche**, **Tour** und **Export**

## Architektur

Die Anwendung trennt drei Ebenen:

1. **Suche:** temporäre Verbindungsergebnisse aus Transitous.
2. **Tour:** kompakte, vereinfachte Geometrie-Snapshots der ausgewählten Verbindungen. Dadurch bleibt eine Tour auch nach dem Neuladen erhalten und belastet den Routingdienst nicht erneut.
3. **Export:** rendert ausschließlich die gespeicherte Tour mit eigenem Seitenverhältnis, Titel und Legende.

Ein Suchergebnis kann mehrere Zugläufe und Umstiege enthalten, wird aber als ein farbiges Tour-Segment gespeichert. Die Geometrie wird beim Speichern leicht vereinfacht, damit bis zu zehn lange Strecken zuverlässig in `localStorage` passen.

## Datenquellen

- Bahnhofssuche, Verbindungen und Streckengeometrien: [Transitous](https://transitous.org/) über die versionierte [MOTIS-API](https://api.transitous.org/)
- Übersicht der eingebundenen Fahrplandaten: [Transitous Sources](https://transitous.org/sources/)
- Basiskarte: [OpenStreetMap](https://www.openstreetmap.org/)
- Bahn-Infrastruktur-Layer: [OpenRailwayMap](https://www.openrailwaymap.org/)

MOTIS unterstützt beim `/api/v6/plan`-Endpunkt bis zu zwei Via-Halte. Die Tour-Ebene ergänzt diese Funktion für längere, mehrtägige Reisen.

## Lokal starten

```bash
python3 -m http.server 8080
```

Danach `http://localhost:8080` öffnen. Das direkte Öffnen per `file://` sollte vermieden werden, weil Browser ES-Module dort einschränken.

## Tests

```bash
npm test
npm run check
```

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` veröffentlicht den Inhalt des `main`-Branches. Unter **Settings → Pages → Build and deployment** muss als Quelle **GitHub Actions** ausgewählt sein.

## Lizenz

Der Quellcode steht unter der [MIT-Lizenz](./LICENSE).
