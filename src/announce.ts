const REGION_ID = 'dialkit-live-region';
let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Read a short status message to screen reader users, such as "Radius reset to 24".
 * Use it for changes that happen away from focus; a focused slider already
 * announces its own value.
 */
export function announce(message: string): void {
  if (typeof document === 'undefined' || !message) return;
  let region = document.getElementById(REGION_ID);
  if (!region) {
    region = document.createElement('div');
    region.id = REGION_ID;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    Object.assign(region.style, {
      position: 'fixed', width: '1px', height: '1px', padding: '0', margin: '-1px',
      overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: '0',
    });
    document.body.append(region);
  }
  // Clear first so repeating the same message is announced again.
  region.textContent = '';
  clearTimeout(pending);
  const target = region;
  pending = setTimeout(() => { target.textContent = message; }, 50);
}
