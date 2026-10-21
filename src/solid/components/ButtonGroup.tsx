import { For } from 'solid-js';

interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    onClick: () => void;
  }>;
}

export function ButtonGroup(props: ButtonGroupProps) {
  return (
    <div class="dialkit-button-group">
      <For each={props.buttons}>
        {(button) => (
          <button type="button" class="dialkit-button" onClick={button.onClick}>
            {button.label}
          </button>
        )}
      </For>
    </div>
  );
}
