import { batch, createSignal, createEffect, on, onMount, onCleanup, type JSX } from 'solid-js';
import { animate } from 'motion';
import { ICON_CLIPBOARD, ICON_CHECK, ICON_ADD_PRESET } from '../../icons';
import { DialStore } from '../../store/DialStore';
import type { PanelConfig, DialValue } from '../../store/DialStore';
import type { MidiController, MidiMappingOwner } from '../../midi';
import { type AnimationHandle } from '../primitives';
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
  headerActions?: JSX.Element;
  midi?: MidiController;
  midiOwner?: MidiMappingOwner;
}

export function Panel(props: PanelProps) {
  const [copied, setCopied] = createSignal(false);
  const [values, setValues] = createSignal<Record<string, DialValue>>(
    DialStore.getValues(props.panel.id)
  );
  const [presets, setPresets] = createSignal(DialStore.getPresets(props.panel.id));
  const [activePresetId, setActivePresetId] = createSignal(DialStore.getActivePresetId(props.panel.id));
  let addButtonRef!: HTMLButtonElement;
  let copyButtonRef!: HTMLButtonElement;
  let copyClipboardIconRef!: HTMLSpanElement;
  let copyCheckIconRef!: HTMLSpanElement;
  let addTapAnim: AnimationHandle | null = null;
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
      });
    });
    onCleanup(unsub);
  });

  const handleAddPreset = () => {
    const nextNum = presets().length + 2;
    DialStore.savePreset(props.panel.id, `Version ${nextNum}`);
  };

  const handleCopy = () => {
    const jsonStr = JSON.stringify(values(), null, 2);
    const instruction = `Update the createDialKit configuration for "${props.panel.name}" with these values:\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n\nApply these values as the new defaults in the createDialKit call.`;
    navigator.clipboard.writeText(instruction);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
    addTapAnim?.stop();
    copyTapAnim?.stop();
    copyClipboardAnim?.stop();
    copyCheckAnim?.stop();
  });

  const handleAddTapStart = () => {
    if (!addButtonRef) return;
    addTapAnim?.stop();
    addTapAnim = animate(addButtonRef, { scale: 0.9 }, tapTransition);
  };

  const handleAddTapEnd = () => {
    if (!addButtonRef) return;
    addTapAnim?.stop();
    addTapAnim = animate(addButtonRef, { scale: 1 }, tapTransition);
  };

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
    props.onOpenChange?.(open);
  };

  const renderControls = () => (
    <ControlRenderer
      panelId={props.panel.id}
      controls={props.panel.controls}
      values={values()}
      midi={props.midi}
      midiOwner={props.midiOwner}
    />
  );

  const toolbar = (
    <>
      <button
        ref={addButtonRef}
        class="dialkit-toolbar-add"
        onClick={handleAddPreset}
        onPointerDown={handleAddTapStart}
        onPointerUp={handleAddTapEnd}
        onPointerCancel={handleAddTapEnd}
        onPointerLeave={handleAddTapEnd}
        title="Add preset"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d={ICON_ADD_PRESET[0]} />
          <path d={ICON_ADD_PRESET[1]} />
          <path d={ICON_ADD_PRESET[2]} />
          <path d={ICON_ADD_PRESET[3]} />
          <path d={ICON_ADD_PRESET[4]} />
        </svg>
      </button>

      <PresetManager
        panelId={props.panel.id}
        presets={presets()}
        activePresetId={activePresetId()}
        onAdd={handleAddPreset}
      />

      <button
        ref={copyButtonRef}
        class="dialkit-toolbar-copy"
        onClick={handleCopy}
        onPointerDown={handleCopyTapStart}
        onPointerUp={handleCopyTapEnd}
        onPointerCancel={handleCopyTapEnd}
        onPointerLeave={handleCopyTapEnd}
        title="Copy parameters"
      >
        <span class="dialkit-toolbar-copy-icon-wrap">
          <span
            ref={copyClipboardIconRef}
            class="dialkit-toolbar-copy-icon"
            style={{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)', 'transform-origin': '50% 50%' }}
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path d={ICON_CLIPBOARD.board} stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d={ICON_CLIPBOARD.sparkle} fill="currentColor" />
              <path d={ICON_CLIPBOARD.body} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
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
        Copy
      </button>

      {props.toolbarExtra}

    </>
  );

  if (props.variant === 'section') {
    return (
      <Folder title={props.panel.name} defaultOpen={props.defaultOpen ?? true} onOpenChange={handleOpenChange}>
        <div class="dialkit-panel-section-toolbar" onClick={(e) => e.stopPropagation()}>
          {toolbar}
        </div>
        {renderControls()}
      </Folder>
    );
  }

  return (
    <div class="dialkit-panel-wrapper">
      <RootPanel title={props.panel.name} defaultOpen={props.defaultOpen ?? true} inline={props.inline ?? false} onOpenChange={handleOpenChange} headerActions={props.headerActions} toolbar={toolbar}>
        {renderControls()}
      </RootPanel>
    </div>
  );
}
