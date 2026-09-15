// ==================== CONDITIONAL FORMATTING ====================
//
// Pure module: the only React import is a type, so tsc elides it and the compiled
// `dist/react/formatting.js` runs in plain Node. Keep it that way — it is what makes
// the evaluator verifiable without a test runner or a DOM.

import type { CSSProperties } from 'react';
import type {
    CellFormatting,
    FormattingOperator,
    FormattingRule,
    FormattingValueType,
    GetCellFormatting,
    GetRowFormatting,
    RowFormatting,
} from './types.js';

/** Operator metadata: the single source of truth for the editor's <select> and its operand inputs. */
export const FORMATTING_OPERATORS: { value: FormattingOperator; label: string; arity: 0 | 1 | 2 | 'n' }[] = [
    { value: '=', label: '= (égal)', arity: 1 },
    { value: '!=', label: '≠ (différent)', arity: 1 },
    { value: '>', label: '> (supérieur)', arity: 1 },
    { value: '>=', label: '≥ (supérieur ou égal)', arity: 1 },
    { value: '<', label: '< (inférieur)', arity: 1 },
    { value: '<=', label: '≤ (inférieur ou égal)', arity: 1 },
    { value: 'between', label: 'Entre (bornes incluses)', arity: 2 },
    { value: 'in', label: 'Dans la liste', arity: 'n' },
    { value: 'contains', label: 'Contient', arity: 1 },
    { value: 'notContains', label: 'Ne contient pas', arity: 1 },
    { value: 'startsWith', label: 'Commence par', arity: 1 },
    { value: 'endsWith', label: 'Finit par', arity: 1 },
    { value: 'isNull', label: 'Est vide (NULL)', arity: 0 },
    { value: 'isNotNull', label: "N'est pas vide", arity: 0 },
];

const OPERATOR_SET = new Set<string>(FORMATTING_OPERATORS.map((o) => o.value));

export function operatorArity(operator: FormattingOperator): 0 | 1 | 2 | 'n' {
    return FORMATTING_OPERATORS.find((o) => o.value === operator)?.arity ?? 1;
}

// ==================== COERCION ====================
//
// Values come straight from MySQL: DECIMAL/BIGINT arrive as strings, DATE/DATETIME as
// Date objects (or ISO strings with dateStrings: true), TINYINT(1) as 0/1.

const NUMERIC = /^[+-]?\d+(?:[.,]\d+)?$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

function isBlank(v: unknown): boolean {
    return v === null || v === undefined;
}

function toNumber(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v !== 'string') return null;
    const s = v.trim();
    // '' and '12 rue de la Paix' are deliberately NOT numbers.
    if (!s || !NUMERIC.test(s)) return null;
    return Number(s.replace(',', '.'));
}

function toDate(v: unknown): { t: number; dayOnly: boolean } | null {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : { t: v.getTime(), dayOnly: false };
    if (typeof v !== 'string') return null;
    const s = v.trim();
    const m = DATE_ONLY.exec(s);
    // 'YYYY-MM-DD' must mean LOCAL midnight: new Date('2024-01-05') is UTC midnight,
    // which lands on the 4th for anyone west of Greenwich.
    if (m) return { t: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), dayOnly: true };
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : { t, dayOnly: false };
}

function toText(v: unknown): string {
    return (v instanceof Date ? v.toISOString() : String(v)).trim().toLocaleLowerCase();
}

function toBool(v: unknown): boolean | null {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    if (['1', 'true', 'oui', 'vrai', 'y', 'o'].includes(s)) return true;
    if (['0', 'false', 'non', 'faux', 'n'].includes(s)) return false;
    return null;
}

