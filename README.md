# 🌳 Pini Family Tree

A Docker-based PWA for visualising **Fallout Shelter** vault dweller family trees, complete with a live Mermaid diagram.

## ✨ Features

- **Add dwellers** – register vault dwellers with name and gender.
- **Form couples** – unite two dwellers of opposite genders into a couple.
  - Forming a couple between (grand-)parents and (grand-)children or between siblings is **prohibited**.
- **Register children** – assign a dweller as the child of a couple.
  - Only *free* dwellers (not already coupled or registered as someone's child) appear in the child dropdown.
- **Delete protection** – a dweller can only be deleted when they are not part of a couple and not registered as a child.
- **Family tree diagram** – a live Mermaid flowchart that updates in real time.
  - Copy the Mermaid source with one click.
  - View the tree in **full screen** for a better overview.
- **Data management** – export / import the family tree as JSON; wipe all data.
- **PWA** – installable, works offline (service-worker cached).

## 🐳 Running with Docker

```bash
# Build and start
docker compose up --build -d

# The app is available at http://localhost:3939
```

To stop:

```bash
docker compose down
```

## 🛠️ Local development (no Docker)

The app is a static site – no build step required.  
Open `public/index.html` directly in a browser, or serve it with any static file server, e.g.:

```bash
npx serve public
```

## 📁 Project layout

```
public/
  css/style.css       # Vault-Tec themed styles
  js/app.js           # Main UI controller
  js/storage.js       # LocalStorage persistence + JSON import/export
  js/mermaid-gen.js   # Mermaid diagram code generator
  index.html          # Single-page application shell
Dockerfile            # nginx-based container image
docker-compose.yml    # Compose file (port 3939)
```
