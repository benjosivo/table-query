import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type {
    FieldTypeInfo,
    FormattingRule,
    GetCellFormatting,
    GetRowFormatting,
    ParamFilter,
    SelectionColumnPosition,
    SortDirection,
} from './types.js';
import { Cell } from './Cell.js';
import { computeTableFormatting } from './formatting.js';
import { columnNamesOf, getRowId, selectionKey } from './utils.js';

/** Stable identity so the formatting memo isn't invalidated on every render. */
const NO_RULES: FormattingRule[] = [];

export interface TableProps<T extends Record<string, any>> {
    items: T[];
    fieldsType?: FieldTypeInfo[];
    paramFilter?: ParamFilter[];
    sortColumn?: string;
    sortDirection?: SortDirection;
    /** Called with the column name when its header is clicked (only if sortingEnabled). */
    onSort?: (column: string) => void;
    sortingEnabled?: boolean;
    onRowClick?: (id: any, row: T) => void;
    onImagePreview?: (src: string) => void;
    /** Slot to render your own control in a column header (e.g. your own filter icon/input). Receives the column name. */
    renderHeaderExtra?: (column: string) => ReactNode;
    /** Add a checkbox column; the header checkbox selects/deselects every displayed row. */
    selectable?: boolean;
    /** Where the checkbox column goes among the visible columns: 'start' (default), 'end', or a 0-based index. */
    selectionColumnPosition?: SelectionColumnPosition;
    /** Ids (value of each row's first column) of the currently selected rows. */
    selectedIds?: any[];
    /** Called when a row checkbox is toggled. */
    onToggleRow?: (row: T, selected: boolean) => void;
    /** Called when the header checkbox is toggled; applies to every displayed row. */
    onToggleAllRows?: (selected: boolean) => void;
    /** Labels for the checkboxes (accessibility). */
    selectAllLabel?: string;
    selectRowLabel?: string;
    /** Conditional formatting rules, already merged and ordered (see useFormattingRules). */
    formattingRules?: FormattingRule[];
    /** Escape hatch for logic spanning several columns. Applied after every rule.
     *  Wrap these in useCallback, or the formatting memo recomputes on each render. */
    getRowFormatting?: GetRowFormatting<T>;
    getCellFormatting?: GetCellFormatting<T>;
}

/**
 * Just the `<table>` — header, sorting, rows, cell formatting (dates, JSON, lazy images),
 * optional checkbox column.
 * No filter UI, no pagination: bring your own and drive `items`/`fieldsType` yourself
 * (e.g. from `useDataTable`, or from any other data source).
 */
