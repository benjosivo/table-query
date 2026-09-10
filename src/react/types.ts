// ==================== TYPES ====================

export type SortDirection = 'ASC' | 'DESC';

/** Matches the "fieldType" info your API already returns per column. */
export type FieldTypeName = 'DATE' | 'DATETIME' | 'TIMESTAMP' | 'JSON' | 'BLOB' | 'FILE' | string;

export interface FieldTypeInfo {
    fieldType: FieldTypeName;
}

/** Body sent to your fetchData callback on every load. */
export interface FetchParams {
    limit: number;
    offset: number;
    sorting?: string;
    filtre?: Record<string, unknown>;
    /** Ask the backend to (re)send the advanced filter definitions (filtre config). */
    setFilter?: boolean;
}

export interface FetchResult<T> {
    items: T[];
    count: number;
    /** One entry per column, in the same order as Object.keys(items[0]). */
    fieldsType?: FieldTypeInfo[];
    /** Advanced filter definitions, sent back by the API (see FilterFieldConfig). */
    filtre?: FilterConfig;
    /** Key to re-fetch filter definitions later via a dedicated endpoint. */
    cleRecupFiltre?: string;
}

export type FilterFieldType = 'MULTISELECT' | 'UNGROUP_MULTISELECT' | 'SLIDER' | 'DATE' | 'DATETIME' | 'HIDE';

export interface FilterFieldConfig {
    type: FilterFieldType;
    /** MULTISELECT: string[]. SLIDER: [number, number]. DATE/DATETIME: [string, string]. */
    values: any;
}

export type FilterConfig = Record<string, FilterFieldConfig>;

export interface DataTableProps<T extends Record<string, any>> {
    /** Called every time the table needs data (page change, sort, filter, page size). */
    fetchData: (params: FetchParams) => Promise<FetchResult<T> | null>;
    /** Called when a row is clicked, with the value of the row's first column as id. */
    onRowClick?: (id: any, row: T) => void;
    /** Enable the per-column quick filter button (magnifier icon) in the header. Default true. */
    filterEnabled?: boolean;
    /** Enable click-to-sort on column headers. Default true. */
    sortingEnabled?: boolean;
    /** Enable the advanced filter side panel (multiselect / slider / date), driven by fieldsType.filtre. Default false. */
    advancedFilters?: boolean;
    /** CSS max-height for the scroll area, e.g. "76vh". */
    height?: string;
    rowsPerPageOptions?: number[];
    defaultRowsPerPage?: number;
    /** Called instead of the default new-tab preview when an image cell is clicked. */
    onImagePreview?: (src: string) => void;
    /** Optional endpoint to lazily fetch filter definitions using cleRecupFiltre. */
    fetchFilterConfig?: (cleRecupFiltre: string) => Promise<FilterConfig>;
}
