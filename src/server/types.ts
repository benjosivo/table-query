import type { Request, Response } from 'express';

export type ParamFilterType = 'HIDE' | 'SLIDER' | 'DATE' | 'DATETIME' | 'UNGROUP_MULTISELECT' | 'MULTISELECT' | null | 'JSON' | 'FILE';

export interface CacheDeps {
    getSQLCache: (key: string) => Promise<any>;
    setSQLCache: (key: string, value: any) => Promise<any>;
    deleteSQLCache: (key: string) => Promise<any>;
}

export interface TableQueryDeps {
    convertToMySQLDateTime: (d: any) => string;
    wrapRouteHandler: (fn: (req: Request, res: Response) => Promise<any>) => any;
    /** Only required if some callers pass `useCache: true` (default). Omit it entirely
     * if this project never wants caching — every call then behaves as `useCache: false`. */
    cache?: CacheDeps;
}

export interface ReqTableQueryOptions {
    query: string;
    req: Request;
    paramFilter?: ParamFilterType[];
    sort?: string;
    argsQuery?: any[];
    /** How long (ms) a cached result stays valid. Only used when `useCache` resolves to true. */
    keepCache?: number;
    /** Use the Redis cache for this call. Defaults to true if `deps.cache` was provided at
     * module creation, false otherwise. Pass `false` explicitly to always force a fresh query
     * even when the module has a cache configured (e.g. for a "live" screen). */
    useCache?: boolean;
}