export function Table<T extends Record<string, any>>({
    items,
    fieldsType = [],
    paramFilter,
    sortColumn,
    sortDirection,
    onSort,
    sortingEnabled = true,
    onRowClick,
    onImagePreview,
    renderHeaderExtra,
    selectable = false,
    selectionColumnPosition = 'start',
    selectedIds,
    onToggleRow,
    onToggleAllRows,
    selectAllLabel = 'Tout sélectionner',
    selectRowLabel = 'Sélectionner la ligne',
    formattingRules,
    getRowFormatting,
    getCellFormatting,
}: TableProps<T>) {
    const columns = useMemo(() => columnNamesOf(items, paramFilter), [items, paramFilter]);

    /** Columns actually rendered, keeping their original index (fieldsType/paramFilter are indexed on it). */
    const visibleColumns = useMemo(
        () => columns.map((col, index) => ({ col, index })).filter(({ index }) => paramFilter?.[index]?.type.trim() !== 'HIDE'),
        [columns, paramFilter],
    );

    /**
     * Computed for the whole page at once rather than inside the render loop: Table re-renders
     * on every checkbox toggle and every filter popover open, and re-evaluating N rules over up
     * to 1000 rows on each of those is wasteful. `items` gets a fresh identity on every load(),
     * so invalidation is automatic. Returns null when there is nothing to format.
     */
    const formatting = useMemo(
        () => computeTableFormatting(items, formattingRules ?? NO_RULES, columns, { getRowFormatting, getCellFormatting }),
        [items, formattingRules, columns, getRowFormatting, getCellFormatting],
    );

    const selectedKeys = useMemo(() => new Set((selectedIds ?? []).map(selectionKey)), [selectedIds]);
    const displayedCount = items.length;
    const selectedOnPage = useMemo(() => items.filter((row) => selectedKeys.has(selectionKey(getRowId(row)))).length, [items, selectedKeys]);
    const allDisplayedSelected = displayedCount > 0 && selectedOnPage === displayedCount;
    const someDisplayedSelected = selectedOnPage > 0 && !allDisplayedSelected;

    /** -1 when there is no checkbox column, otherwise its slot among the visible columns. */
    const selectionIndex = useMemo(() => {
        if (!selectable) return -1;
        if (selectionColumnPosition === 'end') return visibleColumns.length;
        if (typeof selectionColumnPosition === 'number') return Math.min(Math.max(0, Math.trunc(selectionColumnPosition)), visibleColumns.length);
        return 0;
    }, [selectable, selectionColumnPosition, visibleColumns.length]);

    const withSelectionCell = (cells: ReactNode[], selectionCell: ReactNode): ReactNode[] => {
        if (selectionIndex < 0) return cells;
        const next = [...cells];
        next.splice(selectionIndex, 0, selectionCell);
        return next;
    };

    const headerCells = visibleColumns.map(({ col }) => (
        <th key={col} data-sort={col}>
            <div className='flex-row nowrap' style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div
                    className='flex-row nowrap clickOnSort'
                    style={{ cursor: sortingEnabled ? 'pointer' : 'default' }}
                    onClick={() => sortingEnabled && onSort?.(col)}
                >
                    <span translate='yes'>{col}</span>
                    {sortingEnabled && (
                        <span className='sort-icon'>{sortColumn === col ? (sortDirection === 'ASC' ? '\u2B06' : '\u2B07') : '\u2B07\u2B06'}</span>
                    )}
                </div>
                {renderHeaderExtra?.(col)}
            </div>
        </th>
    ));

    const headerSelectionCell = (
        <th key='__selection__' className='selectionColumn' style={{ width: '1%' }}>
            <SelectionCheckbox
                checked={allDisplayedSelected}
                indeterminate={someDisplayedSelected}
                disabled={displayedCount === 0}
                label={selectAllLabel}
                onChange={(checked) => onToggleAllRows?.(checked)}
            />
        </th>
    );

    return (
        <table>
            <thead className='tableHeader'>
                <tr>{withSelectionCell(headerCells, headerSelectionCell)}</tr>
            </thead>
            <tbody style={{ maxHeight: 'stretch', maxWidth: 'stretch', overflow: 'auto' }}>
                {items.length === 0 && (
                    <tr>
                        <td colSpan={100}>No data found</td>
                    </tr>
                )}
                {items.map((row, i) => {
                    const id = getRowId(row);
                    const fmt = formatting?.[i];
                    const cells = visibleColumns.map(({ col, index }) => {
                        const cf = fmt?.cellStyles[col];
                        return (
                            <td key={col} className={cf?.className} style={cf?.style}>
                                <Cell value={row[col]} fieldType={fieldsType[index]?.fieldType} onImagePreview={onImagePreview} />
                            </td>
                        );
                    });
                    const selectionCell = (
                        <td key='__selection__' className='selectionColumn' onClick={(e) => e.stopPropagation()}>
                            <SelectionCheckbox
                                checked={selectedKeys.has(selectionKey(id))}
                                label={selectRowLabel}
                                onChange={(checked) => onToggleRow?.(row, checked)}
                            />
                        </td>
                    );
                    return (
                        <tr
                            key={id !== undefined ? String(id) : i}
                            className={fmt?.rowClassName}
                            style={{ cursor: onRowClick ? 'pointer' : 'default', ...fmt?.rowStyle }}
                            onClick={() => id !== undefined && onRowClick?.(id, row)}
                        >
                            {withSelectionCell(cells, selectionCell)}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function SelectionCheckbox({
    checked,
    indeterminate = false,
    disabled = false,
    label,
    onChange,
}: {
    checked: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);

    // `indeterminate` only exists on the DOM node, not as an attribute.
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = indeterminate && !checked;
    }, [indeterminate, checked]);

    return (
        <input
            ref={ref}
            type='checkbox'
            className='selectionCheckbox'
            checked={checked}
            disabled={disabled}
            aria-label={label}
            title={label}
            style={{ cursor: disabled ? 'default' : 'pointer', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange(e.target.checked)}
        />
    );
}
