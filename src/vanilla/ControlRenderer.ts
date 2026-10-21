import { DialStore, type ControlMeta, type DialValue, type SpringConfig, type TransitionConfig } from '../store/DialStore';
import { mountColorControl } from '../color-control';
import { mountImageControl } from '../image-control';
import { mountDialPad } from '../dial-pad-control';
import type { DialPadValue } from '../dial-pad';
import { mountFolder, mountSlider, mountTextControl, mountToggle } from './controls';
import { mountSelectControl } from './menus';
import { mountSpringControl, mountTransitionControl, type TransitionControlProps } from './transitions';
import { subscribeShortcut, type ActiveShortcut } from './shortcuts';
import { element, type Mounted } from './dom';
export interface ControlRendererProps {
  panelId: string;
  controls: ControlMeta[];
  values: Record<string, DialValue>;
  transitionDuration?: TransitionControlProps['durationControl'];
}
export function mountControlRenderer(host: HTMLElement, initial: ControlRendererProps): Mounted<ControlRendererProps> {
  let props = initial;
  let active: ActiveShortcut = null;
  let signature = '';
  let mounted: {
    update(): void;
    destroy(): void;
  }[] = [];
  // Keep controls as direct children: folder spacing depends on this DOM structure.
  function build(controls: ControlMeta[], target: HTMLElement) {
    for (const control of controls) {
      const value = () => props.values[control.path];
      const defaultValue = () => DialStore.getDefaultValue(props.panelId, control.path);
      const change = (v: DialValue) => DialStore.updateValue(props.panelId, control.path, v);
      const shortcut = () => ({ shortcut: control.shortcut, shortcutActive: active?.panelId === props.panelId && active?.path === control.path });
      function mount<P>(factory: (host: HTMLElement, props: P) => Mounted<P>, getProps: () => P) {
        const instance = factory(target, getProps());
        mounted.push({ update: () => instance.update(getProps()), destroy: instance.destroy });
      }
      switch (control.type) {
        case 'folder': {
          const folder = mountFolder(target, { title: control.label, defaultOpen: control.defaultOpen });
          mounted.push({
            update() {
            }, destroy: folder.destroy
          });
          build(control.children ?? [], folder.body);
          break;
        }
        case 'slider':
          mount(mountSlider, () => ({ label: control.label, value: value() as number, defaultValue: typeof defaultValue() === 'number' ? defaultValue() as number : undefined, min: control.min, max: control.max, step: control.step, onChange: change, ...shortcut() }));
          break;
        case 'toggle':
          mount(mountToggle, () => ({ label: control.label, checked: value() as boolean, onChange: change, ...shortcut() }));
          break;
        case 'text':
          mount(mountTextControl, () => ({ label: control.label, value: value() as string, placeholder: control.placeholder, onChange: change }));
          break;
        case 'select':
          mount(mountSelectControl, () => ({ label: control.label, value: value() as string, options: control.options ?? [], onChange: change }));
          break;
        case 'color':
          mount(mountColorControl, () => ({ label: control.label, value: value() as string, onChange: change }));
          break;
        case 'image':
          mount(mountImageControl, () => ({ label: control.label, value: value() as string, options: control.options, onChange: change }));
          break;
        case 'pad':
          mount(mountDialPad, () => ({ ...control.pad, label: control.label, value: value() as DialPadValue, onChange: change }));
          break;
        case 'spring':
          mount(mountSpringControl, () => ({ panelId: props.panelId, path: control.path, label: control.label, spring: value() as SpringConfig, onChange: change }));
          break;
        case 'transition':
          mount(mountTransitionControl, () => ({ panelId: props.panelId, path: control.path, label: control.label, value: value() as TransitionConfig, durationControl: props.transitionDuration, onChange: change }));
          break;
        case 'action': {
          const b = element('button', 'dialkit-button', control.label);
          b.addEventListener('click', () => DialStore.triggerAction(props.panelId, control.path));
          target.append(b);
          mounted.push({
            update() {
            }, destroy() {
              b.remove();
            }
          });
          break;
        }
      }
    }
  }
  function render() {
    const next = JSON.stringify([props.panelId, props.controls]);
    if (signature !== next) {
      mounted.forEach(c => c.destroy());
      mounted = [];
      signature = next;
      build(props.controls, host);
    }
    else
      mounted.forEach(c => c.update());
  }
  const stopShortcut = subscribeShortcut(next => {
    active = next;
    mounted.forEach(c => c.update());
  });
  render();
  return {
    update(next) {
      props = next;
      render();
    }, destroy() {
      stopShortcut();
      mounted.forEach(c => c.destroy());
      mounted = [];
    }
  };
}
