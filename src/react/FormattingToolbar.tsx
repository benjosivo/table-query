import { useState } from 'react';
import type { FieldTypeInfo, ParamFilter } from './types.js';
import type { UseFormattingRulesResult } from './useFormattingRules.js';
import { FormattingModal } from './FormattingModal.js';

export interface FormattingToolbarProps extends UseFormattingRulesResult {
    columns: string[];
    fieldsType?: FieldTypeInfo[];
    paramFilter?: ParamFilter[];
    label?: string;
}

/**
 * The button that opens the conditional formatting editor. Exported separately so a host
 * composing `useDataTable` + `Table` by hand can drop it wherever it likes.
 */
export function FormattingToolbar({ columns, fieldsType, paramFilter, label = 'Mise en forme', ...formatting }: FormattingToolbarProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const activeCount = formatting.rules.length;

    return (
        <>
            <button
                className='btnDataFilterTable'
                onClick={(e) => setAnchorEl(anchorEl ? null : e.currentTarget)}
                title='Colorer des lignes ou des cellules selon leurs valeurs'
            >
                {label}
                {activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
            {anchorEl && (
                <FormattingModal
                    columns={columns}
                    fieldsType={fieldsType}
                    paramFilter={paramFilter}
                    anchorEl={anchorEl}
                    onClose={() => setAnchorEl(null)}
                    {...formatting}
                />
            )}
        </>
    );
}
