import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { FieldTypeInfo, SortDirection } from './types.js';
import { Cell } from './Cell.js';

export interface TableProps<T extends Record<string, any>> {
    items: T[];
    fieldsType?: FieldTypeInfo[];
    sortColumn?: string;
    sortDirection?: SortDirection;
    /** Called with the column name when its header is clicked (only if sortingEnabled). */
    onSort?: (column: string) => void;
    sortingEnabled?: boolean;
    onRowClick?: (id: any, row: T) => void;
    onImagePreview?: (src: string) => void;
    /** Slot to render your own control in a column header (e.g. your own filter icon/input). Receives the column name. */
    renderHeaderExtra?: (column: string) => ReactNode;
}

/**
 * Just the `<table>` — header, sorting, rows, cell formatting (dates, JSON, lazy images).
 * No filter UI, no pagination: bring your own and drive `items`/`fieldsType` yourself
 * (e.g. from `useDataTable`, or from any other data source).
 */
export function Table<T extends Record<string, any>>({
    items,
    fieldsType = [],
    sortColumn,
    sortDirection,
    onSort,
    sortingEnabled = true,
    onRowClick,
    onImagePreview,
    renderHeaderExtra,
}: TableProps<T>) {
    const columns = useMemo(() => (items[0] ? Object.keys(items[0]).slice(1) : []), [items]);
    const idKey = items[0] ? Object.keys(items[0])[0] : null;

    return (
        <table>
            <thead className="tableHeader">
                <tr>
                    {columns.map((col) => (
                        <th key={col} data-sort={col}>
                            <div className="flex-row nowrap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <div
                                    className="flex-row nowrap clickOnSort"
                                    style={{ cursor: sortingEnabled ? 'pointer' : 'default' }}
                                    onClick={() => sortingEnabled && onSort?.(col)}
                                >
                                    <span translate="yes">{col}</span>
                                    {sortingEnabled && (
                                        <span className="sort-icon">
                                            {sortColumn === col ? (sortDirection === 'ASC' ? '\u2B06' : '\u2B07') : '\u2B07\u2B06'}
                                        </span>
                                    )}
                                </div>
                                {renderHeaderExtra?.(col)}
                            </div>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {items.map((row, i) => (
                    <tr
                        key={idKey ? String(row[idKey]) : i}
                        style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                        onClick={() => idKey && onRowClick?.(row[idKey], row)}
                    >
                        {columns.map((col, colIdx) => (
                            <td key={col}>
                                <Cell value={row[col]} fieldType={fieldsType[colIdx + 1]?.fieldType} onImagePreview={onImagePreview} />
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
