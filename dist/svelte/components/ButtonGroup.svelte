<script lang="ts">
  export type ButtonAction = {
    label: string;
    onClick: () => void;
  };

  let { buttons } = $props<{ buttons: ButtonAction[] }>();
</script>

<div class="dialkit-button-group">
  {#each buttons as button (button.label)}
    <button class="dialkit-button" onclick={button.onClick}>
      {button.label}
    </button>
  {/each}
</div>
