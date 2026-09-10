import { Request, Response, Router } from 'express';
import { connectionRollback, executeMySQLQuery, executeMySQLQuery2, executeMySQLQuery3 } from '@benjosivo/mysql';
import { createHash, randomUUID } from 'crypto';
import type { CacheDeps, ParamFilterType, ReqTableQueryOptions, TableQueryDeps } from './types.js';

export type { CacheDeps, ParamFilterType, ReqTableQueryOptions, TableQueryDeps } from './types.js';

/**
 * Creates the table-query module (router + query helpers) bound to this project's own
 * date formatting / route-wrapping / cache implementations. Nothing here is hardcoded to
 * a specific project — pass whatever you already have in `functions.js` / `redis.js`.
 *
 * Caching is opt-in per call (see `useCache` on `reqTableQuery`): if you never pass
 * `deps.cache`, the module works exactly the same but always computes fresh.
 */
export function createTableQueryModule(deps: TableQueryDeps) {
    const router = Router();
    router.get('/getFiltres', deps.wrapRouteHandler(getFiltres));

    function resolveCache(useCache: boolean | undefined): CacheDeps | null {
        const wantsCache = useCache ?? Boolean(deps.cache);
        if (!wantsCache) return null;
        if (!deps.cache) {
            throw new Error(`useCache: true a été demandé mais aucune implémentation de cache n'a été fournie à createTableQueryModule().`);
        }
        return deps.cache;
    }

    async function getFiltres(req: Request, res: Response) {
        if (!deps.cache) {
            return res.status(501).send(`Le cache n'est pas configuré pour ce module — /getFiltres n'est disponible qu'avec useCache.`);
        }
        if (!req.query || !req.query.cleRecupFiltre) {
            return res.status(400).send(`La clé de récupération des filtres est manquante.`);
        }

        const keyRecupFiltres = `tableQuery:recupFiltres:${req.query.cleRecupFiltre}`;
        let interval: NodeJS.Timeout | null = null;
        req.on('close', () => {
            if (interval) clearInterval(interval);
            deps.cache!.deleteSQLCache(keyRecupFiltres);
        });
        async function sendFiltres() {
            const cacheFiltre = await deps.cache!.getSQLCache(keyRecupFiltres);

            if (!cacheFiltre) {
                return req.closed ? null : res.status(410).send(`La clé de récupération des filtres a expiré. Veuillez rafraîchir la page.`);
            }

            if (!cacheFiltre.data.status && cacheFiltre.data.filtres) {
                req.closed ? null : res.json(cacheFiltre.data.filtres);
                deps.cache!.deleteSQLCache(keyRecupFiltres);
                if (interval) clearInterval(interval);
                return;
            }
        }
        interval = setInterval(sendFiltres, 200);
        sendFiltres();
    }

    async function reqTableQuery(opt: ReqTableQueryOptions) {
        const { query, req, paramFilter, sort, argsQuery, keepCache = 5 * 60 * 1000 } = opt;
        if (!req.body && !req.query) {
            return { error: `req.query or req.body is missing`, status: 400 };
        }

        const cache = resolveCache(opt.useCache);

        const reqInfo = req.body ?? req.query;
        const limit = reqInfo.limit ? parseInt(reqInfo.limit, 10) : 1000;
        const offset = reqInfo.offset ? parseInt(reqInfo.offset, 10) : 0;
        const sorting = reqInfo.sorting || sort || '2';
        const filtres = reqInfo.filtre ? (req.method === 'GET' ? JSON.parse(reqInfo.filtre) : reqInfo.filtre) : {};
        const whereClause = buildWhereClause(filtres);

        if (!paramFilter && reqInfo.setFilter) {
            return { error: `"paramFilter" est obligatoire quand setFilter === true`, status: 400 };
        }

        // ── Paginated items ────────────────────────────────────────────────
        const itemsSql = `${query} ${whereClause} ORDER BY ${sorting} LIMIT ${limit < 0 ? 0 : limit} OFFSET ${offset < 0 ? 0 : offset}`;
        let { payload, status, error, empty } = await getDataFromQuery(itemsSql, argsQuery, cache ? keepCache : 0, cache);
        payload.paramFilter = paramFilter
            ? paramFilter.map((param, i) => {
                  return { nom: payload.fieldsType[i].fieldName, type: param };
              })
            : [];
        if (empty) return { empty, data: payload };
        if (error && status) return { error, status };
        if (!reqInfo.setFilter) return { data: payload };

        // ── Filters ────────────────────────────────────────────────────────
        const baseQuery = `${query} ${whereClause}`;

        if (!cache) {
            // No cache configured/requested for this call: compute synchronously and
            // return directly, no polling round-trip via /getFiltres needed.
            payload.filtre = await getFiltersOfQuery({ payload, baseQuery, argsQuery, paramFilter: paramFilter! });
            return { data: payload };
        }

        const keyFilter = createHash('sha256').update(baseQuery).digest('hex');
        const titleSQLCacheFiltre = `tableQuery:filtres:${keyFilter}`;

        const cachedFiltre = await cache.getSQLCache(titleSQLCacheFiltre);
        if (cachedFiltre && keepCache) {
            payload.filtre = cachedFiltre.data;
        } else {
            payload.cleRecupFiltre = randomUUID();
            getFiltersOfQuery({
                payload,
                baseQuery,
                argsQuery,
                paramFilter: paramFilter!,
                cleRecupFiltre: payload.cleRecupFiltre,
                cache,
                keepCache: { keepCache, titleSQLCacheFiltre },
            });
        }
        return { data: payload };
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    async function getDataFromQuery(itemsSql: string, argsQuery: any[] | undefined, keepCache: number, cache: CacheDeps | null) {
        const titleSQLCacheQuery = `tableQuery:query:${createHash('sha256').update(itemsSql).digest('hex')}`;
        const cachedQuery = cache && keepCache ? await cache.getSQLCache(titleSQLCacheQuery) : null;

        let payload: any;
        if (cachedQuery) {
            payload = cachedQuery.data;
        } else {
            const reqRows = await executeMySQLQuery3({ query: itemsSql, values: argsQuery, returnFieldTypes: true, returnListTables: true });
            if (!reqRows.ok) return { status: 500, error: reqRows.error };

            const tableValues = reqRows.rows.map(({ TotalCount, ...rest }: any) => rest);
            if (tableValues.length === 0) return { empty: true, payload: { items: tableValues, count: 0, fieldsType: reqRows.fieldsType } };

            Object.keys(tableValues[0]).forEach((col: any, i: number) => {
                if (col === 'Documents') reqRows.fieldsType[i].fieldType = 'FILE';
            });

            payload = { items: tableValues, count: reqRows.rows[0]?.TotalCount ?? 0, fieldsType: reqRows.fieldsType };

            if (cache && keepCache) {
                await cache.setSQLCache(titleSQLCacheQuery, { title: titleSQLCacheQuery, data: payload, expiration: Date.now() + keepCache });
            }
        }
        return { payload };
    }

    async function getFiltersOfQuery(opt: {
        payload: any;
        baseQuery: string;
        argsQuery?: any[];
        paramFilter: ParamFilterType[];
        cleRecupFiltre?: string;
        cache?: CacheDeps;
        keepCache?: { keepCache: number; titleSQLCacheFiltre: string };
    }) {
        const { payload, baseQuery, argsQuery, paramFilter, cleRecupFiltre, cache, keepCache } = opt;

        const columns = Object.keys(payload.items[0]);

        if (cleRecupFiltre && cache) {
            const titreRecupFiltres = `tableQuery:recupFiltres:${cleRecupFiltre}`;
            await cache.setSQLCache(titreRecupFiltres, { title: titreRecupFiltres, data: { status: `Waiting` }, expiration: Date.now() + 60 * 60 * 1000 });
        }

        const filtres = await computeFiltersViaTempTable({ baseQuery, argsQuery, columns, paramFilter });

        if (cleRecupFiltre && cache) {
            const titreRecupFiltres = `tableQuery:recupFiltres:${cleRecupFiltre}`;
            await cache.setSQLCache(titreRecupFiltres, { title: titreRecupFiltres, data: { filtres }, expiration: Date.now() + 60 * 60 * 1000 });
        }

        if (keepCache && cache) {
            await cache.setSQLCache(keepCache.titleSQLCacheFiltre, { title: keepCache.titleSQLCacheFiltre, data: filtres, expiration: Date.now() + keepCache.keepCache });
        }
        return filtres;
    }

    function buildWhereClause(filtres: Record<string, any>): string {
        if (Object.keys(filtres).length === 0) return '';

        function singleCondition(key: string, val: string): string {
            const lower = val.toLowerCase();
            if (lower === 'null' || lower === 'vide') return `\`${key}\` IS NULL`;
            if (lower === 'notnull' || lower === 'non vide') return `\`${key}\` IS NOT NULL`;
            if (val.startsWith('!')) return `\`${key}\` NOT LIKE '${val.replaceAll("'", "''")}'`;
            return `\`${key}\` LIKE '${val.replaceAll("'", "''")}'`;
        }

        const conditions = Object.entries(filtres).map(([key, value]) => {
            if (Array.isArray(value)) {
                return `(${value.map((val: any) => singleCondition(key, String(val).replaceAll('/*/', '%'))).join(' OR ')})`;
            }
            if (value !== null && typeof value === 'object' && 'min' in value && 'max' in value) {
                const min = value.date ? `'${deps.convertToMySQLDateTime(value.min)}'` : value.min;
                const max = value.date ? `'${deps.convertToMySQLDateTime(value.max)}'` : value.max;

                if (value.min && value.max) return `(\`${key}\` BETWEEN ${min} AND ${max})`;
                if (value.max && !value.min) return `(\`${key}\` <= ${max})`;
                if (value.min && !value.max) return `(\`${key}\` >= ${min})`;
                return undefined;
            }
            return singleCondition(key, String(value).replaceAll('/*/', '%'));
        });

        return `WHERE ${conditions.filter((el) => !!el).join(' AND ')}`;
    }

    async function computeFiltersViaTempTable(opt: { baseQuery: string; argsQuery: any[] | undefined; columns: string[]; paramFilter: ParamFilterType[] }) {
        const { baseQuery, argsQuery, columns, paramFilter } = opt;
        const tmpTable = `tmp_filter_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const createSql = `CREATE TEMPORARY TABLE \`${tmpTable}\` AS (${baseQuery})`;
        const created = await executeMySQLQuery2({ query: createSql, values: argsQuery, connKey: true });
        if (created.error) return [];

        const connKey = created.connKey;
        try {
            const results = await Promise.all(columns.map((col, index) => buildFilterQueryFromTempTable(col, index, paramFilter, tmpTable, connKey)));
            const payload: any = {};
            results.filter(Boolean).forEach((element: any) => {
                const key = Object.keys(element)[0];
                const values = Object.keys(element)[1];
                payload[key] = values ? { type: element[key], values: element[values] } : { type: element[key] };
            });
            return payload;
        } finally {
            await executeMySQLQuery(`DROP TEMPORARY TABLE IF EXISTS \`${tmpTable}\``, [], false);
            connectionRollback(connKey);
        }
    }

    async function buildFilterQueryFromTempTable(col: string, index: number, paramFilter: ParamFilterType[], tmpTable: string, connKey: string) {
        const type = paramFilter[index];
        if (!col) return null;
        if (!type || type === 'HIDE' || type === 'JSON' || type === 'FILE') return { [col]: type };

        if (type === 'SLIDER' || type === 'DATE' || type === 'DATETIME') {
            const sql = `SELECT MIN(\`${col}\`) AS min_val, MAX(\`${col}\`) AS max_val FROM \`${tmpTable}\``;
            const result = await executeMySQLQuery2({ query: sql, connKey });
            if (result.error || !result[0]) return null;
            return { [col]: type, values: [Number(result[0].min_val), Number(result[0].max_val)] };
        }

        if (type === 'MULTISELECT') {
            const sql = `SELECT DISTINCT COALESCE(\`${col}\`, 'Vide') AS val FROM \`${tmpTable}\` ORDER BY val`;
            const result = await executeMySQLQuery2({ query: sql, connKey });
            if (result.error) return null;
            return { [col]: type, values: result.map((r: any) => r.val) };
        }

        if (type === 'UNGROUP_MULTISELECT') {
            const sql = `SELECT \`${col}\` AS val FROM \`${tmpTable}\` WHERE \`${col}\` IS NOT NULL`;
            const result = await executeMySQLQuery2({ query: sql, connKey });
            if (result.error) return null;
            const values = [...new Set(result.flatMap((r: any) => (r.val ? String(r.val).split(', ') : ['Vide'])))].sort();
            return { [col]: type, values };
        }

        return null;
    }

    return { router, reqTableQuery, getFiltersOfQuery };
}
