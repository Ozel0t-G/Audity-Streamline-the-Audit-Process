# Audity — Marketing- & Pricing-Website

Eigenständige, statische Website (HTML/CSS/JS, keine Build-Tools, keine
Abhängigkeiten). Design-Richtung „Control Register": kühles Papier, Navy-Ink,
Ultramarin-Akzent, monospaced Control-Codes — passend zur Audit-Domäne.

## Ansehen
**Direkt:** `website/index.html` im Browser öffnen (Schriften kommen von Google Fonts).

**Lokal serven (empfohlen für saubere Pfade):**
```bash
cd website
python3 -m http.server 8088      # → http://127.0.0.1:8088
# oder
npx serve .
```

**Per Docker (wie der restliche Stack):**
```bash
cd website
docker compose up -d --build     # → http://127.0.0.1:8088
```

## Inhalt
- **Hero** mit „Control-Register"-Signatur (Kontroll-Zeilen, Abdeckungs-Meter, Tamper-Hash)
- **Workflow** als echte Phasen-Sequenz (Planung → Feldarbeit → Findings → Bericht → Abschluss)
- **Frameworks**-Leiste, **Feature**-Karten
- **Pricing** (Free / Pro / Enterprise) — spiegelt die tatsächlichen Tier-Regeln:
  Limits (5/15/∞ Nutzer, 25/50/∞ Kunden), AI = Pro, Connectors & Kundenbestätigung = Enterprise
- **FAQ**, **CTA**, **Footer**

## Anpassen
- **Preise:** in `index.html` bei `.tier__amount` (Pro hat einen Platzhalter `€49`,
  siehe `<!-- TODO: realen Preis setzen -->`).
- **Farben/Typo:** Tokens oben in `styles.css` (`:root`).
- **Texte:** direkt in `index.html` (deutschsprachig; bei Bedarf lokalisierbar).
- Responsiv, Tastatur-Fokus sichtbar, `prefers-reduced-motion` respektiert.
