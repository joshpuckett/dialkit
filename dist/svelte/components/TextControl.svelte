<script lang="ts">
  let { label, value, onChange, placeholder } = $props<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }>();
</script>

<div class="dialkit-text-control">
  <label class="dialkit-text-label">{label}</label>
  <input
    type="text"
    class="dialkit-text-input"
    value={value}
    placeholder={placeholder}
    oninput={(e) => onChange((e.currentTarget as HTMLInputElement).value)}
  />
</div>
