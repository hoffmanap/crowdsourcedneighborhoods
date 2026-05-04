# Draw Your El Paso Neighborhood

A crowdsourced mapping tool where users draw polygon boundaries for El Paso neighborhoods. Submissions are stored locally and overlaid on the map. As more users contribute, Turf.js computes true consensus boundaries from the union of all submitted polygons.

## Features

- **Draw polygons** on a Leaflet map to define neighborhood extents
- **Turf.js consensus** — polygon union of all submissions per neighborhood
- **Per-session submission limit** — one drawing per neighborhood per visit
- **View & Export tab** — toggle layers, download GeoJSON for use in QGIS / Mapbox / ArcGIS

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Deploy to GitHub Pages

### One-time setup

**1. Create a GitHub repository**

Go to https://github.com/new and create a new public repository (e.g. `elpaso-neighborhood-map`).

**2. Update `vite.config.js`**

Open `vite.config.js` and change the `base` value to match your repository name:

```js
base: "/your-repo-name/",
```

**3. Initialize git and push**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

**4. Install dependencies and deploy**

```bash
npm install
npm run deploy
```

This runs `vite build` and then uses `gh-pages` to push the `dist/` folder to the `gh-pages` branch of your repo.

**5. Enable GitHub Pages**

- Go to your repo on GitHub
- Click **Settings → Pages**
- Under **Source**, select **Deploy from a branch**
- Choose branch: `gh-pages`, folder: `/ (root)`
- Click **Save**

Your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

It may take 1–2 minutes to go live after the first deploy.

### Subsequent deploys

```bash
npm run deploy
```

---

## Notes on data storage

Submissions are saved to the visitor's browser `localStorage`. This means:
- Each user sees their own submissions plus any they submitted in that browser
- Submissions do **not** sync across users in this static deployment

To enable shared/crowdsourced data (all users seeing each other's submissions), you would need a backend — options include Firebase Realtime Database, Supabase, or a simple serverless function writing to a database.

---

## Tech stack

| Library | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| Vite | 5 | Build tool |
| Leaflet | 1.9.4 | Interactive map |
| Leaflet.draw | 1.0.4 | Polygon drawing tool |
| Turf.js | 6.5.0 | Polygon union / consensus geometry |
| gh-pages | 6 | GitHub Pages deployment |
