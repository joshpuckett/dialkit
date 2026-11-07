import type { DialValue } from './store/DialStore';

// The copy-for-agent export shared by the panel toolbar and the timeline dock.
export function buildCopyInstruction(
  hookName: string,
  panelName: string,
  values: Record<string, DialValue>
): string {
  const jsonStr = JSON.stringify(values, null, 2);

  if (hookName === 'useDialTimeline' || hookName === 'createDialTimeline') {
    return `Update the ${hookName} configuration for "${panelName}" with these values:

\`\`\`json
${jsonStr}
\`\`\`

Apply these values as the new defaults in the ${hookName} call. Keep the existing \`clip.current\` bindings while this timeline is being authored; do not convert the animation or remove DialKit yet.

Add this comment immediately above the ${hookName} call as a production handoff note:

\`\`\`tsx
// TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
// Replace them with equivalent real Motion animations using the tuned timeline
// timings and transitions, then remove ${hookName} and <DialTimeline />.
\`\`\``;
  }

  return `Update the ${hookName} configuration for "${panelName}" with these values:

\`\`\`json
${jsonStr}
\`\`\`

Apply these values as the new defaults in the ${hookName} call.`;
}

/** False when the clipboard is unavailable or the write was refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
