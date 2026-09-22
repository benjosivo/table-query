import { useEffect, useMemo, useRef, useState } from 'react';
import type { FieldTypeInfo, FormattingCondition, FormattingRule, FormattingTarget, FormattingValueType, ParamFilter } from './types.js';
import type { UseFormattingRulesResult } from './useFormattingRules.js';
import { FORMATTING_OPERATORS, describeRule, editorStateToStyle, newRuleId, operatorArity, styleToEditorState } from './formatting.js';

export interface FormattingModalProps extends UseFormattingRulesResult {
    /** Every column of the table, hidden ones included. */
    columns: string[];
    fieldsType?: FieldTypeInfo[];
    paramFilter?: ParamFilter[];
    anchorEl: HTMLElement | null;
    onClose: () => void;
}

/**
 * The end-user editor for conditional formatting rules: list on top, one rule form below.
 * Shares FilterModal's popover mechanics (anchored positioning, outside-click dismissal)
 * and the same unstyled class hooks, so a host stylesheet themes both at once.
 */
export function FormattingModal({
    columns,
    fieldsType,
    paramFilter,
    anchorEl,
    onClose,
    rules,
    userRules,
    inherited,
    disabledIds,
    addRule,
    updateRule,
    removeRule,
    moveRule,
    setRuleDisabled,
    resetUserRules,
}: FormattingModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>();
    const [editingId, setEditingId] = useState<string | null>(null);

    const hiddenColumns = useMemo(() => {
        const set = new Set<string>();
        columns.forEach((col, i) => {
            if (paramFilter?.[i]?.type?.trim() === 'HIDE') set.add(col);
        });
        return set;
    }, [columns, paramFilter]);

    // Same anchoring maths as FilterModal, but also clamped to a minimum `top` and given an
    // internal scroll (below) — this modal has more sections than FilterModal and can end up
    // taller than the viewport, which would otherwise push `top` negative and hide the bottom
    // action buttons off-screen.
    // useEffect(() => {
    //     if (!anchorEl || !modalRef.current) return;
    //     const modalRect = modalRef.current.getBoundingClientRect();
    //     const triggerRect = anchorEl.getBoundingClientRect();
    //     const margin = 8;
    //     const left = Math.max(0, triggerRect.left - modalRect.width + triggerRect.width);
    //     const maxTop = window.innerHeight - modalRect.height - margin;
    //     const top = Math.max(margin, triggerRect.bottom);
    //     setStyle({ position: 'absolute', top, left, zIndex: 1000 });
    // }, [anchorEl, editingId, userRules.length, inherited.length]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node) && e.target !== anchorEl) onClose();
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [anchorEl, onClose]);

    const editing = userRules.find((r) => r.id === editingId) ?? null;
    const noColumns = columns.length === 0;

    const startNewRule = () => {
        const rule: FormattingRule = {
            id: newRuleId(),
            column: columns[0] ?? '',
            operator: '=',
            value: '',
            valueType: 'auto',
            target: 'row',
            style: { backgroundColor: '#ffe08a' },
            enabled: true,
        };
        addRule(rule);
        setEditingId(rule.id!);
    };

    return (
        <div className='modal-container'>
            <div ref={modalRef} className='modal flex-column' style={{ ...style }}>
                <div className='flex-column nowrap'>
                    <div className='frame'>
                        <strong>Mise en forme conditionnelle</strong>
                        <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                            {rules.length} règle{rules.length > 1 ? 's' : ''} active{rules.length > 1 ? 's' : ''}
                        </span>
                    </div>

                    {inherited.length > 0 && (
                        <div className='frame flex-column' style={{ maxHeight: 'stretch', overflowY: 'auto' }}>
                            <span style={{ fontWeight: 'bold' }}>Règles de l'application</span>
                            {inherited.map((rule) => (
                                <div key={rule.id} className='flex-row nowrap' style={{ alignItems: 'center', gap: 6, opacity: 0.85 }}>
                                    <input
                                        type='checkbox'
                                        checked={!disabledIds.includes(rule.id!)}
                                        onChange={(e) => setRuleDisabled(rule.id!, !e.target.checked)}
                                        title='Activer / désactiver'
                                    />
                                    <StyleSwatch rule={rule} />
                                    <span style={{ width: '100%' }}>{rule.label || describeRule(rule)}</span>
                                </div>
                            ))}
                            <span style={{ opacity: 0.6, fontSize: '0.8em' }}>Ces règles ne sont pas modifiables ici.</span>
                        </div>
                    )}

                    <div className='frame flex-column' style={{ maxHeight: 'stretch', overflowY: 'auto' }}>
                        <span style={{ fontWeight: 'bold' }}>Mes règles</span>
                        {userRules.length === 0 && <span style={{ opacity: 0.6 }}>Aucune règle pour l'instant.</span>}
                        {userRules.map((rule, i) => (
                            <div
                                key={rule.id}
                                className='flex-row nowrap'
                                style={{ alignItems: 'center', gap: 4, backgroundColor: `${editingId === rule.id ? 'var(--clr-hover))' : ''}` }}
                            >
                                <input
                                    type='checkbox'
                                    checked={rule.enabled !== false}
                                    onChange={(e) => updateRule(rule.id!, { enabled: e.target.checked })}
                                    title='Activer / désactiver'
                                />
                                <button onClick={() => moveRule(rule.id!, -1)} disabled={i === 0} title='Monter (priorité plus faible)'>
                                    &#8593;
                                </button>
                                <button
                                    onClick={() => moveRule(rule.id!, 1)}
                                    disabled={i === userRules.length - 1}
                                    title='Descendre (priorité plus forte)'
                                >
                                    &#8595;
                                </button>
                                <StyleSwatch rule={rule} />
                                <span style={{ width: '100%', cursor: 'pointer' }} onClick={() => setEditingId(rule.id!)}>
                                    {rule.label || describeRule(rule)}
                                </span>
                                <button onClick={() => setEditingId(editingId === rule.id ? null : rule.id!)}>Éditer</button>
                                <button
                                    onClick={() => {
                                        if (editingId === rule.id) setEditingId(null);
                                        removeRule(rule.id!);
                                    }}
                                    title='Supprimer'
                                >
                                    &#10005;
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className='flex-row'>
                        <button className='btn-accent' onClick={startNewRule} disabled={noColumns}>
                            Ajouter une règle
                        </button>
                        <button
                            onClick={() => {
                                setEditingId(null);
                                resetUserRules();
                            }}
                            disabled={userRules.length === 0 && disabledIds.length === 0}
                        >
                            Réinitialiser
                        </button>
                        <button onClick={onClose}>Fermer</button>
                    </div>
                </div>
                {editing && (
                    <RuleEditor
                        rule={editing}
                        columns={columns}
                        hiddenColumns={hiddenColumns}
                        fieldsType={fieldsType}
                        onChange={(patch) => updateRule(editing.id!, patch)}
                        onDone={() => setEditingId(null)}
                    />
                )}

                {noColumns && <span style={{ opacity: 0.6 }}>Aucune colonne chargée.</span>}
            </div>
        </div>
    );
}

function StyleSwatch({ rule }: { rule: FormattingRule }) {
    const s = rule.style ?? {};
    return (
        <span
            aria-hidden='true'
            style={{
                display: 'inline-block',
                width: '1.1em',
                height: '1.1em',
                flex: '0 0 auto',
                border: '1px solid rgba(0,0,0,0.3)',
                backgroundColor: (s.backgroundColor as string) ?? 'transparent',
                color: (s.color as string) ?? 'inherit',
                fontWeight: s.fontWeight as any,
                fontStyle: s.fontStyle as any,
                textAlign: 'center',
                lineHeight: '1.1em',
                fontSize: '0.8em',
            }}
        >
            A
        </span>
    );
}

// ==================== RULE EDITOR ====================

/** The operand input type follows the column's SQL type, so date rules get a date picker. */
function inputTypeFor(fieldType: string | undefined): string {
    const t = (fieldType ?? '').trim().toUpperCase();
    if (t === 'DATE') return 'date';
    if (t === 'DATETIME' || t === 'TIMESTAMP') return 'datetime-local';
    return 'text';
}

/** Column + operator + operand(s) + comparison type for one condition — shared by the primary condition and every extra one. */
function ConditionFields({
    condition,
    columns,
    hiddenColumns,
    fieldsType,
    onChange,
}: {
    condition: FormattingCondition;
    columns: string[];
    hiddenColumns: Set<string>;
    fieldsType?: FieldTypeInfo[];
    onChange: (patch: Partial<FormattingCondition>) => void;
}) {
    const arity = operatorArity(condition.operator);
    const columnIndex = columns.indexOf(condition.column);
    const inputType = inputTypeFor(fieldsType?.[columnIndex]?.fieldType);
    const pair = Array.isArray(condition.value) ? condition.value : [undefined, undefined];

    return (
        <>
            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Colonne</span>
                <select value={condition.column} onChange={(e) => onChange({ column: e.target.value })} style={{ width: '100%' }}>
                    {/* A stored column that no longer exists is kept so editing doesn't silently rewrite it. */}
                    {!columns.includes(condition.column) && <option value={condition.column}>{condition.column} (inconnue)</option>}
                    {columns.map((col) => (
                        <option key={col} value={col}>
                            {col}
                            {hiddenColumns.has(col) ? ' (masquée)' : ''}
                        </option>
                    ))}
                </select>
            </label>

            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Opérateur</span>
                <select
                    value={condition.operator}
                    onChange={(e) => onChange({ operator: e.target.value as FormattingCondition['operator'], value: '' })}
                    style={{ width: '100%' }}
                >
                    {FORMATTING_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                            {op.label}
                        </option>
                    ))}
                </select>
            </label>

            {arity === 1 && (
                <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                    <span style={{ minWidth: '7em' }}>Valeur</span>
                    <input
                        type={inputType}
                        value={String(condition.value ?? '')}
                        onChange={(e) => onChange({ value: e.target.value })}
                        style={{ width: '100%' }}
                    />
                </label>
            )}

            {arity === 2 && (
                <div className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                    <span style={{ minWidth: '7em' }}>Entre</span>
                    <input
                        type={inputType}
                        value={String(pair[0] ?? '')}
                        placeholder='Min'
                        onChange={(e) => onChange({ value: [e.target.value, pair[1] ?? ''] })}
                    />
                    <input
                        type={inputType}
                        value={String(pair[1] ?? '')}
                        placeholder='Max'
                        onChange={(e) => onChange({ value: [pair[0] ?? '', e.target.value] })}
                    />
                </div>
            )}

            {arity === 'n' && (
                <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                    <span style={{ minWidth: '7em' }}>Valeurs</span>
                    <input
                        type='text'
                        value={Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value ?? '')}
                        placeholder='séparées par des virgules'
                        onChange={(e) => onChange({ value: e.target.value })}
                        style={{ width: '100%' }}
                    />
                </label>
            )}

            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Comparer comme</span>
                <select
                    value={condition.valueType ?? 'auto'}
                    onChange={(e) => onChange({ valueType: e.target.value as FormattingValueType })}
                    style={{ width: '100%' }}
                >
                    <option value='auto'>Automatique</option>
                    <option value='string'>Texte</option>
                    <option value='number'>Nombre</option>
                    <option value='date'>Date</option>
                    <option value='boolean'>Booléen</option>
                </select>
            </label>
        </>
    );
}

