import { useMemo, useState } from 'react';
import type { FilterConfig } from './types.js';

interface FilterPanelProps {
    filterConfig: FilterConfig;
    activeFilters: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    onClearAll: () => void;
}

export function FilterPanel({ filterConfig, activeFilters, onChange, onClearAll }: FilterPanelProps) {
    const [open, setOpen] = useState(false);
    const hasActive = Object.keys(activeFilters).length > 0;

    return (
        <div className='flex-column nowrap' style={{ height: '-webkit-fill-available' }}>
            <button style={{ maxWidth: '18rem' }} onClick={() => setOpen((o) => !o)}>
                Filtres
            </button>
            {open && (
                <div className='responsive-panel frame nowrap active' style={{ minWidth: 'min-content' }}>
                    {hasActive && <button onClick={onClearAll}>Réinitialiser les filtres</button>}
                    {Object.entries(filterConfig).map(([key, info]) => {
                        if (!info.type || info.type === 'HIDE') return null;
                        return (
                            <div key={key} className='flex-column frame'>
                                <span>{key}</span>
                                {activeFilters[key] !== undefined && (
                                    <button onClick={() => onChange(key, undefined)}>Réinitialiser le filtre</button>
                                )}
                                <div className='filterOption' style={{ maxWidth: '-webkit-fill-available' }}>
                                    {['MULTISELECT', 'UNGROUP_MULTISELECT'].includes(info.type) && (
                                        <MultiSelectFilter
                                            filterKey={key}
                                            values={info.values as string[]}
                                            ungroup={info.type === 'UNGROUP_MULTISELECT'}
                                            active={activeFilters[key] as string[] | undefined}
                                            onApply={(vals) => onChange(key, vals.length ? vals : undefined)}
                                        />
                                    )}
                                    {info.type === 'SLIDER' && (
                                        <SliderFilter values={info.values as [number, number]} onApply={(min, max) => onChange(key, { min, max })} />
                                    )}
                                    {['DATE', 'DATETIME'].includes(info.type) && (
                                        <DateFilter
                                            type={info.type as 'DATE' | 'DATETIME'}
                                            values={info.values as [string, string]}
                                            onApply={(min, max) => onChange(key, { min, max, date: true })}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ==================== MULTISELECT ====================

function MultiSelectFilter({
    values,
    active,
    ungroup,
    onApply,
}: {
    filterKey: string;
    values: string[];
    ungroup: boolean;
    active?: string[];
    onApply: (values: string[]) => void;
}) {
    const [search, setSearch] = useState('');
    // null = "everything selected" (no filter applied yet)
    const [selected, setSelected] = useState<string[] | null>(active ?? null);

    const items = useMemo(() => {
        const base = search ? values.filter((v) => v.toLowerCase().includes(search.toLowerCase())).slice(0, 400) : values.slice(0, 400);
        const withActive = selected ? Array.from(new Set([...base, ...selected])) : base;
        return ['Vide', ...withActive.filter((v) => v !== 'Vide')];
    }, [values, search, selected]);

    const allChecked = selected === null || items.every((v) => selected.includes(v));
    const someChecked = selected !== null && items.some((v) => selected.includes(v));

    const toggleAll = (checked: boolean) => setSelected(checked ? (search ? [...items] : null) : []);

    const toggleOne = (val: string) => {
        setSelected((prev) => {
            const base = prev === null ? [...items] : prev;
            const next = base.includes(val) ? base.filter((v) => v !== val) : [...base, val];
            return !search && next.length === items.length ? null : next;
        });
    };

    const apply = () => {
        const toSend = (selected ?? items).map((v) => (v === 'Vide' || v === 'Non Vide' ? v : ungroup ? `/*/${v}/*/` : v));
        onApply(selected === null ? [] : toSend);
    };

    return (
        <div className='predefinedInfos frame'>
            <div className='input-field'>
                <input type='text' placeholder='Rechercher' autoComplete='off' value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className='selectAllRow flex-row nowrap' style={{ padding: '4px 0', borderBottom: '1px solid #ccc' }}>
                <input
                    type='checkbox'
                    checked={allChecked}
                    ref={(el: any) => el && (el.indeterminate = !allChecked && someChecked)}
                    onChange={(e) => toggleAll(e.target.checked)}
                />
                <label style={{ fontWeight: 'bold' }}>(Sélectionner tout)</label>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '20vh', maxWidth: '25rem' }} className='listPredefinedInfos flex-column nowrap'>
                {items.map((val) => (
                    <div key={val || '(empty)'} className='flex-row nowrap'>
                        <input type='checkbox' checked={selected === null || selected.includes(val)} onChange={() => toggleOne(val)} />
                        <label style={{ cursor: 'pointer' }} onClick={() => toggleOne(val)}>
                            {val}
                        </label>
                    </div>
                ))}
            </div>
            <button className='btn-accent' onClick={apply}>
                Appliquer
            </button>
        </div>
    );
}

// ==================== SLIDER (min/max range, no external dependency) ====================

function SliderFilter({ values, onApply }: { values: [number, number]; onApply: (min: number, max: number) => void }) {
    const [min, setMin] = useState(values[0]);
    const [max, setMax] = useState(values[1]);

    const commit = (nextMin: number, nextMax: number) => {
        setMin(nextMin);
        setMax(nextMax);
        onApply(nextMin, nextMax);
    };

    return (
        <div style={{ padding: '0 1rem 1rem 0' }}>
            <div className='flex-row nowrap' style={{ justifyContent: 'space-between' }}>
                <input
                    type='number'
                    className='inputSlider'
                    value={min}
                    min={values[0]}
                    max={max}
                    onChange={(e) => commit(Number(e.target.value), max)}
                />
                <input
                    type='number'
                    className='inputSlider'
                    value={max}
                    min={min}
                    max={values[1]}
                    onChange={(e) => commit(min, Number(e.target.value))}
                />
            </div>
            <input type='range' min={values[0]} max={values[1]} value={min} onChange={(e) => commit(Number(e.target.value), max)} />
            <input type='range' min={values[0]} max={values[1]} value={max} onChange={(e) => commit(min, Number(e.target.value))} />
        </div>
    );
}

// ==================== DATE RANGE ====================

function DateFilter({ type, values, onApply }: { type: 'DATE' | 'DATETIME'; values: [string, string]; onApply: (min: Date, max: Date) => void }) {
    const inputType = type === 'DATE' ? 'date' : 'datetime-local';
    const fmt = (d: string) => {
        const dt = new Date(d);
        const iso = dt.toISOString().slice(0, -1);
        return type === 'DATE' ? iso.split('T')[0] : iso.slice(0, 16);
    };

    const [min, setMin] = useState(fmt(values[0]));
    const [max, setMax] = useState(fmt(values[1]));

    const canApply = Boolean(min && max);

    const apply = () => {
        const maxDate = new Date(max);
        if (type === 'DATE') maxDate.setDate(maxDate.getDate() + 1);
        onApply(new Date(min), maxDate);
    };

    return (
        <div className='flex-column nowrap'>
            <div className='flex-row nowrap' style={{ justifyContent: 'space-between' }}>
                <input type={inputType} value={min} min={fmt(values[0])} max={fmt(values[1])} onChange={(e) => setMin(e.target.value)} />
                <input type={inputType} value={max} min={fmt(values[0])} max={fmt(values[1])} onChange={(e) => setMax(e.target.value)} />
            </div>
            {canApply && (
                <button className='btn-accent' onClick={apply}>
                    Appliquer
                </button>
            )}
        </div>
    );
}
