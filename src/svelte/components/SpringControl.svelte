<script lang="ts">
   import { untrack } from "svelte";
   import { DialStore } from "dialkit/store";
   import type { SpringConfig } from "dialkit/store";
   import Folder from "./Folder.svelte";
   import Slider from "./Slider.svelte";
   import SegmentedControl from "./SegmentedControl.svelte";
   import SpringVisualization from "./SpringVisualization.svelte";

   let { panelId, path, label, spring, onChange } = $props<{
      panelId: string;
      path: string;
      label: string;
      spring: SpringConfig;
      onChange: (spring: SpringConfig) => void;
   }>();

   let mode = $state<"simple" | "advanced">(
      untrack(() => DialStore.getSpringMode(panelId, path)),
   );

   const initialSpring = untrack(() => spring);

   $effect(() => {
      const syncMode = () => {
         mode = DialStore.getSpringMode(panelId, path);
      };
      syncMode();
      return DialStore.subscribe(panelId, syncMode);
   });

   const isSimpleMode = $derived(mode === "simple");

   const cache: {
      simple: SpringConfig;
      advanced: SpringConfig;
   } = {
      simple:
         initialSpring.visualDuration !== undefined
            ? initialSpring
            : { type: "spring", visualDuration: 0.3, bounce: 0.2 },
      advanced:
         initialSpring.stiffness !== undefined
            ? initialSpring
            : { type: "spring", stiffness: 200, damping: 25, mass: 1 },
   };

   const handleModeChange = (newMode: string) => {
      const typedMode = newMode as "simple" | "advanced";

      if (isSimpleMode) {
         cache.simple = spring;
      } else {
         cache.advanced = spring;
      }

      DialStore.updateSpringMode(panelId, path, typedMode);

      if (typedMode === "simple") {
         onChange(cache.simple);
      } else {
         onChange(cache.advanced);
      }
   };

   const handleUpdate = (key: keyof SpringConfig, value: number) => {
      if (isSimpleMode) {
         const { stiffness, damping, mass, ...rest } = spring;
         onChange({ ...rest, [key]: value });
      } else {
         const { visualDuration, bounce, ...rest } = spring;
         onChange({ ...rest, [key]: value });
      }
   };
</script>

<Folder title={label} defaultOpen={true}>
   <div style="display: flex; flex-direction: column; gap: 6px;">
      <SpringVisualization {spring} {isSimpleMode} />

      <div class="dialkit-labeled-control">
         <span class="dialkit-labeled-control-label">Type</span>
         <SegmentedControl
            options={[
               { value: "simple", label: "Time" },
               { value: "advanced", label: "Physics" },
            ]}
            value={mode}
            onChange={handleModeChange}
         />
      </div>

      {#if isSimpleMode}
         <Slider
            label="Duration"
            value={spring.visualDuration ?? 0.3}
            onChange={(v) => handleUpdate("visualDuration", v)}
            min={0.1}
            max={1}
            step={0.05}
            unit="s"
         />
         <Slider
            label="Bounce"
            value={spring.bounce ?? 0.2}
            onChange={(v) => handleUpdate("bounce", v)}
            min={0}
            max={1}
            step={0.05}
         />
      {:else}
         <Slider
            label="Stiffness"
            value={spring.stiffness ?? 400}
            onChange={(v) => handleUpdate("stiffness", v)}
            min={1}
            max={1000}
            step={10}
         />
         <Slider
            label="Damping"
            value={spring.damping ?? 17}
            onChange={(v) => handleUpdate("damping", v)}
            min={1}
            max={100}
            step={1}
         />
         <Slider
            label="Mass"
            value={spring.mass ?? 1}
            onChange={(v) => handleUpdate("mass", v)}
            min={0.1}
            max={10}
            step={0.1}
         />
      {/if}
   </div>
</Folder>
