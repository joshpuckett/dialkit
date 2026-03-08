import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';
import { DialStore } from '../../store/DialStore';
import type { EasingConfig, SpringConfig, TransitionConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';
import { EasingVisualization } from './EasingVisualization';

type CurveMode = 'easing' | 'simple' | 'advanced';

export const TransitionControl = defineComponent({
  name: 'DialKitTransitionControl',
  props: {
    panelId: { type: String, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true },
    value: {
      type: Object as PropType<TransitionConfig>,
      required: true,
    },
  },
  emits: ['change'],
  setup(props, { emit }) {
    const mode = ref<CurveMode>(DialStore.getTransitionMode(props.panelId, props.path));
    let unsub: (() => void) | undefined;

    onMounted(() => {
      unsub = DialStore.subscribe(props.panelId, () => {
        mode.value = DialStore.getTransitionMode(props.panelId, props.path);
      });
    });

    onUnmounted(() => unsub?.());

    const spring = (): SpringConfig => props.value.type === 'spring'
      ? props.value
      : { type: 'spring', visualDuration: 0.3, bounce: 0.2 };

    const easing = (): EasingConfig => props.value.type === 'easing'
      ? props.value
      : { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] };

    const handleModeChange = (nextMode: CurveMode) => {
      DialStore.updateTransitionMode(props.panelId, props.path, nextMode);

      if (nextMode === 'easing') {
        const duration = props.value.type === 'spring' ? (props.value.visualDuration ?? 0.3) : props.value.duration;
        emit('change', { type: 'easing', duration, ease: easing().ease });
      } else if (nextMode === 'simple') {
        const current = spring();
        emit('change', {
          type: 'spring',
          visualDuration: current.visualDuration ?? (props.value.type === 'easing' ? props.value.duration : 0.3),
          bounce: current.bounce ?? 0.2,
        });
      } else {
        const current = spring();
        emit('change', {
          type: 'spring',
          stiffness: current.stiffness ?? 200,
          damping: current.damping ?? 25,
          mass: current.mass ?? 1,
        });
      }
    };

    const updateEase = (index: number, value: number) => {
      const current = easing();
      const next = [...current.ease] as [number, number, number, number];
      next[index] = value;
      emit('change', { ...current, ease: next });
    };

    const handleSpringUpdate = (key: keyof SpringConfig, value: number) => {
      const current = spring();
      if (mode.value === 'simple') {
        const { stiffness, damping, mass, ...rest } = current;
        emit('change', { ...rest, [key]: value });
      } else {
        const { visualDuration, bounce, ...rest } = current;
        emit('change', { ...rest, [key]: value });
      }
    };

    return () => {
      const isEasing = mode.value === 'easing';
      const isSimpleSpring = mode.value === 'simple';
      const currentSpring = spring();
      const currentEasing = easing();

      return h(Folder, { title: props.label, defaultOpen: true }, {
        default: () => [
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
            isEasing
              ? h(EasingVisualization, { easing: currentEasing })
              : h(SpringVisualization, { spring: currentSpring, isSimpleMode: isSimpleSpring }),
            h('div', { class: 'dialkit-labeled-control' }, [
              h('span', { class: 'dialkit-labeled-control-label' }, 'Type'),
              h(SegmentedControl, {
                options: [
                  { value: 'easing', label: 'Easing' },
                  { value: 'simple', label: 'Time' },
                  { value: 'advanced', label: 'Physics' },
                ],
                value: mode.value,
                onChange: handleModeChange,
              }),
            ]),
            ...(isEasing
              ? [
                h(Slider, { label: 'x1', value: currentEasing.ease[0], min: 0, max: 1, step: 0.01, onChange: (next: number) => updateEase(0, next) }),
                h(Slider, { label: 'y1', value: currentEasing.ease[1], min: -1, max: 2, step: 0.01, onChange: (next: number) => updateEase(1, next) }),
                h(Slider, { label: 'x2', value: currentEasing.ease[2], min: 0, max: 1, step: 0.01, onChange: (next: number) => updateEase(2, next) }),
                h(Slider, { label: 'y2', value: currentEasing.ease[3], min: -1, max: 2, step: 0.01, onChange: (next: number) => updateEase(3, next) }),
                h(Slider, {
                  label: 'Duration',
                  value: currentEasing.duration,
                  min: 0.1,
                  max: 2,
                  step: 0.05,
                  unit: 's',
                  onChange: (next: number) => emit('change', { ...currentEasing, duration: next }),
                }),
              ]
              : isSimpleSpring
                ? [
                  h(Slider, {
                    label: 'Duration',
                    value: currentSpring.visualDuration ?? 0.3,
                    min: 0.1,
                    max: 1,
                    step: 0.05,
                    unit: 's',
                    onChange: (next: number) => handleSpringUpdate('visualDuration', next),
                  }),
                  h(Slider, {
                    label: 'Bounce',
                    value: currentSpring.bounce ?? 0.2,
                    min: 0,
                    max: 1,
                    step: 0.05,
                    onChange: (next: number) => handleSpringUpdate('bounce', next),
                  }),
                ]
                : [
                  h(Slider, {
                    label: 'Stiffness',
                    value: currentSpring.stiffness ?? 400,
                    min: 1,
                    max: 1000,
                    step: 10,
                    onChange: (next: number) => handleSpringUpdate('stiffness', next),
                  }),
                  h(Slider, {
                    label: 'Damping',
                    value: currentSpring.damping ?? 17,
                    min: 1,
                    max: 100,
                    step: 1,
                    onChange: (next: number) => handleSpringUpdate('damping', next),
                  }),
                  h(Slider, {
                    label: 'Mass',
                    value: currentSpring.mass ?? 1,
                    min: 0.1,
                    max: 10,
                    step: 0.1,
                    onChange: (next: number) => handleSpringUpdate('mass', next),
                  }),
                ]),
          ]),
        ],
      });
    };
  },
});
