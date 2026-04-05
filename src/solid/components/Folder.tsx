import { createSignal, createEffect, onCleanup, Show, JSX } from 'solid-js';
import { animate } from 'motion';
import { ICON_PANEL, ICON_CHEVRON } from '../../icons';

interface FolderProps {
  title: string;
  children: JSX.Element;
  defaultOpen?: boolean;
  isRoot?: boolean;
  inline?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  toolbar?: JSX.Element;
}

export function Folder(props: FolderProps) {
  const [isOpen, setIsOpen] = createSignal(props.defaultOpen ?? true);
  const [isCollapsed, setIsCollapsed] = createSignal(!(props.defaultOpen ?? true));
  const [contentHeight, setContentHeight] = createSignal<number | undefined>(undefined);
  const [windowHeight, setWindowHeight] = createSignal(typeof window !== 'undefined' ? window.innerHeight : 800);

  if (props.isRoot) {
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  }

  // Section content animation state
  const [contentMounted, setContentMounted] = createSignal(props.defaultOpen ?? true);
  let skipFirstAnim = props.defaultOpen ?? true;
  let sectionContentRef: HTMLDivElement | undefined;
  let sectionAnim: any = null;
  let folderChevronRef: SVGSVGElement | undefined;
  let chevronAnim: any = null;
  let chevronInitialized = false;
  let panelTapAnim: any = null;

  let contentRef: HTMLDivElement | undefined;

  // Track content height for root panel sizing
  createEffect(() => {
    if (!props.isRoot || !isOpen()) return;
    const el = contentRef;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      setContentHeight(prev => prev === h ? prev : h);
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    if (props.isRoot || !folderChevronRef) return;
    const open = isOpen();
    chevronAnim?.stop();

    if (!chevronInitialized) {
      folderChevronRef.style.transform = `rotate(${open ? 0 : 180}deg)`;
      chevronInitialized = true;
      return;
    }

    chevronAnim = animate(
      folderChevronRef,
      { rotate: open ? 0 : 180 },
      { type: 'spring', visualDuration: 0.35, bounce: 0.15 }
    );

    onCleanup(() => chevronAnim?.stop());
  });

  const handleToggle = () => {
    if (props.inline && props.isRoot) return;
    const next = !isOpen();
    setIsOpen(next);
    if (next) {
      setIsCollapsed(false);
      if (!props.isRoot) {
        sectionAnim?.stop();
        sectionAnim = null;
        if (sectionContentRef) {
          // If close was interrupted, animate section back open.
          sectionAnim = animate(
            sectionContentRef,
            { height: 'auto', opacity: 1 },
            {
              type: 'spring',
              visualDuration: 0.35,
              bounce: 0.1,
              onComplete: () => {
                sectionAnim = null;
              },
            }
          );
        } else {
          // If fully unmounted, mount and let the ref callback run enter animation.
          setContentMounted(true);
        }
      }
    } else {
      setIsCollapsed(true);
      if (!props.isRoot) {
        if (sectionContentRef) {
          const currentHeight = sectionContentRef.getBoundingClientRect().height;
          sectionContentRef.style.height = `${currentHeight}px`;
          sectionAnim?.stop();
          sectionAnim = animate(
            sectionContentRef,
            { height: 0, opacity: 0 },
            {
              type: 'spring', visualDuration: 0.35, bounce: 0.1,
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
      }
    }
    props.onOpenChange?.(next);
  };

  const folderContent = () => (
    <div
      ref={(el) => { if (props.isRoot) contentRef = el; }}
      class={`dialkit-folder ${props.isRoot ? 'dialkit-folder-root' : ''}`}
    >
      <div
        class={`dialkit-folder-header ${props.isRoot ? 'dialkit-panel-header' : ''}`}
        onClick={handleToggle}
      >
        <div class="dialkit-folder-header-top">
          {props.isRoot ? (
            <Show when={isOpen()}>
              <div class="dialkit-folder-title-row">
                <span class="dialkit-folder-title dialkit-folder-title-root">
                  {props.title}
                </span>
              </div>
            </Show>
          ) : (
            <div class="dialkit-folder-title-row">
              <span class="dialkit-folder-title">{props.title}</span>
            </div>
          )}

          {props.isRoot && !props.inline && (
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
          )}
          {!props.isRoot && (
            <svg
              ref={folderChevronRef}
              class="dialkit-folder-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d={ICON_CHEVRON} />
            </svg>
          )}
        </div>

        <Show when={props.isRoot && props.toolbar && isOpen()}>
          <div class="dialkit-panel-toolbar" onClick={(e) => e.stopPropagation()}>
            {props.toolbar}
          </div>
        </Show>
      </div>

      <Show when={props.isRoot ? isOpen() : contentMounted()}>
        <div
          ref={(el) => {
            if (props.isRoot) return;
            sectionContentRef = el;
            if (skipFirstAnim) { skipFirstAnim = false; return; }

            sectionAnim?.stop();
            el.style.height = '0px';
            el.style.opacity = '0';
            sectionAnim = animate(
              el,
              { height: 'auto', opacity: 1 },
              {
                type: 'spring',
                visualDuration: 0.35,
                bounce: 0.1,
                onComplete: () => {
                  sectionAnim = null;
                },
              }
            );
          }}
          class="dialkit-folder-content"
          style={!props.isRoot ? { 'clip-path': 'inset(0 -20px)' } : undefined}
        >
          <div class="dialkit-folder-inner">{props.children}</div>
        </div>
      </Show>
    </div>
  );

  if (props.isRoot) {
    if (props.inline) {
      return (
        <div class="dialkit-panel-inner dialkit-panel-inline">
          {folderContent()}
        </div>
      );
    }
    let panelRef!: HTMLDivElement;
    let rootPanelAnim: any = null;
    let rootPanelInitialized = false;
    let lastRootOpen = isOpen();

    createEffect(() => {
      if (!panelRef || isOpen()) return;
      const handler = (e: Event) => {
        e.stopPropagation();
        handleToggle();
      };
      panelRef.addEventListener('click', handler);
      onCleanup(() => panelRef.removeEventListener('click', handler));
    });

    createEffect(() => {
      if (!panelRef) return;

      const open = isOpen();
      const measuredOpenHeight = contentHeight() !== undefined
        ? Math.min(contentHeight()! + 10, windowHeight() - 32)
        : panelRef.getBoundingClientRect().height;

      const target = {
        width: open ? 280 : 42,
        height: open ? measuredOpenHeight : 42,
        borderRadius: open ? 14 : 21,
        boxShadow: open
          ? 'var(--dial-shadow)'
          : 'var(--dial-shadow-collapsed)',
      };

      panelRef.style.cursor = open ? '' : 'pointer';
      panelRef.style.overflow = open ? 'hidden auto' : 'hidden';

      if (!rootPanelInitialized) {
        rootPanelInitialized = true;
        panelRef.style.width = `${target.width}px`;
        panelRef.style.height = `${target.height}px`;
        panelRef.style.borderRadius = `${target.borderRadius}px`;
        panelRef.style.boxShadow = target.boxShadow;
        lastRootOpen = open;
        return;
      }

      if (open !== lastRootOpen) {
        rootPanelAnim?.stop();
        rootPanelAnim = animate(panelRef, target, {
          type: 'spring',
          visualDuration: 0.15,
          bounce: 0.3,
          onComplete: () => {
            rootPanelAnim = null;
          },
        });
        lastRootOpen = open;
        return;
      }

      if (open) {
        panelRef.style.height = `${target.height}px`;
      }
    });

    onCleanup(() => {
      rootPanelAnim?.stop();
      panelTapAnim?.stop();
    });

    return (
      <div
        ref={panelRef}
        class="dialkit-panel-inner"
        data-collapsed={String(isCollapsed())}
        onPointerDown={() => {
          if (isOpen()) return;
          (document.activeElement as HTMLElement)?.blur?.();
          panelTapAnim?.stop();
          panelTapAnim = animate(panelRef, { scale: 0.9 }, { type: 'spring', visualDuration: 0.15, bounce: 0.3 });
        }}
        onPointerUp={() => {
          if (isOpen()) return;
          panelTapAnim?.stop();
          panelTapAnim = animate(panelRef, { scale: 1 }, { type: 'spring', visualDuration: 0.15, bounce: 0.3 });
        }}
        onPointerCancel={() => {
          if (isOpen()) return;
          panelTapAnim?.stop();
          panelTapAnim = animate(panelRef, { scale: 1 }, { type: 'spring', visualDuration: 0.15, bounce: 0.3 });
        }}
        onPointerLeave={() => {
          if (isOpen()) return;
          panelTapAnim?.stop();
          panelTapAnim = animate(panelRef, { scale: 1 }, { type: 'spring', visualDuration: 0.15, bounce: 0.3 });
        }}
      >
        {folderContent()}
      </div>
    );
  }

  return folderContent();
}
