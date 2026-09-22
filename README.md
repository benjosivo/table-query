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

### Règles de mise en forme (`formattingRules`)

`reqTableQuery` peut transporter des règles de couleur jusqu'au client. Elles sont renvoyées **telles quelles** dans `payload.formattingRules` : le serveur ne les évalue jamais et elles ne touchent **jamais** au SQL.

```js
const { data } = await reqTableQuery({
    query: `SELECT ...`,
    req,
    paramFilter: [null, 'MULTISELECT', 'SLIDER'],
    formattingRules: [
        { column: 'statut', operator: '=', value: 'en retard', style: { backgroundColor: '#ffd7d7' } },
        { column: 'montant', operator: '>', value: 10000, target: 'cell', style: { fontWeight: 'bold' } },
    ],
});
```

Les règles sont indexées **par nom de colonne** (contrairement à `paramFilter`, qui est positionnel). Une règle dont la `column` — ou celle d'une des `conditions` supplémentaires — ne correspond à aucune colonne de la requête est ignorée en entier, avec un `console.warn` — jamais une erreur.

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
| `formattingRules` | `FormattingRule[]` | Règles de mise en forme conditionnelle (voir « Mise en forme conditionnelle ») |
| `getRowFormatting` | `(row, i) => {style?, className?}` | Échappatoire : style de ligne calculé en JS, appliqué après toutes les règles |
| `getCellFormatting` | `(col, value, row, i) => {style?, className?}` | Idem, par cellule |
| `formattingEditor` | `boolean` (défaut `false`) | Affiche le bouton « Mise en forme » pour l'utilisateur final |
| `formattingStorageKey` | `string` | Sauvegarde les règles de l'utilisateur dans `localStorage` sous cette clé |
| `onFormattingRulesChange` | `(rules) => void` | Appelée à chaque modification des règles de l'utilisateur |
| `initialUserFormattingRules` | `FormattingRule[]` | Réhydrate les règles utilisateur depuis ton backend (prioritaire sur `localStorage`) |
| `formattingButtonLabel` | `string` (défaut `'Mise en forme'`) | Libellé du bouton de la barre d'outils |

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

### Mise en forme conditionnelle (couleurs)

Colorer des lignes ou des cellules selon leurs valeurs, façon Excel. Les règles sont des objets **sérialisables** : elles peuvent être écrites en dur, stockées en base, ou renvoyées par l'API.

```tsx
<DataTable
    fetchData={fetchCommandes}
    formattingRules={[
        // Toute la ligne en rouge pâle quand le statut vaut "en retard"
        { column: 'statut', operator: '=', value: 'en retard', style: { backgroundColor: '#ffd7d7' } },
        // Seulement la cellule "montant" en gras vert au-dessus de 10 000
        { column: 'montant', operator: '>', value: 10000, target: 'cell', style: { color: '#0a7d32', fontWeight: 'bold' } },
        // Deux colonnes précises, via une classe CSS de ton app
        { column: 'livraison', operator: 'isNull', target: ['livraison', 'transporteur'], className: 'a-completer' },
        // Plusieurs colonnes DANS la condition : en retard ET montant élevé, avec une info-bulle
        {
            column: 'statut',
            operator: '=',
            value: 'en retard',
            conditions: [{ column: 'montant', operator: '>', value: 10000 }],
            style: { backgroundColor: '#c0392b', color: 'white' },
            title: 'En retard et montant élevé',
        },
    ]}
/>
```

La librairie ne livre **aucun CSS** : `style` (inline) fonctionne sans configuration, `className` suppose que ton app définit la classe.

#### Écrire une règle (`FormattingRule`)

