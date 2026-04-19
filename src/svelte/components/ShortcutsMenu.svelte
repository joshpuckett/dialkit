<script lang="ts">
   import { DialStore } from "dialkit/store";
   import type { ShortcutConfig } from "dialkit/store";
   import Portal from "../Portal.svelte";

   let { panelId } = $props<{ panelId: string }>();

   let isOpen = $state(false);
   let triggerEl = $state<HTMLButtonElement | null>(null);
   let dropdownEl = $state<HTMLDivElement | null>(null);
   let pos = $state({ top: 0, right: 0 });

   function formatShortcutKey(sc: ShortcutConfig): string {
      if (!sc.key) return "\u2014";
      const mod =
         sc.modifier === "alt"
            ? "\u2325"
            : sc.modifier === "shift"
              ? "\u21E7"
              : sc.modifier === "meta"
                ? "\u2318"
                : "";
      return `${mod}${sc.key.toUpperCase()}`;
   }

   function formatInteraction(sc: ShortcutConfig): string {
      const interaction = sc.interaction ?? "scroll";
      switch (interaction) {
         case "scroll":
            return sc.key ? "key+scroll" : "scroll";
         case "drag":
            return "key+drag";
         case "move":
            return "key+move";
         case "scroll-only":
            return "scroll";
      }
   }

   function open() {
      const rect = triggerEl?.getBoundingClientRect();
      if (rect) {
         pos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
      }
      isOpen = true;
   }

   function close() {
      isOpen = false;
   }

   function toggle() {
      if (isOpen) close();
      else open();
   }

   // Close on mousedown outside
   $effect(() => {
      if (!isOpen) return;

      const handler = (e: MouseEvent) => {
         const target = e.target as Node;
         if (triggerEl?.contains(target) || dropdownEl?.contains(target))
            return;
         close();
      };

      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
   });

   const panel = $derived(DialStore.getPanel(panelId));

   const rows = $derived.by(() => {
      if (!panel) return [];
      const shortcuts = Object.entries(panel.shortcuts);
      if (shortcuts.length === 0) return [];

      return shortcuts.map(([path, shortcut]) => {
         const findLabel = (controls: typeof panel.controls): string => {
            for (const c of controls) {
               if (c.path === path) return c.label;
               if (c.type === "folder" && c.children) {
                  const found = findLabel(c.children);
                  if (found) return found;
               }
            }
            return path;
         };
         return { path, shortcut, label: findLabel(panel.controls) };
      });
   });
</script>

{#if panel && rows.length > 0}
   <button
      bind:this={triggerEl}
      class="dialkit-shortcuts-trigger"
      onclick={toggle}
      title="Keyboard shortcuts"
   >
      <svg
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round"
      >
         <rect x="2" y="6" width="20" height="12" rx="2" />
         <path d="M6 10H6.01" />
         <path d="M10 10H10.01" />
         <path d="M14 10H14.01" />
         <path d="M18 10H18.01" />
         <path d="M8 14H16" />
      </svg>
   </button>

   <Portal target="body">
      {#if isOpen}
         <div
            bind:this={dropdownEl}
            class="dialkit-root dialkit-shortcuts-dropdown"
            style:position="fixed"
            style:top="{pos.top}px"
            style:right="{pos.right}px"
         >
            <div class="dialkit-shortcuts-title">Keyboard Shortcuts</div>
            <div class="dialkit-shortcuts-list">
               {#each rows as row (row.path)}
                  <div class="dialkit-shortcuts-row">
                     <span class="dialkit-shortcuts-row-key">
                        {formatShortcutKey(row.shortcut)}
                     </span>
                     <span class="dialkit-shortcuts-row-label">{row.label}</span
                     >
                     <span class="dialkit-shortcuts-row-mode"
                        >{formatInteraction(row.shortcut)}</span
                     >
                  </div>
               {/each}
            </div>
            <div class="dialkit-shortcuts-hint">
               See pill badges on controls for keys
            </div>
         </div>
      {/if}
   </Portal>
{/if}
