import { defineComponent, h, nextTick, onMounted, onUnmounted, ref, shallowRef, Teleport, useId, watch, type PropType } from 'vue';
import { motion } from 'motion-v';
import { DialStore } from '../../store/DialStore';
import type { ControlMeta } from '../../store/DialStore';
import { handleMidiEscape, MIDI_CONTROLLER_DESCRIPTION, midiConnectionView, midiInputDisplayName } from '../../midi';
import type { MidiController, MidiMappingOwner } from '../../midi';
import { ICON_CHECK, ICON_TRASH } from '../../icons';

function findControlLabel(controls: ControlMeta[], path: string): string {
  for (const control of controls) {
    if (control.path === path) return control.label;
    if ((control.type === 'spring' || control.type === 'transition') && path.startsWith(`${control.path}.`)) {
      const leaf = path.slice(control.path.length + 1);
      return `${control.label} · ${leaf.charAt(0).toUpperCase()}${leaf.slice(1)}`;
    }
    if (control.children) {
      const found = findControlLabel(control.children, path);
      if (found) return found;
    }
  }
  return path;
}

// motion-v components expose their public instance on a ref, so unwrap `$el` to
// reach the underlying DOM node (native elements come through directly).
function resolveElement(node: unknown): HTMLElement | null {
  if (node instanceof HTMLElement) return node;
  if (node && typeof node === 'object' && '$el' in node) {
    const el = (node as { $el?: unknown }).$el;
    return el instanceof HTMLElement ? el : null;
  }
  return null;
}

