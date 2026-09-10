import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataTableProps, FetchResult, FieldTypeInfo, FilterConfig, SortDirection, ParamFilter } from './types.js';

export function useDataTable<T extends Record<string, any>>({
    fetchData,
    advancedFilters,
    rowsPerPageOptions = [10, 25, 50, 100, 250, 500, 1000],
    defaultRowsPerPage = 100,
    fetchFilterConfig,
}: Pick<DataTableProps<T>, 'fetchData' | 'advancedFilters' | 'rowsPerPageOptions' | 'defaultRowsPerPage' | 'fetchFilterConfig'>) {
    const [items, setItems] = useState<T[]>([]);
    const [count, setCount] = useState(0);
    const [fieldsType, setFieldsType] = useState<FieldTypeInfo[]>([]);
    const [paramFilter, setParamFilter] = useState<ParamFilter[]>([]);
    const [loading, setLoading] = useState(false);

    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(defaultRowsPerPage);
    const [sortColumn, setSortColumn] = useState<string>('');
    const [sortDirection, setSortDirection] = useState<SortDirection>('ASC');
    const [filters, setFilters] = useState<Record<string, unknown>>({});

    const [filterConfig, setFilterConfig] = useState<FilterConfig | null>(null);
    const [cleRecupFiltre, setCleRecupFiltre] = useState<string | undefined>();

    // Guards against a slow, stale request overwriting a newer one.
    const requestId = useRef(0);

    const sorting = useMemo(() => (sortColumn ? `\`${sortColumn}\` ${sortDirection}` : ''), [sortColumn, sortDirection]);
    const totalPages = useMemo(() => Math.max(1, Math.ceil(count / perPage)), [count, perPage]);

    const load = useCallback(
        async (targetPage: number) => {
            const id = ++requestId.current;
            setLoading(true);
            try {
                const offset = (targetPage - 1) * perPage;
                const result: FetchResult<T> | null = await fetchData({
                    limit: perPage,
                    offset,
                    sorting: sorting || undefined,
                    filtre: Object.keys(filters).length > 0 ? filters : undefined,
                    setFilter: advancedFilters || undefined,
                });

                if (id !== requestId.current) return; // a newer request already landed

                if (!result) {
                    setItems([]);
                    setCount(0);
                    return;
                }

                setItems(result.items || []);
                setCount(result.count ?? 0);
                setFieldsType(result.fieldsType || []);
                setParamFilter(result.paramFilter || []);
                setPage(targetPage);

                if (result.filtre) setFilterConfig(result.filtre);
                if (result.cleRecupFiltre) setCleRecupFiltre(result.cleRecupFiltre);
            } finally {
                if (id === requestId.current) setLoading(false);
            }
        },
        [fetchData, perPage, sorting, filters, advancedFilters],
    );

    // Re-fetch whenever page size, sorting or filters change (always resets to page 1).
    useEffect(() => {
        load(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [perPage, sorting, filters]);

    // Lazily resolve filter definitions if the API only gave us a lookup key.
    useEffect(() => {
        if (!advancedFilters || filterConfig || !cleRecupFiltre || !fetchFilterConfig) return;
        let cancelled = false;
        fetchFilterConfig(cleRecupFiltre).then((cfg) => {
            if (!cancelled) {
                setFilterConfig(cfg);
                setCleRecupFiltre(undefined);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [advancedFilters, filterConfig, cleRecupFiltre, fetchFilterConfig]);

    const goToPage = useCallback((p: number) => load(Math.min(Math.max(1, p), totalPages)), [load, totalPages]);
    const nextPage = useCallback(() => goToPage(page + 1), [goToPage, page]);
    const previousPage = useCallback(() => goToPage(page - 1), [goToPage, page]);
    const firstPage = useCallback(() => goToPage(1), [goToPage]);
    const lastPage = useCallback(() => goToPage(totalPages), [goToPage, totalPages]);

    const toggleSort = useCallback((column: string, forceDirection?: SortDirection) => {
        setSortColumn((prevCol) => {
            setSortDirection((prevDir) => forceDirection ?? (prevCol === column ? (prevDir === 'ASC' ? 'DESC' : 'ASC') : 'ASC'));
            return column;
        });
    }, []);

    const setColumnFilter = useCallback((key: string, value: unknown) => {
        setFilters((prev) => {
            const next = { ...prev };
            if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
            else next[key] = value;
            return next;
        });
    }, []);

    const clearFilter = useCallback((key: string) => setColumnFilter(key, undefined), [setColumnFilter]);
    const clearAllFilters = useCallback(() => setFilters({}), []);

    /** Replace the whole filter object at once — handy for a custom search UI that
     * doesn't reason "per column" and just wants to hand over its own `filtre` payload. */
    const replaceFilters = useCallback((next: Record<string, unknown>) => setFilters(next), []);

    const changePerPage = useCallback((n: number) => setPerPage(n), []);

    return {
        items,
        count,
        fieldsType,
        paramFilter,
        loading,
        page,
        perPage,
        rowsPerPageOptions,
        totalPages,
        sortColumn,
        sortDirection,
        filters,
        filterConfig,
        toggleSort,
        setColumnFilter,
        replaceFilters,
        clearFilter,
        clearAllFilters,
        changePerPage,
        goToPage,
        nextPage,
        previousPage,
        firstPage,
        lastPage,
        refresh: () => load(page),
    };
}
