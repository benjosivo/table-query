import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormattingRule } from './types.js';
import { newRuleId, sanitizeFormattingRules } from './formatting.js';

/** Namespaced so a storage key can't collide with the host app's own localStorage entries. */
const STORAGE_PREFIX = 'tableQuery:formatting:';
const STORAGE_VERSION = 1;

export interface UseFormattingRulesOptions {
    /** Rules set by the app (lowest priority). */
    propsRules?: FormattingRule[];
    /** Rules sent by the API. */
    serverRules?: FormattingRule[];
    /** When set, the user's rules persist in localStorage under this key. */
    storageKey?: string;
    /** Rehydrate the user's rules from your own backend — wins over localStorage. */
    initialUserRules?: FormattingRule[];
    /** Called on every change to the user's rules. */
    onChange?: (rules: FormattingRule[]) => void;
}

export interface UseFormattingRulesResult {
    /** Merged and ordered props -> server -> user, ready for <Table formattingRules>. */
    rules: FormattingRule[];
    /** The user-editable layer. */
    userRules: FormattingRule[];
    /** The props + server layers, read-only in the editor. */
    inherited: FormattingRule[];
    /** Ids of inherited rules the user has switched off. */
    disabledIds: string[];
    addRule: (rule: FormattingRule) => void;
    updateRule: (id: string, patch: Partial<FormattingRule>) => void;
    removeRule: (id: string) => void;
    moveRule: (id: string, delta: 1 | -1) => void;
    setRuleDisabled: (id: string, disabled: boolean) => void;
    resetUserRules: () => void;
}

function serialize(rules: FormattingRule[], disabled: string[]): string {
    return JSON.stringify({ v: STORAGE_VERSION, rules, disabled });
}

/** Inherited rules need a stable id even when the source didn't give them one. */
function withFallbackIds(rules: FormattingRule[] | undefined, source: string): FormattingRule[] {
    if (!rules || rules.length === 0) return [];
    return rules.map((r, i) => (r.id ? r : { ...r, id: `${source}:${i}` }));
}

/**
 * Owns the three formatting layers and their persistence. Lives in a hook rather than in
 * `DataTable` so that a host composing `useDataTable` + `Table` by hand can reuse it.
 */
export function useFormattingRules({
    propsRules,
    serverRules,
    storageKey,
    initialUserRules,
    onChange,
}: UseFormattingRulesOptions): UseFormattingRulesResult {
    const [userRules, setUserRules] = useState<FormattingRule[]>(() => (initialUserRules ? sanitizeFormattingRules(initialUserRules) : []));
    const [disabledIds, setDisabledIds] = useState<string[]>([]);

    const fullKey = storageKey ? `${STORAGE_PREFIX}${storageKey}` : undefined;

    // Hydration is STATE, not a ref: both effects run in the same commit on mount, so a ref
    // flipped by the read effect would already read true in the write effect below — which
    // would rewrite [] over the rules just loaded and fire a spurious onChange([]).
    const [hydrated, setHydrated] = useState(false);
    // What is already in storage, so an unchanged value never triggers a write or an onChange.
    const lastWritten = useRef<string | null>(null);

    // Read post-mount, never in the useState initializer: with SSR the server renders no user
    // rules, so reading during the first render would cause a hydration mismatch on the styles.
    useEffect(() => {
        // Baseline = the state as it stands before hydration, so the first write-effect pass is
        // a no-op. Without it, mounting with nothing stored would fire onChange([]) and wipe the
        // rules of a host that persists them server-side.
        lastWritten.current = serialize(userRules, disabledIds);
        if (initialUserRules || !fullKey || typeof window === 'undefined') {
            setHydrated(true);
            return;
        }
        try {
            const raw = window.localStorage.getItem(fullKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                // An unknown version is ignored rather than migrated; the next write replaces it.
                if (parsed && parsed.v === STORAGE_VERSION) {
                    const rules = sanitizeFormattingRules(parsed.rules);
                    const disabled = Array.isArray(parsed.disabled) ? parsed.disabled.filter((x: unknown) => typeof x === 'string') : [];
                    setUserRules(rules);
                    setDisabledIds(disabled);
                    lastWritten.current = serialize(rules, disabled);
                }
            }
        } catch {
            // SSR, Safari private mode, blocked storage, corrupted JSON — all non-fatal.
        }
        setHydrated(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fullKey]);

    useEffect(() => {
        if (!hydrated) return;
        const serialized = serialize(userRules, disabledIds);
        // Nothing actually changed (the mount pass, or a re-render): don't write, don't notify.
        if (lastWritten.current === serialized) return;
        lastWritten.current = serialized;
        if (fullKey && typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(fullKey, serialized);
            } catch {
                // Quota exceeded or storage blocked: the rules still work for this session.
            }
        }
        onChange?.(userRules);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userRules, disabledIds, fullKey, hydrated]);

    const inherited = useMemo(
        () => [...withFallbackIds(propsRules, 'props'), ...withFallbackIds(serverRules, 'server')],
        [propsRules, serverRules],
    );

    /**
     * Precedence: props -> server -> user. Evaluation order IS precedence order, so a later
     * rule wins per CSS property and an earlier `stopIfTrue` can block a later layer.
     */
    const rules = useMemo(() => {
        const disabled = new Set(disabledIds);
        return [...inherited, ...userRules].filter((r) => r.enabled !== false && !(r.id && disabled.has(r.id)));
    }, [inherited, userRules, disabledIds]);

    const addRule = useCallback((rule: FormattingRule) => {
        setUserRules((prev) => [...prev, { ...rule, id: rule.id || newRuleId() }]);
    }, []);

    const updateRule = useCallback((id: string, patch: Partial<FormattingRule>) => {
        setUserRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }, []);

    const removeRule = useCallback((id: string) => {
        setUserRules((prev) => prev.filter((r) => r.id !== id));
    }, []);

    const moveRule = useCallback((id: string, delta: 1 | -1) => {
        setUserRules((prev) => {
            const i = prev.findIndex((r) => r.id === id);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    }, []);

    const setRuleDisabled = useCallback((id: string, disabled: boolean) => {
        setDisabledIds((prev) => {
            const has = prev.includes(id);
            if (disabled === has) return prev;
            return disabled ? [...prev, id] : prev.filter((x) => x !== id);
        });
    }, []);

    const resetUserRules = useCallback(() => {
        setUserRules([]);
        setDisabledIds([]);
    }, []);

    return { rules, userRules, inherited, disabledIds, addRule, updateRule, removeRule, moveRule, setRuleDisabled, resetUserRules };
}
