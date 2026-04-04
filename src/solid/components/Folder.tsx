import { createSignal, createEffect, onCleanup, Show, JSX } from 'solid-js';
import { animate } from 'motion';

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
                d="M6.84766 11.75C6.78583 11.9899 6.75 12.2408 6.75 12.5C6.75 12.7592 6.78583 13.0101 6.84766 13.25H2C1.58579 13.25 1.25 12.9142 1.25 12.5C1.25 12.0858 1.58579 11.75 2 11.75H6.84766ZM14 11.75C14.4142 11.75 14.75 12.0858 14.75 12.5C14.75 12.9142 14.4142 13.25 14 13.25H12.6523C12.7142 13.0101 12.75 12.7592 12.75 12.5C12.75 12.2408 12.7142 11.9899 12.6523 11.75H14ZM3.09766 7.25C3.03583 7.48994 3 7.74075 3 8C3 8.25925 3.03583 8.51006 3.09766 8.75H2C1.58579 8.75 1.25 8.41421 1.25 8C1.25 7.58579 1.58579 7.25 2 7.25H3.09766ZM14 7.25C14.4142 7.25 14.75 7.58579 14.75 8C14.75 8.41421 14.4142 8.75 14 8.75H8.90234C8.96417 8.51006 9 8.25925 9 8C9 7.74075 8.96417 7.48994 8.90234 7.25H14ZM7.59766 2.75C7.53583 2.98994 7.5 3.24075 7.5 3.5C7.5 3.75925 7.53583 4.01006 7.59766 4.25H2C1.58579 4.25 1.25 3.91421 1.25 3.5C1.25 3.08579 1.58579 2.75 2 2.75H7.59766ZM14 2.75C14.4142 2.75 14.75 3.08579 14.75 3.5C14.75 3.91421 14.4142 4.25 14 4.25H13.4023C13.4642 4.01006 13.5 3.75925 13.5 3.5C13.5 3.24075 13.4642 2.98994 13.4023 2.75H14Z"
                fill="currentColor"
              />
              <circle cx="6" cy="8" r="0.998596" fill="currentColor" stroke="currentColor" stroke-width="1.25" />
              <circle cx="10.4999" cy="3.5" r="0.998657" fill="currentColor" stroke="currentColor" stroke-width="1.25" />
              <circle cx="9.75015" cy="12.5" r="0.997986" fill="currentColor" stroke="currentColor" stroke-width="1.25" />
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
              <path d="M6 9.5L12 15.5L18 9.5" />
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
        ? contentHeight()! + 10
        : panelRef.getBoundingClientRect().height;

      const target = {
        width: open ? 280 : 42,
        height: open ? measuredOpenHeight : 42,
        borderRadius: open ? 14 : 21,
        boxShadow: open
          ? '0 8px 32px rgba(0, 0, 0, 0.5)'
          : '0 4px 16px rgba(0, 0, 0, 0.25)',
      };

      panelRef.style.cursor = open ? '' : 'pointer';
      panelRef.style.overflow = open ? '' : 'hidden';

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
