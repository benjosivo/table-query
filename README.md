# @benjosivo/table-query

Tableau de données triable, filtrable et paginé, en deux parties indépendantes :

- **`@benjosivo/table-query/server`** — logique de requêtage côté serveur (Express + MySQL) : pagination, tri, filtres, calcul des valeurs disponibles pour chaque colonne, mise en cache optionnelle.
- **`@benjosivo/table-query/react`** — composants et hook React pour afficher ce type de données : tableau, pagination, filtre rapide par colonne, panneau de filtres avancés (multiselect / plage numérique / plage de dates).

Les deux parties fonctionnent ensemble mais peuvent aussi être utilisées séparément (par exemple le composant React seul, avec ton propre backend).

## Installation

```bash
npm install @benjosivo/table-query
```

Selon la partie utilisée, il faut aussi avoir installé dans le projet :

| Partie utilisée | Dépendances nécessaires |
|---|---|
| `/server` | `express`, `@benjosivo/mysql` |
| `/react` | `react` (v18+) |

Ce sont des `peerDependencies` : le package ne les installe pas lui-même, il utilise celles déjà présentes dans ton projet.

---

## Côté serveur

### Créer le module

```ts
import { createTableQueryModule } from '@benjosivo/table-query/server';

const { router, reqTableQuery } = createTableQueryModule({
    // Formate une date/heure au format attendu par MySQL
    convertToMySQLDateTime: (date) => /* ta fonction */,

    // Enveloppe un handler Express (gestion d'erreurs, etc.)
    wrapRouteHandler: (fn) => /* ta fonction */,

    // Optionnel : uniquement nécessaire si tu veux pouvoir utiliser le cache (voir plus bas)
    cache: {
        getSQLCache: (key) => /* lit une entrée de cache */,
        setSQLCache: (key, value) => /* écrit une entrée de cache */,
        deleteSQLCache: (key) => /* supprime une entrée de cache */,
    },
});
```

`router` expose la route `GET /getFiltres`, utilisée en interne pour récupérer les filtres calculés en tâche de fond. Monte-le sur le chemin de ton choix :

```ts
app.use('/tableCreation/api', router);
```

### Répondre à une requête de table

```ts
app.post('/api/commandes', wrapRouteHandler(async (req, res) => {
    const result = await reqTableQuery({
        query: `SELECT c.*, COUNT(*) OVER() AS TotalCount FROM commandes c`,
        req,
        // Un type de filtre par colonne renvoyée par la requête (sauf la 1ère, l'identifiant)
        paramFilter: ['MULTISELECT', 'HIDE', 'DATE', 'MULTISELECT'],
    });

    if (result.error) return res.status(result.status ?? 500).send(result.error);
    res.json(result.data);
}));
```

`reqTableQuery` lit `limit`, `offset`, `sorting`, `filtre` et `setFilter` dans `req.body` (ou `req.query`) — c'est exactement ce que le composant React `DataTable`/`useDataTable` envoie, donc les deux côtés s'emboîtent directement.

### Types de filtre disponibles (`paramFilter`)

| Type | Effet |
|---|---|
| `'MULTISELECT'` | Liste de valeurs distinctes de la colonne, sélection multiple |
| `'UNGROUP_MULTISELECT'` | Comme `MULTISELECT`, mais éclate les valeurs séparées par `, ` dans une même cellule |
| `'SLIDER'` | Plage numérique (min/max) |
| `'DATE'` / `'DATETIME'` | Plage de dates |
| `'JSON'` / `'FILE'` | Pas de filtre, juste un rendu spécifique côté React |
| `'HIDE'` | Colonne sans filtre |
| `null` | Colonne sans filtre particulier |

### Le cache (`useCache`)

Le cache est activé **par appel**, pas globalement :

```ts
reqTableQuery({ query, req, paramFilter, useCache: true });  // utilise le cache
reqTableQuery({ query, req, paramFilter, useCache: false }); // toujours une donnée fraîche
```

