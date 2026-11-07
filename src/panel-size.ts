/** Include the panel's chrome in explicit border-box heights, independent of host CSS resets. */
export function measurePanelHeight(content: HTMLElement): number {
  const panel = content.parentElement;
  if (!panel) return content.offsetHeight;
  const style = getComputedStyle(panel);
  const chrome = style.boxSizing === 'border-box'
    ? [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
      .reduce((total, value) => total + (parseFloat(value) || 0), 0)
    : 0;
  return content.offsetHeight + chrome;
}

/** Keep nested panel headers below the root's title and optional toolbar. */
export function observePanelHeader(folder: HTMLElement): () => void {
  const header = folder.firstElementChild as HTMLElement | null;
  if (!header) return () => {};
  const update = () => {
    folder.style.setProperty('--dial-panel-header-height', `${header.offsetHeight}px`);
  };
  const observer = new ResizeObserver(update);
  observer.observe(header);
  update();
  return () => {
    observer.disconnect();
    folder.style.removeProperty('--dial-panel-header-height');
  };
}

type SectionFold = {
  content: HTMLElement;
  toolbar: HTMLElement;
  open: boolean;
  fromContent: number;
  toContent: number;
  fromToolbar: number;
  toToolbar: number;
};

type PanelFold = {
  sections: Map<HTMLElement, SectionFold>;
  frame: number;
};

const panelFolds = new WeakMap<HTMLElement, PanelFold>();

function finishSectionFold(section: Pick<SectionFold, 'content' | 'toolbar' | 'open'>) {
  for (const element of [section.content, section.toolbar]) {
    element.style.display = section.open ? '' : 'none';
    element.style.removeProperty('height');
    element.inert = !section.open;
  }
}

/** One clock for section content, its toolbar, and the visible toolkit height.
 * Interpolating the already-capped height keeps a bottom-anchored toolkit moving
 * down immediately, instead of waiting for off-screen content to fold first.
 */
export function createPanelSectionTransition(folder: HTMLElement, initiallyOpen: boolean) {
  const content = folder.querySelector<HTMLElement>(':scope > .dialkit-folder-content');
  const toolbar = folder.querySelector<HTMLElement>(':scope > .dialkit-folder-header > .dialkit-panel-section-toolbar-clip');
  if (!content || !toolbar) return { setOpen() {}, destroy() {} };
  let open = initiallyOpen;
  let panel: HTMLElement | null = null;
  finishSectionFold({ content, toolbar, open });

  return {
    setOpen(next: boolean) {
      if (next === open) return;
      open = next;
      panel = folder.closest<HTMLElement>('.dialkit-panel-inner');
      if (!panel) {
        finishSectionFold({ content, toolbar, open });
        return;
      }

      const root = panel.querySelector<HTMLElement>(':scope > .dialkit-folder-root');
      if (!root) {
        finishSectionFold({ content, toolbar, open });
        return;
      }
      const shell = panel.closest<HTMLElement>('.dialkit-panel');
      const inline = panel.classList.contains('dialkit-panel-inline');
      let group = panelFolds.get(panel);
      if (!group) {
        group = { sections: new Map(), frame: 0 };
        panelFolds.set(panel, group);
      }
      cancelAnimationFrame(group.frame);
      const panelFrom = parseFloat(getComputedStyle(panel).height);
      const scrollFrom = panel.scrollTop;

      const section: SectionFold = group.sections.get(folder) ?? {
        content, toolbar, open,
        fromContent: 0, toContent: 0, fromToolbar: 0, toToolbar: 0,
      };
      section.open = open;
      group.sections.set(folder, section);

      // A reversal or another section toggle retargets the whole group from the
      // current frame, including partially folded toolbars.
      for (const fold of group.sections.values()) {
        fold.fromContent = fold.content.offsetHeight;
        fold.fromToolbar = fold.toolbar.offsetHeight;
        for (const [element, height] of [[fold.content, fold.fromContent], [fold.toolbar, fold.fromToolbar]] as const) {
          element.style.height = `${height}px`;
          element.style.display = '';
          element.inert = !fold.open;
        }
        fold.toContent = fold.open ? (fold.content.firstElementChild as HTMLElement).offsetHeight : 0;
        fold.toToolbar = fold.open ? (fold.toolbar.firstElementChild as HTMLElement).offsetHeight : 0;
      }

      const fullTarget = measurePanelHeight(root) + [...group.sections.values()].reduce(
        (delta, fold) => delta + fold.toContent - fold.fromContent + fold.toToolbar - fold.fromToolbar, 0,
      );
      const limits = [window.innerHeight - 32, parseFloat(getComputedStyle(panel).maxHeight)];
      if (shell) limits.push(parseFloat(getComputedStyle(shell).maxHeight));
      const panelTo = Math.min(fullTarget, ...limits.filter(Number.isFinite));
      const scrollTo = Math.min(scrollFrom, Math.max(0, fullTarget - panelTo));
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
      const started = performance.now();
      const activePanel = panel;
      const activeGroup = group;
      // Keep the override outside the framework-owned inline size styles.
      const heightHost = activePanel.parentElement ?? activePanel;
      activePanel.setAttribute('data-folding', 'true');

      const tick = (now: number) => {
        const time = duration === 0 ? 1 : Math.min(1, Math.max(0, (now - started) / duration));
        const progress = 1 - (1 - time) ** 3;
        for (const fold of activeGroup.sections.values()) {
          fold.content.style.height = `${fold.fromContent + (fold.toContent - fold.fromContent) * progress}px`;
          fold.toolbar.style.height = `${fold.fromToolbar + (fold.toToolbar - fold.fromToolbar) * progress}px`;
        }
        if (!inline) {
          heightHost.style.setProperty('--dial-panel-fold-height', `${panelFrom + (panelTo - panelFrom) * progress}px`);
          activePanel.scrollTop = scrollFrom + (scrollTo - scrollFrom) * progress;
        }
        if (time < 1) {
          activeGroup.frame = requestAnimationFrame(tick);
          return;
        }
        for (const fold of activeGroup.sections.values()) finishSectionFold(fold);
        activeGroup.sections.clear();
        // Let framework size observers see the final layout before releasing
        // the temporary viewport height.
        activeGroup.frame = requestAnimationFrame(() => {
          if (!inline && activePanel.dataset.collapsed !== 'true') activePanel.style.height = `${panelTo}px`;
          activePanel.removeAttribute('data-folding');
          heightHost.style.removeProperty('--dial-panel-fold-height');
          panelFolds.delete(activePanel);
        });
      };
      tick(started);
    },
    destroy() {
      if (!panel) return;
      const group = panelFolds.get(panel);
      group?.sections.delete(folder);
      if (group && group.sections.size === 0) {
        cancelAnimationFrame(group.frame);
        panel.removeAttribute('data-folding');
        panel.parentElement?.style.removeProperty('--dial-panel-fold-height');
        panelFolds.delete(panel);
      }
    },
  };
}
