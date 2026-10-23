import { buildCopyInstruction } from '../../copy-instruction';
import { batch, createSignal, createEffect, on, onMount, onCleanup, type JSX } from 'solid-js';
import { animate } from 'motion';
import { ICON_CLIPBOARD_PLAIN, ICON_CHECK, ICON_RESET } from '../../icons';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig, DialValue } from '../../store/DialStore';
import type { AnimationHandle } from '../primitives';
import { Folder } from './Folder';
import { RootPanel } from './RootPanel';
import { ControlRenderer } from './ControlRenderer';
import { PresetManager } from './PresetManager';

interface PanelProps {
  panel: PanelConfig;
  defaultOpen?: boolean;
  inline?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'root' | 'section';
  toolbarExtra?: JSX.Element;
}

export function Panel(props: PanelProps) {
  const [copied, setCopied] = createSignal(false);
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  const [values, setValues] = createSignal<Record<string, DialValue>>(
    DialStore.getValues(props.panel.id)
  );
  const [presets, setPresets] = createSignal(DialStore.getPresets(props.panel.id));
  const [activePresetId, setActivePresetId] = createSignal(DialStore.getActivePresetId(props.panel.id));
  // The store owns open/collapsed state so it can be driven programmatically.
  const [storeOpen, setStoreOpen] = createSignal(DialStore.getPanelOpen(props.panel.id));
  const isOpen = () => storeOpen() ?? props.defaultOpen ?? true;
  let copyButtonRef!: HTMLButtonElement;
  let copyClipboardIconRef!: HTMLSpanElement;
  let copyCheckIconRef!: HTMLSpanElement;
  let copyTapAnim: AnimationHandle | null = null;
  let copyClipboardAnim: AnimationHandle | null = null;
  let copyCheckAnim: AnimationHandle | null = null;

  const tapTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

  onMount(() => {
    const unsub = DialStore.subscribe(props.panel.id, () => {
      batch(() => {
        setValues(DialStore.getValues(props.panel.id));
        setPresets(DialStore.getPresets(props.panel.id));
        setActivePresetId(DialStore.getActivePresetId(props.panel.id));
        setStoreOpen(DialStore.getPanelOpen(props.panel.id));
      });
    });
    DialStore.initPanelOpen(props.panel.id, props.defaultOpen ?? true);
    onCleanup(unsub);
  });

  const handleCopy = async () => {
    const instruction = buildCopyInstruction('createDialKit', props.panel.name, values());
    try { await navigator.clipboard.writeText(instruction); }
    catch { return; }
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
    DialStore.setPanelOpen(props.panel.id, open);
    props.onOpenChange?.(open);
  };

  const toolbar = (
    <>
      <PresetManager
        panelId={props.panel.id}
        presets={presets()}
        activePresetId={activePresetId()}
      />

      <button
        class="dialkit-toolbar-add"
        onClick={() => DialStore.resetValues(props.panel.id)}
        title="Reset current version" aria-label="Reset current version"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={ICON_RESET} fill="currentColor" />
        </svg>
      </button>

      <button
        ref={copyButtonRef}
        class="dialkit-toolbar-add dialkit-toolbar-primary"
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
      </button>

      {props.toolbarExtra}

    </>
  );

  if (props.variant === 'section') {
    return (
      <Folder title={props.panel.name} open={isOpen()} onOpenChange={handleOpenChange} toolbar={toolbar}>
        <ControlRenderer panelId={props.panel.id} controls={props.panel.controls} values={values()} />
      </Folder>
    );
  }

  return (
    <div class="dialkit-panel-wrapper">
      <RootPanel title={props.panel.name} open={isOpen()} inline={props.inline ?? false} onOpenChange={handleOpenChange} toolbar={toolbar}>
        <ControlRenderer panelId={props.panel.id} controls={props.panel.controls} values={values()} />
      </RootPanel>
    </div>
  );
}
