import { formatEase, parseEase } from '../../easing-geometry';
import { defineComponent, h, onMounted, onUnmounted, ref, watch, type PropType } from 'vue';
import { DialStore, SPRING_DEFAULTS, isPhysicsSpring } from '../../store/DialStore';
import type { EasingConfig, SpringConfig, TransitionConfig } from '../../store/DialStore';
import { Folder } from './Folder';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';
import { SpringVisualization } from './SpringVisualization';
import { EasingVisualization } from './EasingVisualization';

type CurveMode = 'easing' | 'simple' | 'advanced';

export interface TransitionDurationControl {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const EaseTextInput = defineComponent({
  name: 'DialKitEaseTextInput',
  props: {
    ease: {
      type: Array as unknown as PropType<[number, number, number, number]>,
      required: true,
    },
    onChange: {
      type: Function as PropType<(ease: [number, number, number, number]) => void>,
      required: true,
    },
  },
  setup(props) {
    const editing = ref(false);
    const draft = ref('');

    const handleFocus = () => {
      draft.value = formatEase(props.ease);
      editing.value = true;
    };

    const handleBlur = () => {
      const parsed = parseEase(draft.value);
      if (parsed) props.onChange(parsed);
      editing.value = false;
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        (event.target as HTMLInputElement).blur();
      }
    };

    return () => h('div', { class: 'dialkit-labeled-control' }, [
      h('span', { class: 'dialkit-labeled-control-label' }, 'Ease'),
      h('input', {
        type: 'text',
        'aria-label': 'Bézier coordinates',
        class: 'dialkit-text-input',
        value: editing.value ? draft.value : formatEase(props.ease),
        spellcheck: false,
        onInput: (event: Event) => {
          draft.value = (event.target as HTMLInputElement).value;
        },
        onFocus: handleFocus,
        onBlur: handleBlur,
        onKeydown: handleKeydown,
      }),
    ]);
  },
});

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
    hideDuration: { type: Boolean, default: false },
    durationControl: Object as PropType<TransitionDurationControl>,
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

    // Per-mode values, so switching back restores previous edits. A value only
    // ever lands in the slot of its own kind, whatever the mode says right now.
    const cache: { easing: EasingConfig; simple: SpringConfig; advanced: SpringConfig } = {
      easing: { type: 'easing', duration: 0.3, ease: [1, -0.4, 0.5, 1] },
      simple: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
      advanced: { type: 'spring', stiffness: 200, damping: 25, mass: 1 },
    };
    const remember = (value: TransitionConfig) => {
      if (value.type === 'easing') cache.easing = value;
      else cache[isPhysicsSpring(value) ? 'advanced' : 'simple'] = value;
    };
    remember(props.value);
    watch(() => props.value, remember);

    const spring = (): SpringConfig => (props.value.type === 'spring' ? props.value : cache.simple);
    const easing = (): EasingConfig => (props.value.type === 'easing' ? props.value : cache.easing);

    // The mode follows the value, so switching mode is writing that mode's value.
    const handleModeChange = (nextMode: CurveMode) => emit('change', cache[nextMode]);

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
      const durationSlider = !props.hideDuration && (isEasing || isSimpleSpring)
        ? h(Slider, {
          label: 'Duration',
          value: props.durationControl?.value ?? (isEasing ? currentEasing.duration : currentSpring.visualDuration ?? SPRING_DEFAULTS.visualDuration),
          min: props.durationControl?.min ?? 0.1,
          max: props.durationControl?.max ?? (isEasing ? 2 : 1),
          step: props.durationControl?.step ?? 0.05,
          unit: 's',
          onChange: props.durationControl?.onChange ?? ((next: number) => {
            if (isEasing) emit('change', { ...currentEasing, duration: next });
            else handleSpringUpdate('visualDuration', next);
          }),
        })
        : null;

      return h(Folder, { title: props.label, defaultOpen: true }, {
        default: () => [
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
            isEasing
              ? h(EasingVisualization, { easing: currentEasing, onChange: (ease: EasingConfig['ease']) => emit('change', { ...currentEasing, ease }) })
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
                h(EaseTextInput, {
                  ease: currentEasing.ease,
                  onChange: (next: [number, number, number, number]) => emit('change', { ...currentEasing, ease: next }),
                }),
              ]
              : isSimpleSpring
                ? [
                  h(Slider, {
                    label: 'Bounce',
                    value: currentSpring.bounce ?? SPRING_DEFAULTS.bounce,
                    min: 0,
                    max: 1,
                    step: 0.05,
                    onChange: (next: number) => handleSpringUpdate('bounce', next),
                  }),
                ]
                : [
                  h(Slider, {
                    label: 'Stiffness',
                    value: currentSpring.stiffness ?? SPRING_DEFAULTS.stiffness,
                    min: 1,
                    max: 1000,
                    step: 10,
                    onChange: (next: number) => handleSpringUpdate('stiffness', next),
                  }),
                  h(Slider, {
                    label: 'Damping',
                    value: currentSpring.damping ?? SPRING_DEFAULTS.damping,
                    min: 1,
                    max: 100,
                    step: 1,
                    onChange: (next: number) => handleSpringUpdate('damping', next),
                  }),
                  h(Slider, {
                    label: 'Mass',
                    value: currentSpring.mass ?? SPRING_DEFAULTS.mass,
                    min: 0.1,
                    max: 10,
                    step: 0.1,
                    onChange: (next: number) => handleSpringUpdate('mass', next),
                  }),
                ]),
            durationSlider,
          ]),
        ],
      });
    };
  },
});
