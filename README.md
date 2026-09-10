# @benjosivo/table-query

Table triable/filtrable/paginée : hook + composants React d'un côté (`/react`), logique
SQL de pagination/tri/filtres côté serveur de l'autre (`/server`). Un projet peut
n'utiliser qu'un des deux côtés.

```
src/
  react/    → DataTable, Table, Pagination, useDataTable, FilterModal, FilterPanel, Cell, utils, types
  server/   → createTableQueryModule (router Express + reqTableQuery)
```

## Installation

```bash
npm install @benjosivo/table-query
```

Peer dependencies : `react` (si tu utilises `/react`), `express` et `@benjosivo/mysql`
(si tu utilises `/server`) — ce sont des `peerDependencies` optionnelles, donc pas
besoin des trois si tu n'utilises qu'un des deux côtés.

## Côté serveur

```ts
import { createTableQueryModule } from '@benjosivo/table-query/server';
import { convertToMySQLDateTime, wrapRouteHandler } from './functions.js';
import { getSQLCache, setSQLCache, deleteSQLCache } from './redis.js';

const { router, reqTableQuery } = createTableQueryModule({
    convertToMySQLDateTime,
    wrapRouteHandler,
    // Optionnel : à fournir seulement si tu veux pouvoir utiliser le cache quelque part.
    cache: { getSQLCache, setSQLCache, deleteSQLCache },
});

app.use('/tableCreation/api', router);

app.post('/api/commandes', wrapRouteHandler(async (req, res) => {
    const result = await reqTableQuery({
        query: `SELECT c.*, COUNT(*) OVER() AS TotalCount FROM commandes c`,
        req,
        paramFilter: ['MULTISELECT', 'HIDE', 'DATE', 'MULTISELECT'],
        useCache: true, // voir plus bas
    });
    if (result.error) return res.status(result.status ?? 500).send(result.error);
    res.json(result.data);
}));
```

### Le paramètre `useCache`

`reqTableQuery({ ..., useCache })` :

- **`useCache: true`** (ou omis, si `cache` a été fourni à `createTableQueryModule`) —
  comportement d'origine : résultats de requête et filtres mis en cache Redis, filtres
  calculés en tâche de fond et récupérés via `/getFiltres` (polling).
- **`useCache: false`** — aucune lecture/écriture Redis, requête toujours fraîche, filtres
  calculés et renvoyés directement dans la même réponse (pas de round-trip `/getFiltres`).
  Utile pour un écran qui doit toujours montrer les données à l'instant T, ou pour un
  projet qui n'a pas (encore) de Redis configuré.
- Si tu passes `useCache: true` sans avoir fourni `cache` à `createTableQueryModule`,
  une erreur explicite est levée au lieu d'échouer silencieusement.

Le cache est donc décidé **par appel** (`reqTableQuery`), pas globalement pour tout le
module — tu peux avoir certains endpoints en cache et d'autres non avec le même module.

## Côté React

```tsx
import { DataTable } from '@benjosivo/table-query/react';

<DataTable
    fetchData={(params) => fetch('/api/commandes', { method: 'POST', body: JSON.stringify(params) }).then((r) => r.ok ? r.json() : null)}
    advancedFilters
/>
```

Ou en composant seulement `useDataTable` + `Table` + `Pagination` avec ta propre UI de
filtre (voir la conversation précédente pour l'exemple complet).

## Build & publish

```bash
npm run build     # tsc → dist/react + dist/server
npm publish       # même config GitHub Packages que @benjosivo/mysql
```
