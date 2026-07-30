import { createSignal, createEffect, on, onCleanup, untrack, Show, JSX } from 'solid-js';
import { animate } from 'motion';
import { ICON_CHEVRON } from '../../icons';
import type { AnimationHandle } from '../primitives';
import { RootPanel } from './RootPanel';

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
  /** @deprecated Only meaningful with isRoot. */
  toolbar?: JSX.Element;
  /** @deprecated Only meaningful with isRoot. */
  panelHeightOffset?: number;
}

const sectionTransition = { type: 'spring' as const, visualDuration: 0.35, bounce: 0.1 };

/** Collapsible section with animated height/opacity and rotating chevron. */
export function Folder(props: FolderProps) {
  // Root panels are a different component; delegate for old call sites.
  if (props.isRoot) {
    return <RootPanel {...props} />;
  }

  const initialOpen = props.open ?? props.defaultOpen ?? true;
  const [isOpen, setIsOpen] = createSignal(initialOpen);
  const [contentMounted, setContentMounted] = createSignal(initialOpen);
  let skipFirstAnim = initialOpen;
  let sectionContentRef: HTMLDivElement | undefined;
  let sectionAnim: AnimationHandle | null = null;
  let chevronRef: SVGSVGElement | undefined;
  let chevronAnim: AnimationHandle | null = null;

  onCleanup(() => {
    sectionAnim?.stop();
    chevronAnim?.stop();
  });

  // Chevron renders at its resting angle; only animate on changes.
  createEffect(on(isOpen, (open) => {
    if (!chevronRef) return;
    chevronAnim?.stop();
    chevronAnim = animate(
      chevronRef,
      { rotate: open ? 0 : 180 },
      { type: 'spring', visualDuration: 0.35, bounce: 0.15 }
    );
  }, { defer: true }));

  const applyOpen = (next: boolean) => {
    setIsOpen(next);
    if (next) {
      sectionAnim?.stop();
      sectionAnim = null;
      if (sectionContentRef) {
        // If close was interrupted, animate the section back open.
        sectionAnim = animate(
          sectionContentRef,
          { height: 'auto', opacity: 1 },
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
        { height: 0, opacity: 0 },
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
  };

  // Controlled mode: the parent owns the state, so mirror it into the animation.
  createEffect(() => {
    const controlled = props.open;
    if (controlled !== undefined && controlled !== untrack(isOpen)) applyOpen(controlled);
  });

  const handleToggle = () => {
    const next = !isOpen();
    if (props.open === undefined) applyOpen(next);
    props.onOpenChange?.(next);
  };

  return (
    <div class="dialkit-folder" data-open={String(isOpen())}>
      <div class="dialkit-folder-header" onClick={handleToggle}>
        <div class="dialkit-folder-header-top">
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
            style={{ transform: `rotate(${initialOpen ? 0 : 180}deg)` }}
          >
            <path d={ICON_CHEVRON} />
          </svg>
        </div>
      </div>

      <Show when={contentMounted()}>
        <div
          ref={(el) => {
            sectionContentRef = el;
            if (skipFirstAnim) {
              skipFirstAnim = false;
              return;
            }

            sectionAnim?.stop();
            el.style.height = '0px';
            el.style.opacity = '0';
            sectionAnim = animate(
              el,
              { height: 'auto', opacity: 1 },
              {
                ...sectionTransition,
                onComplete: () => {
                  sectionAnim = null;
                },
              }
            );
          }}
          class="dialkit-folder-content"
          style={{ 'clip-path': 'inset(0 -20px)' }}
        >
          <div class="dialkit-folder-inner">{props.children}</div>
        </div>
      </Show>
    </div>
  );
}
