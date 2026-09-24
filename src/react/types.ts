// ==================== TYPES ====================

import type { CSSProperties } from 'react';

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
    paramFilter?: ParamFilter[];
    filtre?: FilterConfig;
    /** Key to re-fetch filter definitions later via a dedicated endpoint. */
    cleRecupFiltre?: string;
    /** Conditional formatting rules defined by the API (see FormattingRule). */
    formattingRules?: FormattingRule[];
}

export type FilterFieldType = 'MULTISELECT' | 'UNGROUP_MULTISELECT' | 'SLIDER' | 'DATE' | 'DATETIME' | 'HIDE';

export interface FilterFieldConfig {
    type: FilterFieldType;
    /** MULTISELECT: string[]. SLIDER: [number, number]. DATE/DATETIME: [string, string]. */
    values: any;
}

export type ParamFilter = { nom: string; type: FilterFieldType };

export type FilterConfig = Record<string, FilterFieldConfig>;

/** Where the selection (checkbox) column is inserted among the visible columns. */
export type SelectionColumnPosition = number | 'start' | 'end';

// ==================== CONDITIONAL FORMATTING ====================

export type FormattingOperator =
    | '='
    | '!='
    | '<'
    | '<='
    | '>'
    | '>='
    | 'between'
    | 'in'
    | 'contains'
    | 'notContains'
    | 'startsWith'
    | 'endsWith'
    | 'isNull'
    | 'isNotNull';

/** What a rule paints: the whole row (default), the tested column's cell, or a given list of columns. */
export type FormattingTarget = 'row' | 'cell' | string[];

/** How the two operands are compared. 'auto' infers it from the values (see README). */
export type FormattingValueType = 'auto' | 'string' | 'number' | 'date' | 'boolean';

export interface FormattingStyle {
    /** Inline style — the package ships no CSS, so this is the path that works with no setup. */
    style?: CSSProperties;
    /** Class added to the <tr> (target 'row') or to the <td> (target 'cell' | string[]). */
    className?: string;
    /** HTML `title` (native tooltip) added to the <tr> or <td> when the rule matches. Several matching rules join their titles with a newline. */
    title?: string;
}

/** A single column test: `column op value`. See FormattingRule.conditions for combining several. */
export interface FormattingCondition {
    /** Name of the tested column (a key of the row objects), not its position. */
    column: string;
    operator: FormattingOperator;
    /** Operand(s): a scalar, [min, max] or {min, max} for 'between', an array for 'in', unused for isNull/isNotNull. */
    value?: unknown;
    valueType?: FormattingValueType;
}

export interface FormattingRule extends FormattingStyle, FormattingCondition {
    /** Stable id, needed by the editor to reorder/disable. Generated when missing. */
    id?: string;
    /** Free-form label shown in the editor; a summary is generated when missing. */
    label?: string;
    /** Extra conditions combined with the primary column/operator/value. Empty/absent = single-condition rule. */
    conditions?: FormattingCondition[];
    /** How `conditions` combine with the primary condition. Defaults to 'AND'. */
    conditionLogic?: 'AND' | 'OR';
    /** Defaults to 'row'. */
    target?: FormattingTarget;
    /** Stop evaluating later rules for the targets this rule wrote to. */
    stopIfTrue?: boolean;
    /** false keeps the rule in the list without applying it. Defaults to true. */
    enabled?: boolean;
}

export interface CellFormatting extends FormattingStyle {}

export interface RowFormatting {
    rowStyle?: CSSProperties;
    rowClassName?: string;
    rowTitle?: string;
    /** Keyed by column NAME — never by the positional index of fieldsType/paramFilter. */
    cellStyles: Record<string, CellFormatting>;
}

/** Which layer a rule came from: the app's props, the API payload, or the end user's editor. */
export type FormattingRuleSource = 'props' | 'server' | 'user';

export type GetRowFormatting<T> = (row: T, rowIndex: number) => CellFormatting | null | undefined;
export type GetCellFormatting<T> = (column: string, value: any, row: T, rowIndex: number) => CellFormatting | null | undefined;

export interface DataTableProps<T extends Record<string, any>> {
    /** Called every time the table needs data (page change, sort, filter, page size). */
    fetchData: (params: FetchParams) => Promise<FetchResult<T> | null>;
    /** Called when a row is clicked, with the value of the row's first column as id. */
    onRowClick?: (id: any, row: T) => void;
    /** Enable the per-column quick filter button (magnifier icon) in the header. Default true. */
    filterEnabled?: boolean;
    /*filtres appliqué par defaut à la premiere requetes de la table*/
    defaultFilters?: Record<string, unknown>;
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
    /** Show a checkbox column; the header checkbox selects/deselects every displayed row. Default false. */
    selectable?: boolean;
    /** Where the checkbox column goes among the visible columns: 'start' (default), 'end', or a 0-based index. */
    selectionColumnPosition?: SelectionColumnPosition;
    /** Controlled selection: ids (value of each row's first column) of the selected rows. Leave undefined to let the table hold the selection itself. */
    selectedIds?: any[];
    /** Called on every selection change, with the selected ids and the matching rows (same shape as onRowClick). */
    onSelectionChange?: (ids: any[], rows: T[]) => void;
    /** Conditional formatting rules set by the app — the lowest-priority layer. */
    formattingRules?: FormattingRule[];
    /** Escape hatch for logic spanning several columns. Applied last, after every rule. */
    getRowFormatting?: GetRowFormatting<T>;
    getCellFormatting?: GetCellFormatting<T>;
    /** Show the toolbar and its formatting button (the end-user editor). Default false. */
    formattingEditor?: boolean;
    /** When set, the user's rules are saved to / reloaded from localStorage under this key. */
    formattingStorageKey?: string;
    /** Called on every change to the user's rules, so the host can persist them server-side. */
    onFormattingRulesChange?: (rules: FormattingRule[]) => void;
    /** Rehydrate the user's rules from your own backend — takes precedence over localStorage. */
    initialUserFormattingRules?: FormattingRule[];
    /** Label of the toolbar button. Default 'Mise en forme'. */
    formattingButtonLabel?: string;
}

export type UseDataTableResult<T extends Record<string, any>> = {
    items: T[];
    count: number;
    fieldsType: FieldTypeInfo[];
    paramFilter: ParamFilter[];
    loading: boolean;
    page: number;
    perPage: number;
    rowsPerPageOptions: number[];
    totalPages: number;
    sortColumn: string;
    sortDirection: SortDirection;
    filters: Record<string, unknown>;
    filterConfig: FilterConfig | null;
    serverFormattingRules: FormattingRule[];
    selectedIds: any[];
    selectedRows: T[];
    isRowSelected: (row: T) => boolean;
    toggleRowSelection: (row: T) => void;
    setRowSelected: (row: T, selected: boolean) => void;
    setAllRowsSelected: (selected: boolean) => void;
    clearSelection: () => void;
    toggleSort: (column: string, forceDirection?: SortDirection) => void;
    setColumnFilter: (key: string, value: unknown) => void;
    replaceFilters: (next: Record<string, unknown>) => void;
    clearFilter: (key: string) => void;
    clearAllFilters: () => void;
    changePerPage: (n: number) => void;
    goToPage: (p: number) => Promise<void>;
    nextPage: () => Promise<void>;
    previousPage: () => Promise<void>;
    firstPage: () => Promise<void>;
    lastPage: () => Promise<void>;
    refresh: () => Promise<void>;
};
