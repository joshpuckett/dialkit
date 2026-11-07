import { defineComponent, h, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { DialStore, SPRING_DEFAULTS, isPhysicsSpring } from '../../store/DialStore';
import type { SpringConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';

export const SpringControl = defineComponent({
  name: 'DialKitSpringControl',
  props: {
    panelId: { type: String, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true },
    spring: {
      type: Object as PropType<SpringConfig>,
      required: true,
    },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const mode = ref<'simple' | 'advanced'>(DialStore.getSpringMode(props.panelId, props.path));
    let unsub: (() => void) | undefined;

    onMounted(() => {
      unsub = DialStore.subscribe(props.panelId, () => {
        mode.value = DialStore.getSpringMode(props.panelId, props.path);
      });
    });

    onUnmounted(() => {
      unsub?.();
    });

    const isSimpleMode = () => mode.value === 'simple';

    // Per-mode values, so switching back restores previous edits.
    const cache: { simple: SpringConfig; advanced: SpringConfig } = {
      simple: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
      advanced: { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
    };
    const remember = (spring: SpringConfig) => {
      cache[isPhysicsSpring(spring) ? 'advanced' : 'simple'] = spring;
    };
    remember(props.spring);
    watch(() => props.spring, remember);

    // The mode follows the value, so switching mode is writing that mode's value.
    const handleModeChange = (nextMode: 'simple' | 'advanced') => emit('change', cache[nextMode]);

    const handleUpdate = (key: keyof SpringConfig, value: number) => {
      if (isSimpleMode()) {
        const { stiffness, damping, mass, ...rest } = props.spring;
        emit('change', { ...rest, [key]: value });
      } else {
        const { visualDuration, bounce, ...rest } = props.spring;
        emit('change', { ...rest, [key]: value });
      }
    };

    return () => h(Folder, { title: props.label, defaultOpen: true }, {
      default: () => [
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
          h(SpringVisualization, { spring: props.spring, isSimpleMode: isSimpleMode() }),
          h('div', { class: 'dialkit-labeled-control' }, [
            h('span', { class: 'dialkit-labeled-control-label' }, 'Type'),
            h(SegmentedControl, {
              options: [
                { value: 'simple', label: 'Time' },
                { value: 'advanced', label: 'Physics' },
              ],
              value: mode.value,
              onChange: handleModeChange,
            }),
          ]),
          ...(isSimpleMode()
            ? [
              h(Slider, {
                label: 'Duration',
                value: props.spring.visualDuration ?? SPRING_DEFAULTS.visualDuration,
                min: 0.1,
                max: 1,
                step: 0.05,
                unit: 's',
                onChange: (next: number) => handleUpdate('visualDuration', next),
              }),
              h(Slider, {
                label: 'Bounce',
                value: props.spring.bounce ?? SPRING_DEFAULTS.bounce,
                min: 0,
                max: 1,
                step: 0.05,
                onChange: (next: number) => handleUpdate('bounce', next),
              }),
            ]
            : [
              h(Slider, {
                label: 'Stiffness',
                value: props.spring.stiffness ?? SPRING_DEFAULTS.stiffness,
                min: 1,
                max: 1000,
                step: 10,
                onChange: (next: number) => handleUpdate('stiffness', next),
              }),
              h(Slider, {
                label: 'Damping',
                value: props.spring.damping ?? SPRING_DEFAULTS.damping,
                min: 1,
                max: 100,
                step: 1,
                onChange: (next: number) => handleUpdate('damping', next),
              }),
              h(Slider, {
                label: 'Mass',
                value: props.spring.mass ?? SPRING_DEFAULTS.mass,
                min: 0.1,
                max: 10,
                step: 0.1,
                onChange: (next: number) => handleUpdate('mass', next),
              }),
            ]),
        ]),
      ],
    });
  },
});
