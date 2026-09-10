import { useState } from 'react';
import type { DataTableProps } from './types.js';
import { useDataTable } from './useDataTable.js';
import { FilterModal } from './FilterModal.js';
import { FilterPanel } from './FilterPanel.js';
import { Table } from './Table.js';
import { Pagination } from './Pagination.js';

/**
 * Batteries-included table: sorting, per-column quick filter, optional advanced filter
 * panel, pagination and lazy-loaded image cells — all wired to `useDataTable` for you.
 *
 * If you want your own filter UI, don't use this component: compose `useDataTable` +
 * `Table` + `Pagination` directly instead (see README "Using the pieces separately").
 */
export function DataTable<T extends Record<string, any>>({
    fetchData,
    onRowClick,
    filterEnabled = true,
    sortingEnabled = true,
    advancedFilters = false,
    height = '76vh',
    rowsPerPageOptions,
    defaultRowsPerPage,
    onImagePreview,
    fetchFilterConfig,
}: DataTableProps<T>) {
    const table = useDataTable<T>({ fetchData, advancedFilters, rowsPerPageOptions, defaultRowsPerPage, fetchFilterConfig });
    const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
    const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

    const uniqueValuesFor = (column: string): string[] => {
        const values = table.items.map((row) => String(row[column] ?? ''));
        return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
    };

    return (
        <div className="flex-row nowrap" style={{ alignItems: 'flex-start', maxHeight: height }}>
            {advancedFilters && table.filterConfig && (
                <FilterPanel
                    filterConfig={table.filterConfig}
                    activeFilters={table.filters}
                    onChange={table.setColumnFilter}
                    onClearAll={table.clearAllFilters}
                />
            )}

            <div className="frame" style={{ maxHeight: '-webkit-fill-available', minWidth: '10vw' }}>
                <div style={{ maxHeight: '-webkit-fill-available', overflowY: 'auto', overflowX: 'auto' }}>
                    <Table
                        items={table.items}
                        fieldsType={table.fieldsType}
                        sortColumn={table.sortColumn}
                        sortDirection={table.sortDirection}
                        sortingEnabled={sortingEnabled}
                        onSort={(col) => table.toggleSort(col)}
                        onRowClick={onRowClick}
                        onImagePreview={onImagePreview}
                        renderHeaderExtra={
                            filterEnabled && !advancedFilters
                                ? (col) => (
                                      <button
                                          style={{ padding: 5, marginTop: 0 }}
                                          className="btnDataFilterTable"
                                          onClick={(e) => {
                                              setOpenFilterCol(col);
                                              setFilterAnchor(e.currentTarget);
                                          }}
                                      >
                                          &#128899;
                                      </button>
                                  )
                                : undefined
                        }
                    />
                </div>

                <Pagination
                    page={table.page}
                    totalPages={table.totalPages}
                    perPage={table.perPage}
                    count={table.count}
                    rowsPerPageOptions={table.rowsPerPageOptions}
                    onChangePerPage={table.changePerPage}
                    onFirst={table.firstPage}
                    onPrevious={table.previousPage}
                    onNext={table.nextPage}
                    onLast={table.lastPage}
                />
            </div>

            {openFilterCol && (
                <FilterModal
                    column={openFilterCol}
                    values={uniqueValuesFor(openFilterCol)}
                    anchorEl={filterAnchor}
                    onSort={(dir) => table.toggleSort(openFilterCol, dir)}
                    onApply={(selected) => table.setColumnFilter(openFilterCol, selected ?? undefined)}
                    onClose={() => setOpenFilterCol(null)}
                />
            )}

            {table.loading && <div className="table-loading-overlay">Chargement...</div>}
        </div>
    );
}
