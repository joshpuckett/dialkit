export function dropdownTransition(node, params) {
    const above = params?.above ?? false;
    const duration = params?.duration ?? 150;
    const offset = above ? 8 : -8;
    return {
        duration,
        css: (t) => {
            const eased = t;
            const y = (1 - eased) * offset;
            const scale = 0.95 + 0.05 * eased;
            return `opacity:${eased};transform:translateY(${y}px) scale(${scale});`;
        },
    };
}