- Si `cache` a été fourni à `createTableQueryModule`, `useCache` vaut `true` par défaut.
- Si `cache` n'a pas été fourni, `useCache` vaut `false` par défaut (aucun Redis requis).
- Demander `useCache: true` sans avoir fourni `cache` lève une erreur explicite.
- Avec `useCache: false`, les valeurs de filtre disponibles sont calculées et renvoyées directement dans la réponse. Avec `useCache: true`, elles sont calculées en tâche de fond et le composant React va les chercher via `/getFiltres` (polling automatique, rien à faire côté appelant).

---

## Côté React

### Utilisation simple (tout inclus)

```tsx
import { DataTable } from '@benjosivo/table-query/react';

function CommandesTable() {
    return (
        <DataTable
            fetchData={(params) =>
                fetch('/api/commandes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params),
                }).then((res) => (res.ok ? res.json() : null))
            }
            onRowClick={(id, row) => console.log('ligne cliquée', id, row)}
            advancedFilters
        />
    );
}
```

#### Props de `<DataTable />`

| Prop | Type | Description |
|---|---|---|
| `fetchData` | `(params) => Promise<FetchResult \| null>` | **Obligatoire.** Appelée à chaque changement de page/tri/filtre. |
| `onRowClick` | `(id, row) => void` | Appelée au clic sur une ligne |
| `filterEnabled` | `boolean` (défaut `true`) | Affiche le bouton de filtre rapide par colonne |
| `sortingEnabled` | `boolean` (défaut `true`) | Active le tri au clic sur l'en-tête |
| `advancedFilters` | `boolean` (défaut `false`) | Affiche le panneau de filtres avancés (nécessite `setFilter`/`paramFilter` côté serveur) |
| `height` | `string` (défaut `'76vh'`) | Hauteur max de la zone de défilement |
| `rowsPerPageOptions` | `number[]` | Choix disponibles pour le nombre de lignes par page |
| `defaultRowsPerPage` | `number` | Valeur par défaut |
| `onImagePreview` | `(src) => void` | Appelée au clic sur une image (sinon ouverture dans un nouvel onglet) |
| `selectable` | `boolean` (défaut `false`) | Affiche une colonne de checkbox (voir « Sélection de lignes ») |
| `selectionColumnPosition` | `number \| 'start' \| 'end'` (défaut `'start'`) | Position de la colonne de checkbox parmi les colonnes visibles |
| `selectedIds` | `any[]` | Sélection contrôlée par le parent (voir plus bas) |
| `onSelectionChange` | `(ids, rows) => void` | Appelée à chaque changement de sélection, avec les ids et les lignes complètes |

### Sélection de lignes (checkbox)

Avec `selectable`, une colonne de checkbox est ajoutée. La checkbox de l'en-tête coche/décoche **toutes les lignes affichées** (la page courante) et passe en état indéterminé quand seule une partie l'est.

```tsx
const [selection, setSelection] = useState<any[]>([]);

<DataTable
    fetchData={fetchCommandes}
    selectable
    selectionColumnPosition='start'   // 'start' | 'end' | index (ex. 2)
    onSelectionChange={(ids, rows) => {
        setSelection(ids);            // ids = valeur de la 1ère colonne de chaque ligne
        console.log(rows);            // les lignes entières, comme dans onRowClick
    }}
/>
```

- **Identifiant d'une ligne** : la valeur de sa **première colonne** — la même règle que `onRowClick`. La colonne peut être masquée (`HIDE`), l'identifiant reste utilisable.
- **Position** : `'start'` (défaut), `'end'`, ou un index 0-based **parmi les colonnes visibles** (`2` = 3ᵉ colonne ; les colonnes `HIDE` ne comptent pas). Un index hors limites est ramené au début ou à la fin.
- **Entre les pages** : la sélection est cumulative — on peut cocher des lignes page 1, aller page 2, et `onSelectionChange` renvoie l'ensemble (ids **et** lignes complètes, même celles qui ne sont plus affichées).
- **Changement de tri ou de filtre** : le jeu de données n'est plus le même, la sélection est donc vidée et `onSelectionChange([], [])` est appelée. Changer de page ou le nombre de lignes par page ne la vide pas.
- Cliquer une checkbox ne déclenche pas `onRowClick`.

