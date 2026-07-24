# rhizome-quantum-workflow

Architecture Mastra pour l'exploration quantique de l'écosystème de connaissance de Gilles
Deleuze, en trois espaces :

- **Espace Strié** (infrastructure locale) — Omeka S (base de connaissances) + BGE-m3/TEI (embeddings).
- **Orchestration** — serveur TypeScript (workflows Mastra) + **Agent Mastra** *Chroniqueur
  Cognitif* (LLM auto-hébergé), équipé de l'outil `get-concept-detail`.
- **Espace Lisse** (quantique) — micro-service Python **FastAPI** + **Qiskit Aer** ([quantum-service/](quantum-service/)).

Le pipeline complet (`quantum-chronicle-workflow`) suit les 10 étapes : extraction Omeka S →
envoi des angles Θ (dérivés de `I_AB`) et des arêtes au micro-service quantique → construction et
exécution de l'ansatz sur Qiskit Aer → distribution de probabilités → concepts résonnants →
contexte source + quantique transmis à l'Agent Mastra → génération de la note en Markdown →
vectorisation du texte via BGE/TEI → création d'un nouvel Item Omeka S (Markdown + vecteur final
+ `dcterms:isVersionOf` vers le nœud source et les concepts résonnants).

Quatre workflows :

- **`quantum-chronicle-workflow`** — le pipeline complet ci-dessus (nécessite un `sourceId`).
- **`rhizomatic-intensity-workflow`** — recalcule seulement la matrice `I_AB(t)` pour une fenêtre donnée.
- **`vector-batch-init-workflow`** — Phase 1 : vectorise tout le corpus une première fois (idempotent).
- **`vector-reactive-workflow`** — Phase 2 : déclenché par le webhook `POST /webhooks/omeka/item-updated`
  à chaque création/modification d'une ressource Omeka S, recalcule seulement les liens voisins.

Par défaut tout tourne en mode **synthétique** (`OMEKA_MODE=synthetic`, `EMBEDDINGS_PROVIDER=synthetic`,
`QUANTUM_PROVIDER=synthetic`) : un petit rhizome de 16 concepts deleuziens, des agents
explorateurs simulés, et un solveur classique de repli pour la marche quantique — rien de tout
cela ne nécessite de service externe. Il ne manque qu'un LLM auto-hébergé (Ollama) pour l'Agent
Mastra. Voir [.env.example](.env.example) pour brancher une vraie instance Omeka S, un serveur
TEI/BGE-m3 local, et le vrai micro-service Qiskit.

## Getting Started

Copier la config d'exemple puis démarrer le serveur de développement :

```shell
cp .env.example .env
npm run dev
```

Démarrer les services optionnels :

```shell
ollama serve && ollama pull llama3.1              # Agent Mastra (Chroniqueur Cognitif)

cd quantum-service && python3 -m venv .venv \
  && source .venv/bin/activate && pip install -r requirements.txt \
  && uvicorn main:app --port 8000                  # Micro-service Qiskit Aer (QUANTUM_PROVIDER=fastapi)
```

Exécuter un workflow directement en ligne de commande (utile en synthétique, ou pour un cron) :

```shell
npx tsx scripts/run-batch-init.ts                        # Phase 1 : initialisation du corpus
npx tsx scripts/run-rhizomatic-intensity.ts ma-fenetre    # calcule seulement la matrice
npx tsx scripts/run-reactive.ts rhizome                   # simule le webhook pour un nœud donné
npx tsx scripts/run-quantum-chronicle.ts rhizome ma-fenetre  # pipeline complet (10 étapes)
```

> **Note sur `mastra dev`** : le serveur de développement exécute le code depuis un répertoire
> bac-à-sable interne (`src/mastra/public/...`), où `process.cwd()` ne pointe pas vers la racine
> du projet. Définissez `DATA_DIR` (chemin absolu) dans `.env` si vous voulez que la matrice et
> l'état de rétention atterrissent dans `<projet>/data/` pendant que `mastra dev` tourne.

Open [http://localhost:4111](http://localhost:4111) in your browser to access [Mastra Studio](https://mastra.ai/docs/studio/overview). It provides an interactive UI for building and testing your agents, along with a REST API that exposes your Mastra application as a local service. This lets you start building without worrying about integration right away.

You can start editing files inside the `src/mastra` directory. The development server will automatically reload whenever you make changes.

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). Your bootstrapped project includes example code for [agents](https://mastra.ai/docs/agents/overview), [tools](https://mastra.ai/docs/agents/using-tools), [workflows](https://mastra.ai/docs/workflows/overview), [scorers](https://mastra.ai/docs/evals/overview), and [observability](https://mastra.ai/docs/observability/overview).

If you're new to AI agents, check out our [course](https://mastra.ai/learn) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Deploy to the Mastra platform

The [Mastra platform](https://projects.mastra.ai) provides two products for deploying and managing AI applications built with the Mastra framework:

- **Studio**: A hosted visual environment for testing agents, running workflows, and inspecting traces
- **Server**: A production deployment target that runs your Mastra application as an API server

Learn more in the [Mastra platform documentation](https://mastra.ai/docs/mastra-platform/overview).