function RuleEditor({
    rule,
    columns,
    hiddenColumns,
    fieldsType,
    onChange,
    onDone,
}: {
    rule: FormattingRule;
    columns: string[];
    hiddenColumns: Set<string>;
    fieldsType?: FieldTypeInfo[];
    onChange: (patch: Partial<FormattingRule>) => void;
    onDone: () => void;
}) {
    const styleState = styleToEditorState(rule.style);

    const setStyle = (patch: Partial<ReturnType<typeof styleToEditorState>>) => onChange({ style: editorStateToStyle({ ...styleState, ...patch }) });

    const targetMode: 'row' | 'cell' | 'columns' = Array.isArray(rule.target) ? 'columns' : rule.target === 'cell' ? 'cell' : 'row';

    const conditions = rule.conditions ?? [];
    const updateCondition = (i: number, patch: Partial<FormattingCondition>) =>
        onChange({ conditions: conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
    const removeCondition = (i: number) => onChange({ conditions: conditions.filter((_, idx) => idx !== i) });
    const addCondition = () => onChange({ conditions: [...conditions, { column: columns[0] ?? '', operator: '=', value: '' }] });

    return (
        <div className='frame flex-column' style={{ gap: 6 }}>
            <span style={{ fontWeight: 'bold' }}>Modifier la règle</span>

            <ConditionFields condition={rule} columns={columns} hiddenColumns={hiddenColumns} fieldsType={fieldsType} onChange={onChange} />

            {conditions.length > 0 && (
                <label className='flex-row' style={{ alignItems: 'center', gap: 6 }}>
                    <span style={{ minWidth: '7em' }}>Combiner avec</span>
                    <select
                        value={rule.conditionLogic ?? 'AND'}
                        onChange={(e) => onChange({ conditionLogic: e.target.value as 'AND' | 'OR' })}
                        style={{ width: '100%' }}
                    >
                        <option value='AND'>ET (toutes les conditions)</option>
                        <option value='OR'>OU (au moins une condition)</option>
                    </select>
                </label>
            )}

            {conditions.map((condition, i) => (
                <div key={i} className='frame flex-column' style={{ gap: 6 }}>
                    <div className='flex-row nowrap' style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ opacity: 0.7, fontSize: '0.85em' }}>Condition supplémentaire</span>
                        <button onClick={() => removeCondition(i)} title='Retirer cette condition'>
                            &#10005;
                        </button>
                    </div>
                    <ConditionFields
                        condition={condition}
                        columns={columns}
                        hiddenColumns={hiddenColumns}
                        fieldsType={fieldsType}
                        onChange={(patch) => updateCondition(i, patch)}
                    />
                </div>
            ))}

            <button onClick={addCondition} disabled={columns.length === 0}>
                + Ajouter une condition
            </button>

            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Appliquer à</span>
                <select
                    value={targetMode}
                    onChange={(e) => {
                        const mode = e.target.value as 'row' | 'cell' | 'columns';
                        onChange({ target: (mode === 'columns' ? [rule.column] : mode) as FormattingTarget });
                    }}
                    style={{ width: '100%' }}
                >
                    <option value='row'>Toute la ligne</option>
                    <option value='cell'>Cette cellule</option>
                    <option value='columns'>Colonnes choisies…</option>
                </select>
            </label>

            {targetMode === 'columns' && (
                <div className='frame flex-column' style={{ maxHeight: 'stretch', overflowY: 'auto' }}>
                    {columns.map((col) => {
                        const list = (rule.target as string[]) ?? [];
                        return (
                            <label key={col} className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                                <input
                                    type='checkbox'
                                    checked={list.includes(col)}
                                    onChange={(e) => onChange({ target: e.target.checked ? [...list, col] : list.filter((c) => c !== col) })}
                                />
                                <span>
                                    {col}
                                    {hiddenColumns.has(col) ? ' (masquée)' : ''}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}

            <div className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Fond</span>
                {/* type=color has no empty state, so clearing needs its own control. */}
                <input
                    type='checkbox'
                    checked={!!styleState.background}
                    onChange={(e) => setStyle({ background: e.target.checked ? '#ffe08a' : undefined })}
                />
                <input
                    type='color'
                    value={styleState.background ?? '#ffe08a'}
                    disabled={!styleState.background}
                    onChange={(e) => setStyle({ background: e.target.value })}
                />
                <span style={{ minWidth: '4em' }}>Texte</span>
                <input type='checkbox' checked={!!styleState.color} onChange={(e) => setStyle({ color: e.target.checked ? '#000000' : undefined })} />
                <input
                    type='color'
                    value={styleState.color ?? '#000000'}
                    disabled={!styleState.color}
                    onChange={(e) => setStyle({ color: e.target.value })}
                />
            </div>

            <div className='flex-row nowrap' style={{ alignItems: 'center', gap: 10 }}>
                <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 4 }}>
                    <input type='checkbox' checked={styleState.bold} onChange={(e) => setStyle({ bold: e.target.checked })} />
                    <span>Gras</span>
                </label>
                <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 4 }}>
                    <input type='checkbox' checked={styleState.italic} onChange={(e) => setStyle({ italic: e.target.checked })} />
                    <span>Italique</span>
                </label>
                <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 4 }}>
                    <input type='checkbox' checked={!!rule.stopIfTrue} onChange={(e) => onChange({ stopIfTrue: e.target.checked })} />
                    <span title="Les règles suivantes ne s'appliqueront plus à ce que celle-ci a coloré">Arrêter si vrai</span>
                </label>
            </div>

            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Classe CSS</span>
                <input
                    type='text'
                    value={rule.className ?? ''}
                    placeholder='optionnel'
                    onChange={(e) => onChange({ className: e.target.value || undefined })}
                    style={{ width: '100%' }}
                />
            </label>

            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Message (info-bulle)</span>
                <input
                    type='text'
                    value={rule.title ?? ''}
                    placeholder='Affiché au survol de la ligne/cellule'
                    onChange={(e) => onChange({ title: e.target.value || undefined })}
                    style={{ width: '100%' }}
                />
            </label>

            <label className='flex-row nowrap' style={{ alignItems: 'center', gap: 6 }}>
                <span style={{ minWidth: '7em' }}>Libellé</span>
                <input
                    type='text'
                    value={rule.label ?? ''}
                    placeholder={describeRule(rule)}
                    onChange={(e) => onChange({ label: e.target.value || undefined })}
                    style={{ width: '100%' }}
                />
            </label>

            <button className='btn-accent' onClick={onDone}>
                Terminé
            </button>
        </div>
    );
}
