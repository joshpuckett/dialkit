import { createSignal, createEffect, on, onCleanup, untrack, Show, JSX } from 'solid-js';
import { isServer } from 'solid-js/web';
import { animate } from 'motion';
import { ICON_PANEL } from '../../icons';
import type { AnimationHandle } from '../primitives';

export interface RootPanelProps {
  title: string;
  children: JSX.Element;
  defaultOpen?: boolean;
  open?: boolean;
  inline?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  toolbar?: JSX.Element;
  panelHeightOffset?: number;
}

const morphTransition = { type: 'spring' as const, visualDuration: 0.15, bounce: 0.3 };

/**
 * The top-level panel shell: header with panel icon and toolbar, and (in
 * popover mode) the bubble-to-panel morph animation with drag-friendly
 * collapsed state. Section folding lives in Folder.
 */
export function RootPanel(props: RootPanelProps) {
  // Inline vs popover picks a different component tree; treat it as static
  // configuration (DialRoot never changes mode at runtime).
  const inline = props.inline ?? false;

  const [isOpen, setIsOpen] = createSignal(props.open ?? props.defaultOpen ?? true);
  const [contentHeight, setContentHeight] = createSignal<number | undefined>(undefined);
  const [windowHeight, setWindowHeight] = createSignal(isServer ? 800 : window.innerHeight);
  let folderRef: HTMLDivElement | undefined;

  // Controlled mode: the parent owns the state, so mirror it into the morph.
  createEffect(() => {
    const controlled = props.open;
    if (controlled !== undefined) setIsOpen(controlled);
  });

  const handleToggle = () => {
    if (inline) return;
    const next = !isOpen();
    if (props.open === undefined) setIsOpen(next);
    props.onOpenChange?.(next);
  };

  const folderContent = () => (
    <div ref={folderRef} class="dialkit-folder dialkit-folder-root" data-open={String(isOpen())}>
      <div class="dialkit-folder-header dialkit-panel-header" onClick={handleToggle}>
        <div class="dialkit-folder-header-top">
          <Show when={isOpen()}>
            <div class="dialkit-folder-title-row">
              <span class="dialkit-folder-title dialkit-folder-title-root">
                {props.title}
              </span>
            </div>
          </Show>

          <Show when={!inline}>
            <svg class="dialkit-panel-icon" viewBox="0 0 16 16" fill="none">
              <path
                opacity="0.5"
                d={ICON_PANEL.path}
                fill="currentColor"
              />
              <circle cx={ICON_PANEL.circles[0].cx} cy={ICON_PANEL.circles[0].cy} r={ICON_PANEL.circles[0].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
              <circle cx={ICON_PANEL.circles[1].cx} cy={ICON_PANEL.circles[1].cy} r={ICON_PANEL.circles[1].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
              <circle cx={ICON_PANEL.circles[2].cx} cy={ICON_PANEL.circles[2].cy} r={ICON_PANEL.circles[2].r} fill="currentColor" stroke="currentColor" stroke-width="1.25" />
            </svg>
          </Show>
        </div>

        <Show when={props.toolbar && isOpen()}>
          <div class="dialkit-panel-toolbar" onClick={(e) => e.stopPropagation()}>
            {props.toolbar}
          </div>
        </Show>
      </div>

      <Show when={isOpen()}>
        <div class="dialkit-folder-content">
          <div class="dialkit-folder-inner">{props.children}</div>
        </div>
      </Show>
    </div>
  );

  if (inline) {
    return (
      <div class="dialkit-panel-inner dialkit-panel-inline">
        {folderContent()}
      </div>
    );
  }

  let panelRef!: HTMLDivElement;
  let morphAnim: AnimationHandle | null = null;
  let tapAnim: AnimationHandle | null = null;

  const onWindowResize = () => setWindowHeight(window.innerHeight);
  window.addEventListener('resize', onWindowResize);
  onCleanup(() => {
    window.removeEventListener('resize', onWindowResize);
    morphAnim?.stop();
    tapAnim?.stop();
  });

  // Measure the whole folder (header + content) to size the open panel.
  createEffect(() => {
    if (!isOpen()) return;
    const el = folderRef;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      setContentHeight((prev) => (prev === h ? prev : h));
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  const measuredOpenHeight = () => (
    contentHeight() !== undefined
      ? Math.min(contentHeight()! + (props.panelHeightOffset ?? 10), windowHeight() - 32)
      : panelRef.getBoundingClientRect().height
  );

  // Bubble <-> panel morph: first run just applies resting styles; later
  // open-state changes animate. on() keeps height reads untracked so only
  // transitions trigger the morph.
  createEffect(on(isOpen, (open, prevOpen) => {
    const target = {
      width: open ? 280 : 42,
      height: open ? measuredOpenHeight() : 42,
      borderRadius: open ? 14 : 21,
      boxShadow: open ? 'var(--dial-shadow)' : 'var(--dial-shadow-collapsed)',
    };

    panelRef.style.cursor = open ? '' : 'pointer';
    panelRef.style.overflow = open ? 'hidden auto' : 'hidden';

    if (prevOpen === undefined) {
      panelRef.style.width = `${target.width}px`;
      panelRef.style.height = `${target.height}px`;
      panelRef.style.borderRadius = `${target.borderRadius}px`;
      panelRef.style.boxShadow = target.boxShadow;
      return;
    }

    morphAnim?.stop();
    morphAnim = animate(panelRef, target, {
      ...morphTransition,
      onComplete: () => {
        morphAnim = null;
      },
    });
  }));

  // Track content growth/shrink while open without re-triggering the morph.
  createEffect(on([contentHeight, windowHeight] as const, ([height, winHeight]) => {
    if (height === undefined || !untrack(isOpen)) return;
    panelRef.style.height = `${Math.min(height + (props.panelHeightOffset ?? 10), winHeight - 32)}px`;
  }, { defer: true }));

  // Expand-on-tap while collapsed uses a native listener: stopPropagation here
  // prevents the (delegated) header onClick from firing a second toggle.
  createEffect(() => {
    if (isOpen()) return;
    const handler = (e: Event) => {
      e.stopPropagation();
      handleToggle();
    };
    panelRef.addEventListener('click', handler);
    onCleanup(() => panelRef.removeEventListener('click', handler));
  });

  const pressTo = (scale: number) => {
    if (isOpen()) return;
    tapAnim?.stop();
    tapAnim = animate(panelRef, { scale }, morphTransition);
  };

  return (
    <div
      ref={panelRef}
      class="dialkit-panel-inner"
      data-collapsed={String(!isOpen())}
      onPointerDown={() => {
        if (isOpen()) return;
        (document.activeElement as HTMLElement)?.blur?.();
        pressTo(0.9);
      }}
      onPointerUp={() => pressTo(1)}
      onPointerCancel={() => pressTo(1)}
      onPointerLeave={() => pressTo(1)}
    >
      {folderContent()}
    </div>
  );
}
