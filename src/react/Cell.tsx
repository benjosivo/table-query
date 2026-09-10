import { useEffect, useRef, useState } from 'react';
import type { FieldTypeName } from './types.js';
import { formattedDate, isImage, looksLikeFile, truncatedJSON } from './utils.js';

interface CellProps {
    value: unknown;
    fieldType: FieldTypeName;
    onImagePreview?: (src: string) => void;
}

export function Cell({ value, fieldType, onImagePreview }: CellProps) {
    if (fieldType === 'DATE') return <>{formattedDate(value, true)}</>;
    if (fieldType === 'DATETIME' || fieldType === 'TIMESTAMP') return <>{formattedDate(value)}</>;

    if (fieldType === 'JSON' && value) {
        return <span dangerouslySetInnerHTML={{ __html: truncatedJSON(value) }} />;
    }

    if ((fieldType === 'BLOB' || fieldType === 'FILE') && typeof value === 'string' && looksLikeFile(value)) {
        return (
            <div className="flex-row">
                {value.split(';').map((file) =>
                    isImage(file) ? (
                        <LazyImage key={file} src={file} onClick={() => (onImagePreview ? onImagePreview(file) : window.open(file, '_blank'))} />
                    ) : (
                        <button key={file} onClick={() => window.open(file, '_blank')}>
                            {file.split('/').pop()}
                        </button>
                    ),
                )}
            </div>
        );
    }

    return <>{value == null ? '' : String(value)}</>;
}

function LazyImage({ src, onClick }: { src: string; onClick: () => void }) {
    const ref = useRef<HTMLImageElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '500px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <img
            ref={ref}
            src={visible ? src : undefined}
            style={{ maxWidth: '3.75rem', maxHeight: '3.75rem', display: 'block', cursor: 'pointer' }}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        />
    );
}
