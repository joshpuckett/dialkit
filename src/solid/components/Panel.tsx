import { createSignal, createEffect, onMount, onCleanup, Show, For, JSX } from 'solid-js';
import { animate } from 'motion';
import { ICON_CLIPBOARD, ICON_CHECK, ICON_ADD_PRESET } from '../../icons';
import { DialStore } from '../../store/DialStore';
import type { ControlMeta, PanelConfig, SpringConfig, DialValue } from '../../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { Toggle } from './Toggle';
import { SpringControl } from './SpringControl';
import { TextControl } from './TextControl';
import { SelectControl } from './SelectControl';
import { ColorControl } from './ColorControl';
import { PresetManager } from './PresetManager';

interface PanelProps {
  panel: PanelConfig;
  defaultOpen?: boolean;
  inline?: boolean;
}

export function Panel(props: PanelProps) {
  const [copied, setCopied] = createSignal(false);
  const [isPanelOpen, setIsPanelOpen] = createSignal(props.defaultOpen ?? true);
  const [values, setValues] = createSignal<Record<string, DialValue>>(
    DialStore.getValues(props.panel.id)
  );
  const [presets, setPresets] = createSignal(DialStore.getPresets(props.panel.id));
  const [activePresetId, setActivePresetId] = createSignal(DialStore.getActivePresetId(props.panel.id));
  let addButtonRef!: HTMLButtonElement;
  let copyButtonRef!: HTMLButtonElement;
  let copyClipboardIconRef!: HTMLSpanElement;
  let copyCheckIconRef!: HTMLSpanElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let addTapAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let copyTapAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let copyClipboardAnim: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let copyCheckAnim: any = null;
  let didInitCopyIcons = false;

  const tapTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

  onMount(() => {
    const unsub = DialStore.subscribe(props.panel.id, () => {
      setValues(DialStore.getValues(props.panel.id));
      setPresets(DialStore.getPresets(props.panel.id));
      setActivePresetId(DialStore.getActivePresetId(props.panel.id));
    });

    if (copyClipboardIconRef && copyCheckIconRef) {
      copyClipboardIconRef.style.transformOrigin = '50% 50%';
      copyClipboardIconRef.style.opacity = '1';
      copyClipboardIconRef.style.transform = 'scale(1)';
      copyClipboardIconRef.style.filter = 'blur(0px)';
      copyCheckIconRef.style.transformOrigin = '50% 50%';
      copyCheckIconRef.style.opacity = '0';
      copyCheckIconRef.style.transform = 'scale(0.5)';
      copyCheckIconRef.style.filter = 'blur(4px)';
      didInitCopyIcons = true;
    }

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

  createEffect(() => {
    const isCopied = copied();
    if (!copyClipboardIconRef || !copyCheckIconRef) return;

    copyClipboardAnim?.stop();
    copyCheckAnim?.stop();

    if (!didInitCopyIcons) return;

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
  });

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

  const renderControl = (control: ControlMeta) => {
    const value = () => values()[control.path];

    switch (control.type) {
      case 'slider':
        return (
          <Slider
            label={control.label}
            value={value() as number}
            onChange={(v) => DialStore.updateValue(props.panel.id, control.path, v)}
            min={control.min}
            max={control.max}
            step={control.step}
          />
        );

      case 'toggle':
        return (
          <Toggle
            label={control.label}
            checked={value() as boolean}
            onChange={(v) => DialStore.updateValue(props.panel.id, control.path, v)}
          />
        );

      case 'spring':
        return (
          <SpringControl
            panelId={props.panel.id}
            path={control.path}
            label={control.label}
            spring={value() as SpringConfig}
            onChange={(v) => DialStore.updateValue(props.panel.id, control.path, v)}
          />
        );

      case 'folder':
        return (
          <Folder title={control.label} defaultOpen={control.defaultOpen ?? true}>
            <For each={control.children ?? []}>
              {(child) => <>{renderControl(child)}</>}
            </For>
          </Folder>
        );

      case 'text':
        return (
          <TextControl
            label={control.label}
            value={value() as string}
            onChange={(v) => DialStore.updateValue(props.panel.id, control.path, v)}
            placeholder={control.placeholder}
          />
        );

      case 'select':
        return (
          <SelectControl
            label={control.label}
            value={value() as string}
            options={control.options ?? []}
            onChange={(v) => DialStore.updateValue(props.panel.id, control.path, v)}
          />
        );

      case 'color':
        return (
          <ColorControl
            label={control.label}
            value={value() as string}
            onChange={(v) => DialStore.updateValue(props.panel.id, control.path, v)}
          />
        );

      default:
        return null;
    }
  };

  const renderControls = () => {
    return (
      <For each={props.panel.controls}>
        {(control) => (
          <>
            {control.type === 'action' ? (
              <button
                class="dialkit-button"
                onClick={() => DialStore.triggerAction(props.panel.id, control.path)}
              >
                {control.label}
              </button>
            ) : (
              renderControl(control)
            )}
          </>
        )}
      </For>
    );
  };

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
            style={{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }}
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
            style={{ opacity: 0, transform: 'scale(0.5)', filter: 'blur(4px)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d={ICON_CHECK} />
            </svg>
          </span>
        </span>
        Copy
      </button>
    </>
  );

  return (
    <div class="dialkit-panel-wrapper">
      <Folder title={props.panel.name} defaultOpen={props.defaultOpen ?? true} isRoot={true} inline={props.inline ?? false} onOpenChange={setIsPanelOpen} toolbar={toolbar}>
        {renderControls()}
      </Folder>
    </div>
  );
}
