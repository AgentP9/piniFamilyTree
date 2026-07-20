# 🌳 Pini Family Tree

A Docker-based PWA for visualising **Fallout Shelter** vault dweller family trees, complete with a live Mermaid diagram.

## ✨ Features

- **Add dwellers** – register vault dwellers with name and gender.
  - Dweller lists and person dropdowns are shown in alphabetical order for easier lookup.
- **Form couples** – unite two dwellers of opposite genders into a couple.
  - Couples are normalised and displayed consistently as **male ⚭ female**.
  - Forming a couple between (grand-)parents and (grand-)children or between siblings is **prohibited**.
- **Register children** – assign a dweller as the child of a couple.
  - Dwellers who are already in their own couple can also be registered as children of another couple (representing their parents).
  - A dweller can only have one set of registered parents.
- **Link siblings** – explicitly mark two or more dwellers as siblings without needing a known parent couple.
  - Works with any dwellers regardless of their existing couple or child status.
  - Groups auto-merge: adding A↔B and then B↔C results in one shared sibling group {A, B, C}.
  - Sibling links are displayed in the diagram with dotted lines via a 👥 hub node.
  - Siblings cannot form a couple, consistent with the couple-formation rules.
- **Delete protection** – a dweller can only be deleted when they are not part of a couple and not registered as a child.  Sibling links are cleaned up automatically when a dweller is deleted.
- **Family tree diagram** – a live Mermaid flowchart that updates in real time.
  - Click a dweller to start a couple from that person, dim invalid partners, and focus the tree on that family perspective.
  - Click a couple to prefill the parent selector, highlight eligible children, and focus the tree on that branch.
  - Dwellers who are not part of any couple are highlighted as singles.
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
