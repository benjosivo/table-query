// ==================== UTILS ====================

export function formattedDate(value: unknown, dateOnly = false): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return String(value);
    const date = d.toLocaleDateString();
    if (dateOnly) return date;
    return `${date} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function isImage(path: string): boolean {
    return /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(path);
}

export function looksLikeFile(str: string): boolean {
    if (!str) return false;
    const ext = /\.(txt|pdf|csv|json|xml|yaml|yml|ts|js|tsx|jsx|html|css|png|jpg|jpeg|gif|svg|zip|tar|gz|md|docx?|xlsx?|pptx?)$/i;
    return str.split(';').every((f) => ext.test(f.trim()));
}

/** Returns HTML with <span class="..."> wrapping each JSON token, for use with dangerouslySetInnerHTML. */
export function syntaxHighlightJSON(json: string): string {
    const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (m) => {
        let cls = 'number';
        if (/^"/.test(m)) cls = /:$/.test(m) ? 'key' : 'string';
        else if (/true|false/.test(m)) cls = 'boolean';
        else if (/null/.test(m)) cls = 'null';
        return `<span class="${cls}">${m}</span>`;
    });
}

export function truncatedJSON(value: unknown, maxLen = 200): string {
    const str = JSON.stringify(value, null, 2);
    const truncated = str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
    return syntaxHighlightJSON(truncated);
}