| Champ | Type | Description |
|---|---|---|
| `column` | `string` | **Obligatoire.** Nom de la colonne testée par la condition principale (une clé des objets de `items`) |
| `operator` | voir table ci-dessous | **Obligatoire.** |
| `value` | `any` | L'opérande ; sa forme dépend de l'opérateur |
| `conditions` | `FormattingCondition[]` | Conditions supplémentaires (`{ column, operator, value?, valueType? }`), combinées avec la condition principale via `conditionLogic` |
| `conditionLogic` | `'AND' \| 'OR'` | Comment `conditions` se combine à la condition principale. Défaut `'AND'` |
| `target` | `'row' \| 'cell' \| string[]` | Ce qui est coloré. Défaut `'row'`. `'cell'` désigne toujours la colonne de la condition **principale**, quel que soit le nombre de `conditions` |
| `style` | `CSSProperties` | Style inline appliqué au `<tr>` ou au `<td>` |
| `className` | `string` | Classe CSS ajoutée au `<tr>` ou au `<td>` |
| `title` | `string` | Attribut HTML `title` (info-bulle native) posé sur le `<tr>` ou le `<td>` quand la règle matche |
| `valueType` | `'auto' \| 'string' \| 'number' \| 'date' \| 'boolean'` | Force le mode de comparaison. Défaut `'auto'` |
| `stopIfTrue` | `boolean` | Arrête les règles suivantes sur ce que cette règle a coloré |
| `enabled` | `boolean` | `false` conserve la règle sans l'appliquer. Défaut `true` |
| `label` | `string` | Libellé affiché dans l'éditeur |
| `id` | `string` | Généré automatiquement si absent |

| Opérateur | Opérande |
|---|---|
| `=` `!=` `<` `<=` `>` `>=` | une valeur |
| `between` | `[min, max]` ou `{min, max}` — **bornes incluses**, inversées tolérées |
| `in` | un tableau, ou une chaîne `"a, b, c"` |
| `contains` `notContains` `startsWith` `endsWith` | une valeur (toujours comparée en texte) |
| `isNull` `isNotNull` | aucune |

#### Cible d'une règle (`target`)

- `'row'` (défaut) → le `<tr>` entier.
- `'cell'` → seulement la cellule de la colonne testée.
- `['col_a', 'col_b']` → ces colonnes-là.

Le style de ligne est **aussi** posé sur chaque `<td>`. Sans cela, le moindre CSS de ton app sur `td` (zébrage, `tbody td { background: #fff }`) recouvrirait le fond du `<tr>` et la couleur semblerait ne pas marcher. Une règle `'cell'` est étalée **par-dessus**, elle l'emporte donc propriété par propriété.

Les `className`, eux, ne descendent **pas** sur les `<td>` : une classe de ligne est un point d'accroche pour ton propre CSS, écris `tr.ma-classe td { ... }`.

#### Conditions multiples (`conditions`, `conditionLogic`)

Une règle peut tester **plusieurs colonnes à la fois** avant de colorer, indépendamment de ce qu'elle colore (`target`) :

```tsx
{
    column: 'age', operator: '>', value: 18,
    conditions: [{ column: 'statut', operator: '=', value: 'actif' }],
    conditionLogic: 'AND', // défaut — 'OR' matche si au moins une condition est vraie
    target: 'row',
    style: { backgroundColor: '#eaffea' },
}
```

`conditions` est une liste **plate** (pas de groupes imbriqués ET-de-OU) combinée à la condition principale (`column`/`operator`/`value`) par un seul `conditionLogic`. Une règle sans `conditions` se comporte exactement comme avant.

#### Ordre, fusion et `stopIfTrue`

Les règles sont évaluées **dans l'ordre**, et cet ordre **est** la priorité :

1. `formattingRules` (props de ton app)
2. les règles renvoyées par l'API
3. les règles créées par l'utilisateur dans l'éditeur

Les styles se **cumulent** ; sur une même propriété CSS, **la dernière règle gagne**. Deux règles peuvent donc apporter l'une le fond, l'autre le gras.

`stopIfTrue` gèle exactement ce que la règle a coloré : posé sur une règle `'row'`, il bloque les règles `'row'` suivantes mais **pas** les règles `'cell'` ; posé sur une règle `'cell'`, il ne gèle que cette cellule.

#### Comparaison des valeurs

Les valeurs viennent de MySQL : un `DECIMAL` arrive en chaîne, une `DATE` en objet `Date`. En mode `'auto'`, la comparaison essaie dans cet ordre : **date** (si un `Date` est en jeu) → **nombre** (si les deux côtés sont numériques) → **date ISO** → **texte**.

