import { activateOnKey } from '../../control-keyboard';
import { createSignal, createEffect, on, onCleanup, Show, JSX } from 'solid-js';
import { animate } from 'motion';
import { ICON_CHEVRON } from '../../icons';
import type { AnimationHandle } from '../primitives';
import { RootPanel } from './RootPanel';
import { createPanelSectionTransition } from '../../panel-size';

interface FolderProps {
  title: string;
  children: JSX.Element;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** @deprecated Use RootPanel instead; kept for backwards compatibility. */
  isRoot?: boolean;
  /** @deprecated Only meaningful with isRoot. */
  inline?: boolean;
  /** Optional panel actions that stay with the section title while scrolling. */
  toolbar?: JSX.Element;
  /** @deprecated Only meaningful with isRoot. */
  panelHeightOffset?: number;
}

const sectionTransition = { type: 'spring' as const, visualDuration: 0.35, bounce: 0.1 };

/** Collapsible section with animated height and rotating chevron. */
export function Folder(props: FolderProps) {
  // Root panels are a different component; delegate for old call sites.
  if (props.isRoot) {
    return <RootPanel {...props} />;
  }

  const [localOpen, setIsOpen] = createSignal(props.defaultOpen ?? true);
  const isOpen = () => props.open ?? localOpen();
  const isSection = !!props.toolbar;
  let folderRef: HTMLDivElement | undefined;
  let panelTransition: ReturnType<typeof createPanelSectionTransition> | undefined;
  const [contentMounted, setContentMounted] = createSignal(props.open ?? props.defaultOpen ?? true);
  let skipFirstAnim = props.open ?? props.defaultOpen ?? true;
  let sectionContentRef: HTMLDivElement | undefined;
  let sectionAnim: AnimationHandle | null = null;
  let chevronRef: SVGSVGElement | undefined;
  let chevronAnim: AnimationHandle | null = null;

  onCleanup(() => {
    sectionAnim?.stop();
    chevronAnim?.stop();
    panelTransition?.destroy();
  });

  createEffect(() => {
    if (!isSection || !folderRef) return;
    if (!panelTransition) panelTransition = createPanelSectionTransition(folderRef, isOpen());
    else panelTransition.setOpen(isOpen());
  });

  // Chevron renders at its resting angle; only animate on changes.
  createEffect(on(isOpen, (open) => {
    if (!chevronRef) return;
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 180 : 0 },
      { type: 'spring', visualDuration: 0.35, bounce: 0.15 }
    );
  }, { defer: true }));

  createEffect(on(isOpen, (next) => {
    if (isSection) return;
    if (next) {
      sectionAnim?.stop();
      sectionAnim = null;
      if (sectionContentRef) {
        // If close was interrupted, animate the section back open.
        sectionAnim = animate(
          sectionContentRef,
          { height: 'auto' },
          {
            ...sectionTransition,
            onComplete: () => {
              sectionAnim = null;
            },
          }
        );
      } else {
        // If fully unmounted, mount and let the ref callback run the enter animation.
        setContentMounted(true);
      }
    } else if (sectionContentRef) {
      const currentHeight = sectionContentRef.getBoundingClientRect().height;
      sectionContentRef.style.height = `${currentHeight}px`;
      sectionAnim?.stop();
      sectionAnim = animate(
        sectionContentRef,
        { height: 0 },
        {
          ...sectionTransition,
          onComplete: () => {
            setContentMounted(false);
            sectionAnim = null;
            sectionContentRef = undefined;
          },
        }
      );
    } else {
      setContentMounted(false);
    }
  }, { defer: true }));

  const handleToggle = () => {
    const next = !isOpen();
    setIsOpen(next);
    props.onOpenChange?.(next);
  };

  return (
    <div ref={folderRef} class={`dialkit-folder${props.toolbar ? ' dialkit-folder-section' : ''}`} data-open={String(isOpen())}>
      <div class="dialkit-folder-header" onClick={handleToggle}>
        <div class="dialkit-folder-header-top" role="button" tabIndex={0} aria-label={props.title} aria-expanded={isOpen()} onKeyDown={(e) => activateOnKey(e, handleToggle)}>
          <div class="dialkit-folder-title-row">
            <span class="dialkit-folder-title">{props.title}</span>
          </div>

          <svg
            ref={chevronRef}
            class="dialkit-folder-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style={{ transform: `rotate(${(props.open ?? props.defaultOpen ?? true) ? 180 : 0}deg)` }}
          >
            <path d={ICON_CHEVRON} />
          </svg>
        </div>
        <Show when={props.toolbar}>
          <div class="dialkit-panel-section-toolbar-clip">
            <div class="dialkit-panel-section-toolbar" onClick={(e) => e.stopPropagation()}>{props.toolbar}</div>
          </div>
        </Show>
      </div>

      <Show when={isSection || contentMounted()}>
        <div
          ref={(el) => {
            sectionContentRef = el;
            if (isSection) return;
            if (skipFirstAnim) {
              skipFirstAnim = false;
              return;
            }

            sectionAnim?.stop();
            el.style.height = '0px';
            sectionAnim = animate(
              el,
              { height: 'auto' },
              {
                ...sectionTransition,
                onComplete: () => {
                  sectionAnim = null;
                },
              }
            );
          }}
          class="dialkit-folder-content"
        >
          <div class="dialkit-folder-inner">{props.children}</div>
        </div>
      </Show>
    </div>
  );
}
