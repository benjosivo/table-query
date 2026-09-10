export interface PaginationProps {
    page: number;
    totalPages: number;
    perPage: number;
    count: number;
    rowsPerPageOptions?: number[];
    onChangePerPage?: (n: number) => void;
    onFirst: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onLast: () => void;
}

/**
 * Page controls + rows-per-page select + "x → y / total" counter.
 * Works with `useDataTable`'s return value, or with your own pagination state —
 * it only needs plain numbers and callbacks.
 */
export function Pagination({
    page,
    totalPages,
    perPage,
    count,
    rowsPerPageOptions = [10, 25, 50, 100, 250, 500, 1000],
    onChangePerPage,
    onFirst,
    onPrevious,
    onNext,
    onLast,
}: PaginationProps) {
    return (
        <div className="flex-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            {onChangePerPage && (
                <div className="divSelectRowPerPage flex-row" style={{ alignItems: 'center', gap: 1, display: totalPages <= 1 ? 'none' : 'flex' }}>
                    <select className="row-per-page" value={perPage} onChange={(e) => onChangePerPage(Number(e.target.value))}>
                        {rowsPerPageOptions.map((v) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                    <div>/page</div>
                </div>
            )}
            <span className="totalLinesTable">
                {(page - 1) * perPage + 1} &#10141; {Math.min(page * perPage, count)} / {count}
            </span>
            {totalPages > 1 && (
                <div className="pagination">
                    <button className="pagination-button" onClick={onFirst} disabled={page === 1}>
                        &#171;
                    </button>
                    <button className="pagination-button" onClick={onPrevious} disabled={page === 1}>
                        &#8249;
                    </button>
                    <span className="current-page">
                        Page {page}/{totalPages}
                    </span>
                    <button className="pagination-button" onClick={onNext} disabled={page === totalPages}>
                        &#8250;
                    </button>
                    <button className="pagination-button" onClick={onLast} disabled={page === totalPages}>
                        &#187;
                    </button>
                </div>
            )}
        </div>
    );
}