export const MidiMenu = defineComponent({
  name: 'DialKitMidiMenu',
  props: {
    controller: { type: Object as PropType<MidiController>, required: true },
    ownerToken: { type: Object as PropType<MidiMappingOwner>, required: false, default: undefined },
  },
  setup(props) {
    const isOpen = ref(false);
    const triggerRef = ref<HTMLElement | null>(null);
    const dropdownRef = ref<HTMLElement | null>(null);
    const pos = ref({ top: 0, right: 0 });
    const portalTheme = ref<string>();
    const standaloneOwnerToken: MidiMappingOwner = {};
    const ownerToken = props.ownerToken ?? standaloneOwnerToken;
    const instanceId = useId();
    const dropdownId = `dialkit-midi-${instanceId}`;
    const titleId = `${dropdownId}-title`;

    const snapshot = shallowRef(props.controller.getSnapshot());

    let stopControllerWatch: (() => void) | undefined;
    onMounted(() => {
      stopControllerWatch = watch(() => props.controller, (controller, _previous, onCleanup) => {
        snapshot.value = controller.getSnapshot();
        const unsubscribe = controller.subscribe(() => {
          snapshot.value = controller.getSnapshot();
        });
        onCleanup(() => {
          unsubscribe();
          if (!props.ownerToken) controller.stopMapping(ownerToken);
        });
      }, { immediate: true });
    });

    const setTriggerRef = (node: unknown) => {
      triggerRef.value = resolveElement(node);
    };

    const open = () => {
      const rect = triggerRef.value?.getBoundingClientRect();
      if (rect) {
        pos.value = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
      }
      portalTheme.value = triggerRef.value?.closest<HTMLElement>('.dialkit-root[data-theme]')?.dataset.theme;
      isOpen.value = true;
      void nextTick(() => {
        const firstControl = dropdownRef.value?.querySelector<HTMLElement>(
          '.dialkit-midi-device-radio:checked, .dialkit-midi-device-radio, button:not(:disabled)'
        );
        (firstControl ?? dropdownRef.value)?.focus();
      });
    };

    const close = () => {
      isOpen.value = false;
    };

    const closeAndRestoreFocus = () => {
      close();
      void nextTick(() => triggerRef.value?.focus());
    };

    const requestAccess = async () => {
      const current = props.controller.getSnapshot();
      if (current.status === 'connected' && !current.error) props.controller.disconnect();
      await props.controller.connect();
    };

    const enterMapMode = () => {
      if (!props.controller.getSnapshot().activeInputId) return;
      props.controller.startMapping(undefined, ownerToken);
      closeAndRestoreFocus();
    };

    const toggle = () => {
      if (props.controller.getSnapshot().mapping) {
        props.controller.stopMapping();
      } else if (isOpen.value) close();
      else {
        open();
        const current = props.controller.getSnapshot();
        if (current.status === 'idle' || current.status === 'denied' || current.status === 'error' || current.error) {
          void requestAccess();
        }
      }
    };

    // Outside-click closes the menu. Mapping mode persists so the sliders behind it
    // stay interactive while the user maps them.
    let mousedownHandler: ((e: MouseEvent) => void) | null = null;

    const addOutsideClickListener = () => {
      mousedownHandler = (e: MouseEvent) => {
        const target = e.target as Node;
        if (triggerRef.value?.contains(target) || dropdownRef.value?.contains(target)) return;
        close();
      };
      document.addEventListener('mousedown', mousedownHandler);
    };

    const removeOutsideClickListener = () => {
      if (mousedownHandler) {
        document.removeEventListener('mousedown', mousedownHandler);
        mousedownHandler = null;
      }
    };

    // Escape settles a pending learn first, then leaves mapping mode.
    let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    const addEscapeListener = () => {
      keydownHandler = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        handleMidiEscape(e, props.controller, null, isOpen.value, closeAndRestoreFocus);
      };
      window.addEventListener('keydown', keydownHandler);
    };

    const removeEscapeListener = () => {
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
      }
    };

    watch(
      [
        isOpen,
        () => snapshot.value.mapping !== null,
        () => snapshot.value.learning !== null,
      ],
      ([open, isMapping, isLearningHere], _previous, onCleanup) => {
        if (open) addOutsideClickListener();
        if (open || isMapping || isLearningHere) addEscapeListener();
        onCleanup(() => {
          removeOutsideClickListener();
          removeEscapeListener();
        });
      },
      { immediate: true }
    );

    onUnmounted(() => {
      stopControllerWatch?.();
      removeOutsideClickListener();
      removeEscapeListener();
    });

    return () => {
      const snap = snapshot.value;
      const view = midiConnectionView(snap);
      const isMapping = snap.mapping !== null;
      const mappings = snap.bindings;
      const activeInputName = view.activeInputLabel;

      return [
        h(motion.button as any, {
          ref: setTriggerRef,
          class: `dialkit-midi-trigger${isMapping ? ' dialkit-midi-done' : ''}`,
          'data-active': String(isOpen.value || isMapping),
          'data-connected': String(Boolean(activeInputName) && !isMapping),
          onClick: toggle,
          title: isMapping ? 'Finish MIDI mapping' : activeInputName ? `${activeInputName} connected` : 'MIDI controllers',
          'aria-label': isMapping ? 'Finish MIDI mapping' : activeInputName ? `${activeInputName} connected — MIDI controllers` : 'MIDI controllers',
          'aria-haspopup': isMapping ? undefined : 'dialog',
          'aria-expanded': String(isOpen.value),
          'aria-controls': dropdownId,
          whilePress: { scale: 0.9 },
          transition: { type: 'spring', visualDuration: 0.15, bounce: 0.3 },
        }, isMapping
          ? [h('span', 'Done')]
          : activeInputName
            ? [
                h('span', { class: 'dialkit-midi-trigger-status', 'data-state': 'connected' }, [
                  h('span', { class: 'dialkit-midi-trigger-status-dot', 'aria-hidden': 'true' }),
                  h('span', { class: 'dialkit-midi-trigger-status-label' }, activeInputName),
                ]),
              ]
            : [
                h('span', { class: 'dialkit-midi-trigger-status', 'data-state': 'disconnected' }, [
                  h('span', { class: 'dialkit-midi-trigger-status-dot', 'aria-hidden': 'true' }),
                  h('span', { class: 'dialkit-midi-trigger-status-label' }, 'No controller'),
                ]),
              ]),
        isOpen.value
          ? h(Teleport, { to: 'body' }, [
              h('div', {
                ref: dropdownRef,
                id: dropdownId,
                class: 'dialkit-root dialkit-midi-dropdown',
                'data-theme': portalTheme.value,
                role: 'dialog',
                'aria-labelledby': titleId,
                tabindex: -1,
                style: {
                  position: 'fixed',
                  top: `${pos.value.top}px`,
                  right: `${pos.value.right}px`,
                },
              }, [
                h('div', { id: titleId, class: 'dialkit-midi-title' }, 'Controllers'),
                h('div', { class: 'dialkit-midi-status' }, [
                  h('span', { class: 'dialkit-midi-status-label' }, MIDI_CONTROLLER_DESCRIPTION),
                ]),
                view.showStatus
                  ? h('div', {
                      class: 'dialkit-midi-connection-status',
                      'data-status': view.status,
                      role: 'status',
                    }, view.label)
                  : null,
                snap.inputs.length > 0
                  ? h('div', {
                      class: 'dialkit-midi-devices',
                      role: 'radiogroup',
                      'aria-label': 'MIDI controllers',
                    }, snap.inputs.map((input) => {
                      const active = input.id === snap.activeInputId;
                      return h('label', {
                        key: input.id,
                        class: 'dialkit-midi-device',
                        'data-active': String(active),
                      }, [
                        h('input', {
                          class: 'dialkit-midi-device-radio',
                          type: 'radio',
                          name: `${dropdownId}-controller`,
                          value: input.id,
                          checked: active,
                          onChange: () => props.controller.selectInput(input.id),
                        }),
                        h('span', { class: 'dialkit-midi-device-dot', 'aria-hidden': 'true' }),
                        h('span', { class: 'dialkit-midi-device-name' }, midiInputDisplayName(input) ?? 'MIDI controller'),
                        active
                          ? h('svg', {
                              class: 'dialkit-midi-device-check',
                              viewBox: '0 0 24 24',
                              fill: 'none',
                              stroke: 'currentColor',
                              'stroke-width': '2.5',
                              'stroke-linecap': 'round',
                              'stroke-linejoin': 'round',
                              'aria-hidden': 'true',
                            }, [h('path', { d: ICON_CHECK })])
                          : null,
                      ]);
                    }))
                  : null,
                view.action && snap.status !== 'connected'
                  ? h('button', {
                      class: 'dialkit-button dialkit-midi-cta',
                      onClick: () => { void requestAccess(); },
                    }, [h('span', view.actionLabel ?? '')])
                  : null,
                snap.status === 'connected' && snap.inputs.length > 0
                  ? h('button', {
                      class: 'dialkit-button dialkit-midi-cta',
                      disabled: !snap.activeInputId,
                      onClick: enterMapMode,
                    }, 'Map parameters')
                  : null,
                view.action && snap.status === 'connected'
                  ? h('button', {
                      class: 'dialkit-button dialkit-midi-cta',
                      onClick: () => { void requestAccess(); },
                    }, [h('span', view.actionLabel ?? '')])
                  : null,
                mappings.length > 0
                  ? h('div', { class: 'dialkit-midi-list' },
                      mappings.map((binding) =>
                        h('div', { key: binding.id, class: 'dialkit-midi-item' }, [
                          h('span', { class: 'dialkit-midi-name' }, (() => {
                            const panel = DialStore.getPanel(binding.panelId);
                            const control = panel ? findControlLabel(panel.controls, binding.path) : binding.path;
                            return panel ? `${panel.name} · ${control}` : control;
                          })()),
                          h('span', { class: 'dialkit-midi-cc' }, `CC ${binding.cc}`),
                          h('button', {
                            class: 'dialkit-midi-delete',
                            onClick: () => props.controller.unbindTarget(binding.panelId, binding.path),
                            title: 'Remove mapping',
                            'aria-label': 'Remove mapping',
                          }, [
                            h('svg', {
                              'aria-hidden': 'true',
                              viewBox: '0 0 24 24',
                              fill: 'none',
                              stroke: 'currentColor',
                              'stroke-width': '2',
                              'stroke-linecap': 'round',
                              'stroke-linejoin': 'round',
                            }, ICON_TRASH.map((d) => h('path', { d }))),
                          ]),
                        ])
                      )
                    )
                  : null,
              ]),
            ])
          : null,
      ];
    };
  },
});
