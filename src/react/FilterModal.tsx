import { useEffect, useMemo, useRef, useState } from 'react';
import type { SortDirection } from './types.js';

interface FilterModalProps {
    column: string;
    /** Unique values found in the currently loaded rows for this column. */
    values: string[];
    anchorEl: HTMLElement | null;
    onSort: (direction: SortDirection) => void;
    onApply: (selected: string[] | null) => void; // null = "clear filter"
    onClose: () => void;
}

/**
 * Quick filter popover shown when clicking the magnifier button in a column header.
 * Mirrors the original modal: sort shortcuts + a searchable checkbox list of values
 * seen on the current page (this is inherently page-scoped, same as the source code —
 * pair it with the advanced FilterPanel for filters over the full dataset).
 */
export function FilterModal({ column, values, anchorEl, onSort, onApply, onClose }: FilterModalProps) {
    const [search, setSearch] = useState('');
    const [checked, setChecked] = useState<Set<string>>(new Set(values));
    const modalRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

    useEffect(() => setChecked(new Set(values)), [values]);

    useEffect(() => {
        if (!anchorEl || !modalRef.current) return;
        const modalRect = modalRef.current.getBoundingClientRect();
        const triggerRect = anchorEl.getBoundingClientRect();
        const left = Math.max(0, triggerRect.left - modalRect.width + triggerRect.width);
        const top = Math.min(window.scrollY + window.innerHeight - modalRect.height, triggerRect.bottom + 5 + window.scrollY);
        setStyle({ position: 'absolute', top, left, zIndex: 1000 });
    }, [anchorEl, values]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node) && e.target !== anchorEl) onClose();
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [anchorEl, onClose]);

    const visibleValues = useMemo(
        () => ['Vide', ...values.filter((v) => v !== 'Vide' && v.toLowerCase().includes(search.toLowerCase()))],
        [values, search],
    );

    const allChecked = visibleValues.every((v) => checked.has(v));

    const toggleAll = (next: boolean) => {
        setChecked((prev) => {
            const copy = new Set(prev);
            visibleValues.forEach((v) => (next ? copy.add(v) : copy.delete(v)));
            return copy;
        });
    };

    const toggleOne = (v: string) => {
        setChecked((prev) => {
            const copy = new Set(prev);
            copy.has(v) ? copy.delete(v) : copy.add(v);
            return copy;
        });
    };

    return (
        <div ref={modalRef} className="modal flex-column" style={{ minWidth: '5em', ...style }}>
            <div className="frame">
                <button
                    onClick={() => {
                        onSort('ASC');
                        onClose();
                    }}
                >
                    Sort A to Z
                </button>
                <button
                    onClick={() => {
                        onSort('DESC');
                        onClose();
                    }}
                >
                    Sort Z to A
                </button>
            </div>
            <div className="frame" style={{ maxWidth: '33vh', minWidth: 100 }}>
                <button
                    onClick={() => {
                        onApply(null);
                        onClose();
                    }}
                >
                    Clear Filter
                </button>
                <input type="text" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="frame" style={{ maxHeight: '20vh', overflowY: 'auto', overflowX: 'hidden', gap: 5 }}>
                    <div className="flex-row nowrap" style={{ alignItems: 'center' }}>
                        <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
                        <label style={{ width: '100%' }}>Tout Sélectionner</label>
                    </div>
                    {visibleValues.map((v) => (
                        <div key={v || '(empty)'} className="flex-row nowrap" style={{ alignItems: 'center' }}>
                            <input type="checkbox" checked={checked.has(v)} onChange={() => toggleOne(v)} />
                            <label style={{ width: '100%' }}>{v === 'Vide' ? 'Vide' : v}</label>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-row">
                <button
                    onClick={() => {
                        onApply(Array.from(checked));
                        onClose();
                    }}
                >
                    OK
                </button>
                <button onClick={onClose}>Annuler</button>
            </div>
        </div>
    );
}
