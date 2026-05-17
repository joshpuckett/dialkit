declare module '*.svelte' {
  import { SvelteComponent } from 'svelte';

  export default class Component<
    Props extends Record<string, unknown> = Record<string, unknown>,
    Events extends Record<string, unknown> = Record<string, unknown>,
    Slots extends Record<string, unknown> = Record<string, unknown>
  > extends SvelteComponent<Props, Events, Slots> {}
}