function startOfDay(t: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function sign(a: number, b: number): -1 | 0 | 1 {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Three-way compare. Returns null when the two operands cannot be compared at all,
 * which callers treat as "does not match" (except '!=', where it means "different").
 */
export function compareValues(cell: unknown, operand: unknown, valueType: FormattingValueType = 'auto'): -1 | 0 | 1 | null {
    if (valueType === 'number') {
        const a = toNumber(cell);
        const b = toNumber(operand);
        return a === null || b === null ? null : sign(a, b);
    }
    if (valueType === 'boolean') {
        const a = toBool(cell);
        const b = toBool(operand);
        return a === null || b === null ? null : sign(Number(a), Number(b));
    }
    if (valueType === 'date') {
        const a = toDate(cell);
        const b = toDate(operand);
        if (!a || !b) return null;
        return b.dayOnly ? sign(startOfDay(a.t), b.t) : sign(a.t, b.t);
    }
    if (valueType === 'string') {
        return toText(cell).localeCompare(toText(operand)) as -1 | 0 | 1;
    }

    // 'auto', in this exact order.
    // 1. A real Date on either side wins — that is unambiguous.
    if (cell instanceof Date || operand instanceof Date) {
        const a = toDate(cell);
        const b = toDate(operand);
        if (a && b) return b.dayOnly ? sign(startOfDay(a.t), b.t) : sign(a.t, b.t);
    }
    // 2. Both numeric → numbers. Note this makes '007' equal to '7'; use valueType:'string'
    //    for reference codes and postcodes.
    const na = toNumber(cell);
    const nb = toNumber(operand);
    if (na !== null && nb !== null) return sign(na, nb);
    // 3. Both date-parseable and at least one ISO-shaped. Runs after the numeric step,
    //    so '2024' stays a number rather than becoming a year.
    if ((typeof cell === 'string' && ISO_LIKE.test(cell.trim())) || (typeof operand === 'string' && ISO_LIKE.test(operand.trim()))) {
        const a = toDate(cell);
        const b = toDate(operand);
        if (a && b) return b.dayOnly ? sign(startOfDay(a.t), b.t) : sign(a.t, b.t);
    }
    // 4. Text, case-insensitive.
    return toText(cell).localeCompare(toText(operand)) as -1 | 0 | 1;
}

/** 'between' accepts [a, b] and {min, max} — the same vocabulary buildWhereClause already speaks. */
function asPair(value: unknown): [unknown, unknown] {
    if (Array.isArray(value)) return [value[0], value[1]];
    if (value !== null && typeof value === 'object' && 'min' in (value as any)) {
        return [(value as any).min, (value as any).max];
    }
    return [undefined, undefined];
}

/** 'in' accepts an array or a comma-separated string (what the editor's input produces). */
function asList(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [value];
}

// ==================== RULE EVALUATION ====================

export function evaluateRule(rule: FormattingRule, row: Record<string, any>): boolean {
    // Guard on key presence, NOT on `row[col] === undefined`. A typo'd column must never
    // match anything — otherwise `isNull` would repaint the entire table.
    if (!rule || typeof rule.column !== 'string' || !(rule.column in row)) return false;

    const cell = row[rule.column];
    const vt = rule.valueType ?? 'auto';

    // Operators with their own null semantics come first.
    switch (rule.operator) {
        case 'isNull':
            return isBlank(cell) || String(cell).trim() === '';
        case 'isNotNull':
            return !isBlank(cell) && String(cell).trim() !== '';
        case 'notContains':
            return isBlank(cell) ? true : !toText(cell).includes(toText(rule.value));
        case '!=': {
            if (isBlank(cell)) return !isBlank(rule.value);
            const c = compareValues(cell, rule.value, vt);
            return c === null ? true : c !== 0;
        }
    }

    // Every remaining operator is false on a NULL cell.
    if (isBlank(cell)) return false;

    switch (rule.operator) {
        case '=': {
            return compareValues(cell, rule.value, vt) === 0;
        }
        case '<': {
            const c = compareValues(cell, rule.value, vt);
            return c !== null && c < 0;
        }
        case '<=': {
            const c = compareValues(cell, rule.value, vt);
            return c !== null && c <= 0;
        }
        case '>': {
            const c = compareValues(cell, rule.value, vt);
            return c !== null && c > 0;
        }
        case '>=': {
            const c = compareValues(cell, rule.value, vt);
            return c !== null && c >= 0;
        }
        case 'between': {
            let [lo, hi] = asPair(rule.value);
            if (lo === undefined || hi === undefined) return false;
            // Tolerate swapped bounds rather than silently matching nothing.
            if ((compareValues(lo, hi, vt) ?? 0) > 0) [lo, hi] = [hi, lo];
            const a = compareValues(cell, lo, vt);
            const b = compareValues(cell, hi, vt);
            return a !== null && b !== null && a >= 0 && b <= 0;
        }
        case 'in': {
            return asList(rule.value).some((v) => compareValues(cell, v, vt) === 0);
        }
        case 'contains':
            return toText(cell).includes(toText(rule.value));
        case 'startsWith':
            return toText(cell).startsWith(toText(rule.value));
        case 'endsWith':
            return toText(cell).endsWith(toText(rule.value));
    }
    return false;
}

// ==================== MERGE ====================

function joinClass(a: string | undefined, b: string | undefined): string | undefined {
    if (!a) return b || undefined;
    if (!b) return a;
    const seen = new Set(a.split(/\s+/).filter(Boolean));
    for (const c of b.split(/\s+/).filter(Boolean)) seen.add(c);
    return Array.from(seen).join(' ');
}

/** null = the "row" bucket; otherwise the column names this rule paints. */
function resolveTargets(rule: FormattingRule, columns: Set<string>): string[] | null {
    const target = rule.target ?? 'row';
    if (target === 'row') return null;
    if (target === 'cell') return [rule.column];
    if (Array.isArray(target)) return target.filter((c) => columns.has(c));
    return null;
}

export function computeRowFormatting<T extends Record<string, any>>(
    row: T,
    rules: FormattingRule[],
    columns: string[],
    callbacks?: { getRowFormatting?: GetRowFormatting<T>; getCellFormatting?: GetCellFormatting<T> },
    rowIndex = 0,
): RowFormatting {
    let rowStyle: CSSProperties | undefined;
    let rowClassName: string | undefined;
    const cellStyles: Record<string, CellFormatting> = {};
    const columnSet = new Set(columns);

    // stopIfTrue freezes exactly the buckets a rule wrote to: a row rule never freezes
    // cell rules and vice-versa.
    let rowStopped = false;
    const stoppedCells = new Set<string>();

    for (const rule of rules) {
        if (!rule || rule.enabled === false) continue;
        const targets = resolveTargets(rule, columnSet);

        if (targets === null) {
            if (rowStopped) continue;
        } else if (targets.length === 0 || targets.every((c) => stoppedCells.has(c))) {
            continue;
        }

        if (!evaluateRule(rule, row)) continue;

        if (targets === null) {
            // Later rule wins per CSS property.
            if (rule.style) rowStyle = { ...rowStyle, ...rule.style };
            rowClassName = joinClass(rowClassName, rule.className);
            if (rule.stopIfTrue) rowStopped = true;
        } else {
            for (const col of targets) {
                if (stoppedCells.has(col)) continue;
                const prev = cellStyles[col];
                cellStyles[col] = {
                    style: rule.style ? { ...prev?.style, ...rule.style } : prev?.style,
                    className: joinClass(prev?.className, rule.className),
                };
                if (rule.stopIfTrue) stoppedCells.add(col);
            }
        }
    }

    // Callbacks get the last word and are deliberately NOT subject to stopIfTrue —
    // they are the escape hatch, so they must always be able to override.
    const fromRowCb = callbacks?.getRowFormatting?.(row, rowIndex);
    if (fromRowCb) {
        if (fromRowCb.style) rowStyle = { ...rowStyle, ...fromRowCb.style };
        rowClassName = joinClass(rowClassName, fromRowCb.className);
    }
    if (callbacks?.getCellFormatting) {
        for (const col of columns) {
            const fromCellCb = callbacks.getCellFormatting(col, row[col], row, rowIndex);
            if (!fromCellCb) continue;
            const prev = cellStyles[col];
            cellStyles[col] = {
                style: fromCellCb.style ? { ...prev?.style, ...fromCellCb.style } : prev?.style,
                className: joinClass(prev?.className, fromCellCb.className),
            };
        }
    }

    return { rowStyle, rowClassName, cellStyles };
}

/**
 * Formatting for a whole page of rows. Returns `null` when there is nothing to do, so the
 * feature costs one boolean check for everyone who does not use it.
 */
export function computeTableFormatting<T extends Record<string, any>>(
    items: T[],
    rules: FormattingRule[],
    columns: string[],
    callbacks?: { getRowFormatting?: GetRowFormatting<T>; getCellFormatting?: GetCellFormatting<T> },
): RowFormatting[] | null {
    const hasRules = rules.some((r) => r && r.enabled !== false);
    if (!hasRules && !callbacks?.getRowFormatting && !callbacks?.getCellFormatting) return null;
    return items.map((row, i) => computeRowFormatting(row, rules, columns, callbacks, i));
}

// ==================== SANITIZING ====================

let idCounter = 0;

/** Stable-enough id for a rule that arrived without one. randomUUID needs a secure context. */
export function newRuleId(): string {
    const uuid = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.randomUUID?.() : undefined;
    return uuid ?? `r${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeStyle(input: unknown): CSSProperties | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        if (typeof v === 'string' || typeof v === 'number') out[k] = v;
    }
    return Object.keys(out).length ? (out as CSSProperties) : undefined;
}

/**
 * Coerce an untrusted rule list (an API payload or localStorage) into valid rules.
 * Anything malformed is dropped, never thrown on — a bad stored rule must not take the
 * table down.
 */
export function sanitizeFormattingRules(input: unknown): FormattingRule[] {
    if (!Array.isArray(input)) return [];
    const out: FormattingRule[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.column !== 'string' || !r.column) continue;
        if (typeof r.operator !== 'string' || !OPERATOR_SET.has(r.operator)) continue;

        let target: FormattingRule['target'] = 'row';
        if (r.target === 'cell' || r.target === 'row') target = r.target;
        else if (Array.isArray(r.target)) target = r.target.filter((c): c is string => typeof c === 'string');

        out.push({
            id: typeof r.id === 'string' && r.id ? r.id : newRuleId(),
            label: typeof r.label === 'string' ? r.label : undefined,
            column: r.column,
            operator: r.operator as FormattingOperator,
            value: r.value,
            valueType:
                r.valueType === 'string' || r.valueType === 'number' || r.valueType === 'date' || r.valueType === 'boolean'
                    ? r.valueType
                    : 'auto',
            target,
            style: sanitizeStyle(r.style),
            className: typeof r.className === 'string' ? r.className : undefined,
            stopIfTrue: r.stopIfTrue === true,
            enabled: r.enabled !== false,
        });
    }
    return out;
}

// ==================== EDITOR HELPERS ====================

export interface RuleStyleState {
    background?: string;
    color?: string;
    bold: boolean;
    italic: boolean;
    /** Every property the editor has no widget for, preserved across an edit. */
    rest: CSSProperties;
}

export function styleToEditorState(style?: CSSProperties): RuleStyleState {
    const { backgroundColor, color, fontWeight, fontStyle, ...rest } = (style ?? {}) as Record<string, any>;
    return {
        background: typeof backgroundColor === 'string' ? backgroundColor : undefined,
        color: typeof color === 'string' ? color : undefined,
        bold: fontWeight === 'bold' || fontWeight === 700 || fontWeight === '700',
        italic: fontStyle === 'italic',
        rest: rest as CSSProperties,
    };
}

export function editorStateToStyle(state: RuleStyleState): CSSProperties | undefined {
    const style: Record<string, any> = { ...state.rest };
    if (state.background) style.backgroundColor = state.background;
    if (state.color) style.color = state.color;
    if (state.bold) style.fontWeight = 'bold';
    if (state.italic) style.fontStyle = 'italic';
    return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

/** Human-readable one-liner for a rule, used when it carries no explicit label. */
export function describeRule(rule: FormattingRule): string {
    const op = FORMATTING_OPERATORS.find((o) => o.value === rule.operator);
    const arity = op?.arity ?? 1;
    let operand = '';
    if (arity === 2) {
        const [lo, hi] = asPair(rule.value);
        operand = ` ${String(lo ?? '')} et ${String(hi ?? '')}`;
    } else if (arity === 'n') {
        operand = ` ${asList(rule.value).join(', ')}`;
    } else if (arity === 1) {
        operand = ` ${String(rule.value ?? '')}`;
    }
    const target = rule.target === 'cell' ? 'cellule' : Array.isArray(rule.target) ? rule.target.join(', ') : 'ligne';
    return `${rule.column} ${op?.label.split(' ')[0] ?? rule.operator}${operand} → ${target}`;
}