- Le texte est comparé **sans tenir compte de la casse**.
- `'007'` et `'7'` sont **égaux** en mode auto (comparaison numérique). Pour une référence ou un code postal, mets `valueType: 'string'`.
- `'2024'` est traité comme un **nombre**, pas comme une année.
- Une valeur `'YYYY-MM-DD'` désigne le **jour entier** : `= '2024-01-05'` matche un `DATETIME` du 5 à 14h32, et `between` inclut toute la journée de fin.

**Valeurs nulles** : `isNull` matche `null`, `undefined` et la chaîne vide ; `!=` et `notContains` matchent sur une valeur nulle ; **tous les autres opérateurs ne matchent jamais** sur `null`. Une règle visant une colonne **inexistante** ne matche rien du tout (y compris `isNull`).

#### Message d'info-bulle (`title`)

Quand une règle matche, son `title` (s'il est défini) est posé comme attribut HTML natif sur le `<tr>` (ou le `<td>` pour une cible `'cell'`/colonnes choisies) — l'utilisateur final voit *pourquoi* c'est coloré au survol, sans ouvrir l'éditeur. Plusieurs règles qui matchent le même élément **concatènent** leurs messages (séparés par un saut de ligne) plutôt que de s'écraser.

Pas besoin de répéter le message sur chaque cellule : l'attribut `title` **s'hérite nativement** en HTML, un `<td>` sans son propre `title` affiche celui de son `<tr>` au survol. Une cellule avec sa propre règle `'cell'`/`title` affiche le sien à la place, exactement comme son style l'emporte sur celui de la ligne.

#### Échappatoire : `getRowFormatting` / `getCellFormatting`

Pour une logique qui croise plusieurs colonnes, hors de portée d'une règle déclarative :

```tsx
const getRowFormatting = useCallback(
    (row) => (row.livree > row.commandee ? { style: { backgroundColor: '#ffe6e6' } } : null),
    [],
);

<DataTable fetchData={fetchCommandes} getRowFormatting={getRowFormatting} />
```

Ces callbacks sont appliqués **en dernier** et ignorent `stopIfTrue` — ils l'emportent toujours. **Enveloppe-les dans `useCallback`**, sinon le calcul des couleurs est refait à chaque rendu.

#### L'éditeur pour l'utilisateur final (`formattingEditor`)

Désactivé par défaut. Avec `formattingEditor`, un bouton « Mise en forme » apparaît au-dessus du tableau et ouvre une modale où l'utilisateur ajoute, réordonne, désactive et supprime ses propres règles. Chaque règle peut recevoir des conditions supplémentaires (bouton « + Ajouter une condition », combinées en ET/OU) et un message d'info-bulle (« Message (info-bulle) »).

```tsx
<DataTable
    fetchData={fetchCommandes}
    formattingEditor
    formattingStorageKey='commandes'            // persistance locale, gérée par la lib
    onFormattingRulesChange={(rules) => save(rules)}  // ou ta propre persistance serveur
    initialUserFormattingRules={reglesDeMonBackend}   // prioritaire sur localStorage
/>
```

- `formattingStorageKey` écrit sous la clé réelle `tableQuery:formatting:<clé>`, au format `{"v":1,"rules":[...],"disabled":[...]}`. Tout accès au stockage est protégé (SSR, navigation privée, quota dépassé) et une version inconnue est ignorée.
- L'utilisateur n'édite que **sa** couche. Les règles venues des props et de l'API s'affichent en lecture seule, avec une case pour les désactiver.
- Sans `formattingEditor`, aucun nœud supplémentaire n'est ajouté au DOM.

#### Limites connues

- Sur une colonne `JSON`, la coloration du texte peut sembler sans effet : le rendu JSON pose ses propres `<span class="key|string|number">`, et le CSS de ton app sur ces classes l'emporte sur la couleur héritée du `<td>`. Le fond, lui, fonctionne.
- Sur une colonne `FILE`/`BLOB`, le contenu est un `<img>` ou un `<button>` : le fond s'affiche autour, mais la couleur du texte est écrasée par le style de tes boutons.
- Une règle visant une colonne masquée (`HIDE`) est bien évaluée, mais une cible `'cell'` sur cette colonne n'a aucun effet visible.

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