import type { Request, Response } from 'express';
import { type CSSProperties } from 'react';

export type ParamFilterType = 'HIDE' | 'SLIDER' | 'DATE' | 'DATETIME' | 'UNGROUP_MULTISELECT' | 'MULTISELECT' | null | 'JSON' | 'FILE';

/** Same shape as the React-side `FormattingCondition` — see `FormattingRuleInput`. */
export interface FormattingConditionInput {
    column: string;
    operator: string;
    value?: unknown;
    valueType?: 'auto' | 'string' | 'number' | 'date' | 'boolean';
}

/**
 * Same shape as the React-side `FormattingRule`, but with no dependency on @types/react:
 * the server only ever forwards these rules, it never evaluates them, and a server-only
 * consumer must not be forced to install React's types to compile.
 */
export interface FormattingRuleInput extends FormattingConditionInput {
    id?: string;
    label?: string;
    /** Extra conditions combined with the primary column/operator/value. */
    conditions?: FormattingConditionInput[];
    /** How `conditions` combine with the primary condition. Defaults to 'AND'. */
    conditionLogic?: 'AND' | 'OR';
    target?: 'row' | 'cell' | string[];
    style?: CSSProperties;
    className?: string;
    /** HTML `title` (native tooltip) shown when the rule matches. */
    title?: string;
    stopIfTrue?: boolean;
    enabled?: boolean;
}

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
    /** Conditional formatting rules forwarded as-is to the client in `payload.formattingRules`.
     *  Rules whose `column` matches no column of the query are dropped. */
    formattingRules?: FormattingRuleInput[];
    /** Use the Redis cache for this call. Defaults to true if `deps.cache` was provided at
     * module creation, false otherwise. Pass `false` explicitly to always force a fresh query
     * even when the module has a cache configured (e.g. for a "live" screen). */
    useCache?: boolean;
}
