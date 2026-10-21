import { activateOnKey } from '../control-keyboard';
import { createPanelSectionTransition, measurePanelHeight, observePanelHeader } from '../panel-size';
import { useState, useRef, useEffect, useLayoutEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ICON_CLOSE, ICON_PANEL, ICON_CHEVRON } from '../icons';

interface FolderProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  isRoot?: boolean;
  inline?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  toolbar?: ReactNode;
  panelHeightOffset?: number;
}

export function Folder({ title, children, open, defaultOpen = true, isRoot = false, inline = false, onOpenChange, toolbar, panelHeightOffset = 0 }: FolderProps) {
  const [localOpen, setIsOpen] = useState(defaultOpen);
  const isOpen = open ?? localOpen;
  const isCollapsed = !isOpen;
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const sectionTransition = useRef<ReturnType<typeof createPanelSectionTransition> | null>(null);
  const isSection = !isRoot && !!toolbar;
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const [windowHeight, setWindowHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);

  useLayoutEffect(() => {
    if (!isSection || !sectionRef.current) return;
    const transition = createPanelSectionTransition(sectionRef.current, isOpen);
    sectionTransition.current = transition;
    return () => { transition.destroy(); sectionTransition.current = null; };
  }, [isSection]);

  useLayoutEffect(() => { sectionTransition.current?.setOpen(isOpen); }, [isOpen]);

  useEffect(() => {
    if (!isRoot) return;
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isRoot]);

  // Track content height for explicit panel sizing (no height: 'auto')
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const stopHeader = observePanelHeader(el);
    const ro = new ResizeObserver(() => {
      if (isOpen) {
        const h = measurePanelHeight(el);
        setContentHeight(prev => prev === h ? prev : h);
      }
    });
    ro.observe(el);
    return () => { ro.disconnect(); stopHeader(); };
  }, [isOpen]);

  // An inline root panel is always open, so its header is not a control.
  const toggleable = !(inline && isRoot);

  const handleToggle = () => {
    if (!toggleable) return;
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange?.(next);
  };

  const folderContent = (
    <div
      ref={isRoot ? contentRef : isSection ? sectionRef : undefined}
      className={`dialkit-folder ${isRoot ? 'dialkit-folder-root' : toolbar ? 'dialkit-folder-section' : ''}`}
      data-open={String(isOpen)}
    >
      <div className={`dialkit-folder-header ${isRoot ? 'dialkit-panel-header' : ''}`} onClick={handleToggle}>
        <div className="dialkit-folder-header-top" role={toggleable ? "button" : undefined} tabIndex={toggleable ? 0 : undefined} aria-label={toggleable ? title : undefined} aria-expanded={toggleable ? isOpen : undefined} onKeyDown={(e) => activateOnKey(e, handleToggle)}>
          {isRoot ? (
            isOpen && (
              <div className="dialkit-folder-title-row">
                <span className="dialkit-folder-title dialkit-folder-title-root">
                  {title}
                </span>
              </div>
            )
          ) : (
            <div className="dialkit-folder-title-row">
              <span className="dialkit-folder-title">
                {title}
              </span>
            </div>
          )}
          {isRoot && !inline && (
            <svg
              className="dialkit-panel-icon"
              viewBox={isOpen ? "0 0 24 24" : "0 0 16 16"}
              fill="none"
            >
              {isOpen ? <path d={ICON_CLOSE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <>
              <path opacity="0.5" d={ICON_PANEL.path} fill="currentColor"/>
              {ICON_PANEL.circles.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" stroke="currentColor" strokeWidth="1.25"/>
              ))}
              </>}
            </svg>
          )}
          {!isRoot && (
            <motion.svg
              className="dialkit-folder-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.15 }}
            >
              <path d={ICON_CHEVRON} />
            </motion.svg>
          )}
        </div>

        {isSection ? (
          <div className="dialkit-panel-section-toolbar-clip">
            <div className="dialkit-panel-section-toolbar" onClick={(e) => e.stopPropagation()}>{toolbar}</div>
          </div>
        ) : toolbar && isOpen ? (
          <div className="dialkit-panel-toolbar" onClick={(e) => e.stopPropagation()}>{toolbar}</div>
        ) : null}
      </div>

      {isSection ? (
        <div className="dialkit-folder-content">
          <div className="dialkit-folder-inner">{children}</div>
        </div>
      ) : isRoot ? (
        isOpen && (
          <div className="dialkit-folder-content">
            <div className="dialkit-folder-inner">{children}</div>
          </div>
        )
      ) : <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className="dialkit-folder-content"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ type: 'spring', visualDuration: 0.35, bounce: 0.1 }}
          >
            <div className="dialkit-folder-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>}
    </div>
  );

  if (isRoot) {
    if (inline) {
      return (
        <div className="dialkit-panel-inner dialkit-panel-inline">
          {folderContent}
        </div>
      );
    }

    const panelStyle = isOpen
      ? { width: 280, height: contentHeight !== undefined ? Math.min(contentHeight + panelHeightOffset, windowHeight - 32) : 'auto' as const, borderRadius: 14, boxShadow: 'var(--dial-shadow)', cursor: undefined as string | undefined, overflowY: 'auto' as const }
      : { width: 42, height: 42, borderRadius: '50%', boxSizing: 'border-box' as const, boxShadow: 'var(--dial-shadow-collapsed)', overflow: 'hidden' as const, cursor: 'pointer' as const };

    return (
      <motion.div
        className="dialkit-panel-inner"
        tabIndex={-1}
        style={panelStyle}
        onClick={!isOpen ? handleToggle : undefined}
        data-collapsed={isCollapsed}
        whileTap={!isOpen ? { scale: 0.9 } : undefined}
        transition={{ type: 'spring', visualDuration: 0.15, bounce: 0.3 }}
      >
        {folderContent}
      </motion.div>
    );
  }

  return folderContent;
}