#### Sélection contrôlée

Si le parent passe `selectedIds`, c'est lui qui détient l'état : le tableau n'affiche que ce qu'on lui donne. Pratique pour cocher des lignes par programme ou vider la sélection après une action groupée.

```tsx
const [selection, setSelection] = useState<any[]>([]);

const supprimer = async () => {
    await fetch('/api/commandes/suppression', { method: 'POST', body: JSON.stringify({ ids: selection }) });
    setSelection([]); // on vide la sélection nous-mêmes
};

<DataTable
    fetchData={fetchCommandes}
    selectable
    selectedIds={selection}
    onSelectionChange={(ids) => setSelection(ids)}
/>
```

### Utilisation avec ta propre UI de filtre

Si le système de filtre par défaut ne convient pas, utilise le hook et les composants séparément :

```tsx
import { useDataTable, Table, Pagination } from '@benjosivo/table-query/react';

function CommandesTable() {
    const table = useDataTable({ fetchData: fetchCommandes });
    const [recherche, setRecherche] = useState('');

    const rechercher = () => {
        table.replaceFilters({ reference: [`/*/${recherche}/*/`] });
        // ou, filtre par filtre : table.setColumnFilter('statut', ['en_cours']);
    };

    return (
        <>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <button onClick={rechercher}>Rechercher</button>

            <Table
                items={table.items}
                fieldsType={table.fieldsType}
                sortColumn={table.sortColumn}
                sortDirection={table.sortDirection}
                onSort={table.toggleSort}
            />

            <Pagination
                page={table.page}
                totalPages={table.totalPages}
                perPage={table.perPage}
                count={table.count}
                onChangePerPage={table.changePerPage}
                onFirst={table.firstPage}
                onPrevious={table.previousPage}
                onNext={table.nextPage}
                onLast={table.lastPage}
            />
        </>
    );
}
```

`useDataTable` gère la pagination, le tri et l'appel réseau ; il n'impose aucune UI de filtre — `table.setColumnFilter(colonne, valeur)` et `table.replaceFilters(objet)` permettent de piloter le filtrage depuis n'importe quelle interface.

Le hook gère aussi la sélection, que tu utilises `<DataTable />` ou le `<Table />` nu :

```tsx
const table = useDataTable({ fetchData, onSelectionChange: (ids, rows) => console.log(ids, rows) });

<Table
    items={table.items}
    fieldsType={table.fieldsType}
    selectable
    selectionColumnPosition='end'
    selectedIds={table.selectedIds}
    onToggleRow={table.setRowSelected}
    onToggleAllRows={table.setAllRowsSelected}
/>
```

| Valeur renvoyée | Type | Description |
|---|---|---|
| `selectedIds` | `any[]` | Ids sélectionnés (1ère colonne de chaque ligne) |
| `selectedRows` | `T[]` | Les lignes complètes correspondantes, pages précédentes comprises |
| `isRowSelected` | `(row) => boolean` | |
| `setRowSelected` | `(row, selected) => void` | |
| `toggleRowSelection` | `(row) => void` | |
| `setAllRowsSelected` | `(selected) => void` | Toutes les lignes affichées ; les autres pages ne sont pas touchées |
| `clearSelection` | `() => void` | Vide la sélection |

### Format attendu par `fetchData`

```ts
interface FetchParams {
    limit: number;
    offset: number;
    sorting?: string;
    filtre?: Record<string, unknown>;
    setFilter?: boolean;
}

interface FetchResult<T> {
    items: T[];
    count: number;
    fieldsType?: { fieldType: string }[]; // 'DATE' | 'DATETIME' | 'JSON' | 'FILE' | 'BLOB' | ...
    filtre?: FilterConfig;       // renvoyé par le serveur si des filtres avancés sont demandés
    cleRecupFiltre?: string;     // utilisé en interne pour le polling du cache
}
```

C'est exactement la forme renvoyée par `reqTableQuery` côté serveur.

---

## Build

```bash
npm run build   # compile src/react et src/server dans dist/
```