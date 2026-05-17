<script lang="ts">
  const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

  let { label, value, onChange } = $props<{
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>();

  let isEditing = $state(false);
  let editValue = $state(value);
  let colorInputRef: HTMLInputElement | undefined;

  const expandShorthandHex = (hex: string) => {
    if (hex.length !== 4) return hex;
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  };

  $effect(() => {
    value;
    if (!isEditing) {
      editValue = value;
    }
  });

  const handleTextSubmit = () => {
    isEditing = false;
    if (HEX_COLOR_REGEX.test(editValue)) {
      onChange(editValue);
    } else {
      editValue = value;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTextSubmit();
    } else if (e.key === 'Escape') {
      isEditing = false;
      editValue = value;
    }
  };
</script>

<div class="dialkit-color-control">
  <label class="dialkit-color-label">{label}</label>
  <div class="dialkit-color-inputs">
    {#if isEditing}
      <input
        type="text"
        class="dialkit-color-hex-input"
        value={editValue}
        oninput={(e) => (editValue = (e.currentTarget as HTMLInputElement).value)}
        onblur={handleTextSubmit}
        onkeydown={handleKeyDown}
        autofocus
      />
    {:else}
      <span class="dialkit-color-hex" onclick={() => (isEditing = true)}>
        {(value ?? '').toUpperCase()}
      </span>
    {/if}

    <button
      class="dialkit-color-swatch"
      style:background-color={value}
      onclick={() => colorInputRef?.click()}
      title="Pick color"
      aria-label={`Pick color for ${label}`}
    />

    <input
      bind:this={colorInputRef}
      type="color"
      class="dialkit-color-picker-native"
      aria-label={`${label} color picker`}
      value={value.length === 4 ? expandShorthandHex(value) : value.slice(0, 7)}
      oninput={(e) => onChange((e.currentTarget as HTMLInputElement).value)}
    />
  </div>
</div>
