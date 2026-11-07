import { buildCopyInstruction, copyText } from '../../copy-instruction';
import { batch, createSignal, createEffect, on, onMount, onCleanup, type JSX } from 'solid-js';
import { isServer } from 'solid-js/web';
import { animate } from 'motion';
import { ICON_CLIPBOARD_PLAIN, ICON_CHECK } from '../../icons';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig, DialValue } from '../../store/DialStore';
import type { AnimationHandle } from '../primitives';
import { Folder } from './Folder';
import { RootPanel } from './RootPanel';
import { ControlRenderer } from './ControlRenderer';
import { PresetManager } from './PresetManager';
import { VersionGallery } from './VersionGallery';
import type { DialVersions } from '../../versions/gallery';

interface PanelProps {
  panel: PanelConfig;
  defaultOpen?: boolean;
  inline?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'root' | 'section';
  toolbarExtra?: JSX.Element;
  versions?: DialVersions;
  theme?: 'light' | 'dark' | 'system';
}

export function Panel(props: PanelProps) {
  // DialRoot keeps one Panel per id, so this never changes.
  const panelId = props.panel.id;
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  const [values, setValues] = createSignal<Record<string, DialValue>>(
    DialStore.getValues(panelId)
  );
  const [presets, setPresets] = createSignal(DialStore.getPresets(panelId));
  const [activePresetId, setActivePresetId] = createSignal(DialStore.getActivePresetId(panelId));
  // The store owns open/collapsed state so it can be driven programmatically.
  const [storeOpen, setStoreOpen] = createSignal(DialStore.getPanelOpen(panelId));
  const isOpen = () => storeOpen() ?? props.defaultOpen ?? true;
  const versions = () => props.versions ?? 'thumbnails';
  let copyButtonRef!: HTMLButtonElement;
  let copyClipboardIconRef!: HTMLSpanElement;
  let copyCheckIconRef!: HTMLSpanElement;
  let copyTapAnim: AnimationHandle | null = null;
  let copyClipboardAnim: AnimationHandle | null = null;
  let copyCheckAnim: AnimationHandle | null = null;

  const tapTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

  // Subscribed at setup: DialRoot can carry open state into this panel before it mounts.
  if (!isServer) {
    onCleanup(DialStore.subscribe(panelId, () => {
      batch(() => {
        setValues(DialStore.getValues(panelId));
        setPresets(DialStore.getPresets(panelId));
        setActivePresetId(DialStore.getActivePresetId(panelId));
        setStoreOpen(DialStore.getPanelOpen(panelId));
      });
    }));
  }

  onMount(() => DialStore.initPanelOpen(panelId, props.defaultOpen ?? true));

  const handleCopy = async () => {
    if (!(await copyText(buildCopyInstruction('createDialKit', props.panel.name, values())))) return;
    setCopied(true);
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => setCopied(false), 1500);
  };

  // Icons render with their resting styles inline; only animate on changes.
  createEffect(on(copied, (isCopied) => {
    if (!copyClipboardIconRef || !copyCheckIconRef) return;

    copyClipboardAnim?.stop();
    copyCheckAnim?.stop();

    const transition = { type: 'spring' as const, visualDuration: 0.3, bounce: 0.2 };
    copyClipboardAnim = animate(copyClipboardIconRef, {
      opacity: isCopied ? 0 : 1,
      scale: isCopied ? 0.5 : 1,
      filter: isCopied ? 'blur(4px)' : 'blur(0px)',
    }, transition);
    copyCheckAnim = animate(copyCheckIconRef, {
      opacity: isCopied ? 1 : 0,
      scale: isCopied ? 1 : 0.5,
      filter: isCopied ? 'blur(0px)' : 'blur(4px)',
    }, transition);
  }, { defer: true }));

  onCleanup(() => {
    clearTimeout(copyTimeout);
    copyTapAnim?.stop();
    copyClipboardAnim?.stop();
    copyCheckAnim?.stop();
  });

  const handleCopyTapStart = () => {
    if (!copyButtonRef) return;
    copyTapAnim?.stop();
    copyTapAnim = animate(copyButtonRef, { scale: 0.95 }, tapTransition);
  };

  const handleCopyTapEnd = () => {
    if (!copyButtonRef) return;
    copyTapAnim?.stop();
    copyTapAnim = animate(copyButtonRef, { scale: 1 }, tapTransition);
  };

  const handleOpenChange = (open: boolean) => {
    DialStore.setPanelOpen(panelId, open);
    props.onOpenChange?.(open);
  };

  const toolbar = (
    <>
      {versions() === 'menu' && (
        <PresetManager
          panelId={panelId}
          presets={presets()}
          activePresetId={activePresetId()}
        />
      )}

      <button
        ref={copyButtonRef}
        class="dialkit-toolbar-add dialkit-toolbar-primary"
        data-wide={versions() !== 'menu' ? 'true' : undefined}
        onClick={handleCopy}
        onPointerDown={handleCopyTapStart}
        onPointerUp={handleCopyTapEnd}
        onPointerCancel={handleCopyTapEnd}
        onPointerLeave={handleCopyTapEnd}
        title="Copy parameters" aria-label="Copy parameters"
      >
        <span class="dialkit-toolbar-copy-icon-wrap">
          <span
            ref={copyClipboardIconRef}
            class="dialkit-toolbar-copy-icon"
            style={{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)', 'transform-origin': '50% 50%' }}
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d={ICON_CLIPBOARD_PLAIN.board} stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d={ICON_CLIPBOARD_PLAIN.body} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span
            ref={copyCheckIconRef}
            class="dialkit-toolbar-copy-icon"
            style={{ opacity: 0, transform: 'scale(0.5)', filter: 'blur(4px)', 'transform-origin': '50% 50%' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d={ICON_CHECK} />
            </svg>
          </span>
        </span>
        {versions() !== 'menu' && <span>{copied() ? 'Copied' : 'Copy parameters'}</span>}
      </button>

      {props.toolbarExtra}

    </>
  );

  const content = () => (
    <>
      {versions() !== 'menu' && (
        <VersionGallery panelId={panelId} theme={props.theme} />
      )}
      <ControlRenderer panelId={panelId} controls={props.panel.controls} values={values()} />
    </>
  );

  if (props.variant === 'section') {
    return (
      <Folder title={props.panel.name} open={isOpen()} onOpenChange={handleOpenChange} toolbar={toolbar}>
        {content()}
      </Folder>
    );
  }

  return (
    <div class="dialkit-panel-wrapper">
      <RootPanel title={props.panel.name} open={isOpen()} inline={props.inline ?? false} onOpenChange={handleOpenChange} toolbar={toolbar}>
        {content()}
      </RootPanel>
    </div>
  );
}
