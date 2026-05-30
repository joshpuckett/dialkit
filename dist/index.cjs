"use client";
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ButtonGroup: () => ButtonGroup,
  ColorControl: () => ColorControl,
  DialRoot: () => DialRoot,
  DialStore: () => DialStore,
  EasingVisualization: () => EasingVisualization,
  Folder: () => Folder,
  PresetManager: () => PresetManager,
  SelectControl: () => SelectControl,
  ShortcutsMenu: () => ShortcutsMenu,
  Slider: () => Slider,
  SpringControl: () => SpringControl,
  SpringVisualization: () => SpringVisualization,
  TextControl: () => TextControl,
  Toggle: () => Toggle,
  TransitionControl: () => TransitionControl,
  unwrapVisibility: () => unwrapVisibility,
  useDialKit: () => useDialKit,
  withVisibility: () => withVisibility
});
module.exports = __toCommonJS(index_exports);

// src/hooks/useDialKit.ts
var import_react = require("react");

// src/store/DialStore.ts
function withVisibility(control, rule) {
  return { value: control, visibleWhen: rule };
}
function unwrapVisibility(raw) {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "value" in raw && "visibleWhen" in raw) {
    return raw.value;
  }
  return raw;
}
var EMPTY_VALUES = Object.freeze({});
var DialStoreClass = class {
  constructor() {
    this.panels = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
    this.globalListeners = /* @__PURE__ */ new Set();
    this.snapshots = /* @__PURE__ */ new Map();
    this.actionListeners = /* @__PURE__ */ new Map();
    this.presets = /* @__PURE__ */ new Map();
    this.activePreset = /* @__PURE__ */ new Map();
    this.baseValues = /* @__PURE__ */ new Map();
    /**
     * Full (unfiltered) control tree per panel. `panels[id].controls` holds the
     * tree with conditional-visibility controls already filtered out, which is
     * what the UI renders. We keep the unfiltered tree here so visibility can
     * flip back when a dependent value changes.
     */
    this.allControls = /* @__PURE__ */ new Map();
  }
  registerPanel(id, name, config, shortcuts) {
    const allControls = this.parseConfig(config, "", shortcuts);
    const values = this.flattenValues(config, "");
    this.initTransitionModes(config, "", values);
    this.allControls.set(id, allControls);
    const controls = this.filterByVisibility(allControls, values);
    this.panels.set(id, { id, name, controls, values, shortcuts: shortcuts ?? {} });
    this.snapshots.set(id, { ...values });
    this.baseValues.set(id, { ...values });
    this.notifyGlobal();
  }
  updatePanel(id, name, config, shortcuts) {
    const existing = this.panels.get(id);
    if (!existing) {
      this.registerPanel(id, name, config, shortcuts);
      return;
    }
    const allControls = this.parseConfig(config, "", shortcuts);
    const controlsByPath = this.mapControlsByPath(allControls);
    const defaultValues = this.flattenValues(config, "");
    const nextValues = {};
    for (const [path, defaultValue] of Object.entries(defaultValues)) {
      nextValues[path] = this.normalizePreservedValue(
        existing.values[path],
        defaultValue,
        controlsByPath.get(path)
      );
    }
    this.initTransitionModes(config, "", nextValues);
    for (const [path, mode] of Object.entries(existing.values)) {
      if (!path.endsWith(".__mode")) {
        continue;
      }
      const transitionPath = path.slice(0, -"__mode".length - 1);
      const transitionControl = controlsByPath.get(transitionPath);
      if (transitionControl?.type === "transition") {
        nextValues[path] = mode;
      }
    }
    this.allControls.set(id, allControls);
    const controls = this.filterByVisibility(allControls, nextValues);
    const nextPanel = { id, name, controls, values: nextValues, shortcuts: shortcuts ?? existing.shortcuts };
    this.panels.set(id, nextPanel);
    this.snapshots.set(id, { ...nextValues });
    const previousBaseValues = this.baseValues.get(id) ?? {};
    const nextBaseValues = {};
    for (const [path, defaultValue] of Object.entries(defaultValues)) {
      nextBaseValues[path] = this.normalizePreservedValue(
        previousBaseValues[path],
        defaultValue,
        controlsByPath.get(path)
      );
    }
    for (const [path, value] of Object.entries(nextValues)) {
      if (path.endsWith(".__mode")) {
        nextBaseValues[path] = value;
      }
    }
    this.baseValues.set(id, nextBaseValues);
    this.notify(id);
    this.notifyGlobal();
  }
  unregisterPanel(id) {
    this.panels.delete(id);
    this.listeners.delete(id);
    this.snapshots.delete(id);
    this.actionListeners.delete(id);
    this.baseValues.delete(id);
    this.allControls.delete(id);
    this.notifyGlobal();
  }
  updateValue(panelId, path, value) {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    panel.values[path] = value;
    const activeId = this.activePreset.get(panelId);
    if (activeId) {
      const presets = this.presets.get(panelId) ?? [];
      const preset = presets.find((p) => p.id === activeId);
      if (preset) preset.values[path] = value;
    } else {
      const base = this.baseValues.get(panelId);
      if (base) base[path] = value;
    }
    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);
    const allControls = this.allControls.get(panelId);
    if (!allControls) return;
    const nextControls = this.filterByVisibility(allControls, panel.values);
    if (!this.sameControlPaths(panel.controls, nextControls)) {
      panel.controls = nextControls;
      this.notifyGlobal();
    }
  }
  updateSpringMode(panelId, path, mode) {
    this.updateTransitionMode(panelId, path, mode);
  }
  getSpringMode(panelId, path) {
    const mode = this.getTransitionMode(panelId, path);
    if (mode === "easing") return "simple";
    return mode;
  }
  updateTransitionMode(panelId, path, mode) {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    const modePath = `${path}.__mode`;
    panel.values[modePath] = mode;
    const activeId = this.activePreset.get(panelId);
    if (activeId) {
      const presets = this.presets.get(panelId) ?? [];
      const preset = presets.find((p) => p.id === activeId);
      if (preset) preset.values[modePath] = mode;
    } else {
      const base = this.baseValues.get(panelId);
      if (base) base[modePath] = mode;
    }
    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);
  }
  getTransitionMode(panelId, path) {
    const panel = this.panels.get(panelId);
    if (!panel) return "simple";
    return panel.values[`${path}.__mode`] || "simple";
  }
  getValue(panelId, path) {
    const panel = this.panels.get(panelId);
    return panel?.values[path];
  }
  getValues(panelId) {
    return this.snapshots.get(panelId) ?? EMPTY_VALUES;
  }
  getPanels() {
    return Array.from(this.panels.values());
  }
  getPanel(id) {
    return this.panels.get(id);
  }
  subscribe(panelId, listener) {
    if (!this.listeners.has(panelId)) {
      this.listeners.set(panelId, /* @__PURE__ */ new Set());
    }
    this.listeners.get(panelId).add(listener);
    return () => {
      this.listeners.get(panelId)?.delete(listener);
    };
  }
  subscribeGlobal(listener) {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }
  subscribeActions(panelId, listener) {
    if (!this.actionListeners.has(panelId)) {
      this.actionListeners.set(panelId, /* @__PURE__ */ new Set());
    }
    this.actionListeners.get(panelId).add(listener);
    return () => {
      this.actionListeners.get(panelId)?.delete(listener);
    };
  }
  triggerAction(panelId, path) {
    this.actionListeners.get(panelId)?.forEach((fn) => fn(path));
  }
  savePreset(panelId, name) {
    const panel = this.panels.get(panelId);
    if (!panel) throw new Error(`Panel ${panelId} not found`);
    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const preset = {
      id,
      name,
      values: { ...panel.values }
    };
    const existing = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, [...existing, preset]);
    this.activePreset.set(panelId, id);
    this.snapshots.set(panelId, { ...panel.values });
    this.notify(panelId);
    return id;
  }
  loadPreset(panelId, presetId) {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    const presets = this.presets.get(panelId) ?? [];
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    panel.values = { ...preset.values };
    this.snapshots.set(panelId, { ...panel.values });
    this.activePreset.set(panelId, presetId);
    const allControls = this.allControls.get(panelId);
    if (allControls) {
      const nextControls = this.filterByVisibility(allControls, panel.values);
      if (!this.sameControlPaths(panel.controls, nextControls)) {
        panel.controls = nextControls;
        this.notifyGlobal();
      }
    }
    this.notify(panelId);
  }
  deletePreset(panelId, presetId) {
    const presets = this.presets.get(panelId) ?? [];
    this.presets.set(panelId, presets.filter((p) => p.id !== presetId));
    if (this.activePreset.get(panelId) === presetId) {
      this.activePreset.set(panelId, null);
    }
    const panel = this.panels.get(panelId);
    if (panel) {
      this.snapshots.set(panelId, { ...panel.values });
    }
    this.notify(panelId);
  }
  getPresets(panelId) {
    return this.presets.get(panelId) ?? [];
  }
  getActivePresetId(panelId) {
    return this.activePreset.get(panelId) ?? null;
  }
  clearActivePreset(panelId) {
    const panel = this.panels.get(panelId);
    const base = this.baseValues.get(panelId);
    if (panel && base) {
      panel.values = { ...base };
      this.snapshots.set(panelId, { ...panel.values });
      const allControls = this.allControls.get(panelId);
      if (allControls) {
        const nextControls = this.filterByVisibility(allControls, panel.values);
        if (!this.sameControlPaths(panel.controls, nextControls)) {
          panel.controls = nextControls;
          this.notifyGlobal();
        }
      }
    }
    this.activePreset.set(panelId, null);
    this.notify(panelId);
  }
  resolveShortcutTarget(key, modifier) {
    for (const panel of this.panels.values()) {
      for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
        if (!shortcut.key) continue;
        if (shortcut.key.toLowerCase() !== key.toLowerCase()) continue;
        const scMod = shortcut.modifier ?? void 0;
        if (scMod !== modifier) continue;
        const control = this.findControlByPath(panel.controls, path);
        if (control) {
          return { panelId: panel.id, path, control };
        }
      }
    }
    return null;
  }
  resolveScrollOnlyTargets() {
    const results = [];
    for (const panel of this.panels.values()) {
      for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
        if ((shortcut.interaction ?? "scroll") !== "scroll-only") continue;
        const control = this.findControlByPath(panel.controls, path);
        if (control) {
          results.push({ panelId: panel.id, path, control, shortcut });
        }
      }
    }
    return results;
  }
  findControlByPath(controls, path) {
    for (const control of controls) {
      if (control.path === path) return control;
      if (control.type === "folder" && control.children) {
        const found = this.findControlByPath(control.children, path);
        if (found) return found;
      }
    }
    return null;
  }
  notify(panelId) {
    this.listeners.get(panelId)?.forEach((fn) => fn());
  }
  notifyGlobal() {
    this.globalListeners.forEach((fn) => fn());
  }
  initTransitionModes(config, prefix, values) {
    for (const [key, rawValue] of Object.entries(config)) {
      if (key === "_collapsed") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const value = this.unwrapVisibilityWithRule(rawValue).value;
      if (this.isEasingConfig(value)) {
        values[`${path}.__mode`] = "easing";
      } else if (this.isSpringConfig(value)) {
        const hasPhysics = value.stiffness !== void 0 || value.damping !== void 0 || value.mass !== void 0;
        const hasTime = value.visualDuration !== void 0 || value.bounce !== void 0;
        values[`${path}.__mode`] = hasPhysics && !hasTime ? "advanced" : "simple";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value) && !this.isActionConfig(value) && !this.isSelectConfig(value) && !this.isColorConfig(value) && !this.isTextConfig(value)) {
        this.initTransitionModes(value, path, values);
      }
    }
  }
  parseConfig(config, prefix, shortcuts) {
    const controls = [];
    const startLen = () => controls.length;
    const tagLast = (visibleWhen, before) => {
      if (!visibleWhen) return;
      for (let i = before; i < controls.length; i++) {
        if (!controls[i].visibleWhen) controls[i].visibleWhen = visibleWhen;
      }
    };
    for (const [key, rawValue] of Object.entries(config)) {
      if (key === "_collapsed") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const label = this.formatLabel(key);
      const shortcut = shortcuts?.[path];
      const unwrapped = this.unwrapVisibilityWithRule(rawValue);
      const value = unwrapped.value;
      const visibleWhen = unwrapped.visibleWhen;
      const before = startLen();
      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === "number") {
        controls.push({
          type: "slider",
          path,
          label,
          min: value[1],
          max: value[2],
          step: value[3] ?? this.inferStep(value[1], value[2]),
          shortcut
        });
      } else if (typeof value === "number") {
        const { min, max, step } = this.inferRange(value);
        controls.push({ type: "slider", path, label, min, max, step, shortcut });
      } else if (typeof value === "boolean") {
        controls.push({ type: "toggle", path, label, shortcut });
      } else if (this.isSpringConfig(value) || this.isEasingConfig(value)) {
        controls.push({ type: "transition", path, label });
      } else if (this.isActionConfig(value)) {
        controls.push({ type: "action", path, label: value.label || label });
      } else if (this.isSelectConfig(value)) {
        controls.push({ type: "select", path, label, options: value.options });
      } else if (this.isColorConfig(value)) {
        controls.push({ type: "color", path, label });
      } else if (this.isTextConfig(value)) {
        controls.push({ type: "text", path, label, placeholder: value.placeholder });
      } else if (typeof value === "string") {
        if (this.isHexColor(value)) {
          controls.push({ type: "color", path, label });
        } else {
          controls.push({ type: "text", path, label });
        }
      } else if (typeof value === "object" && value !== null) {
        const folderConfig = value;
        const defaultOpen = "_collapsed" in folderConfig ? !folderConfig._collapsed : true;
        controls.push({
          type: "folder",
          path,
          label,
          defaultOpen,
          children: this.parseConfig(folderConfig, path, shortcuts)
        });
      }
      tagLast(visibleWhen, before);
    }
    return controls;
  }
  flattenValues(config, prefix) {
    const values = {};
    for (const [key, rawValue] of Object.entries(config)) {
      if (key === "_collapsed") continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const value = this.unwrapVisibilityWithRule(rawValue).value;
      if (Array.isArray(value) && value.length <= 4 && typeof value[0] === "number") {
        values[path] = value[0];
      } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
        values[path] = value;
      } else if (this.isSpringConfig(value) || this.isEasingConfig(value)) {
        values[path] = value;
      } else if (this.isActionConfig(value)) {
        values[path] = value;
      } else if (this.isSelectConfig(value)) {
        const firstOption = value.options[0];
        const firstValue = typeof firstOption === "string" ? firstOption : firstOption.value;
        values[path] = value.default ?? firstValue;
      } else if (this.isColorConfig(value)) {
        values[path] = value.default ?? "#000000";
      } else if (this.isTextConfig(value)) {
        values[path] = value.default ?? "";
      } else if (typeof value === "object" && value !== null) {
        Object.assign(values, this.flattenValues(value, path));
      }
    }
    return values;
  }
  isSpringConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "spring";
  }
  isEasingConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "easing";
  }
  isActionConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "action";
  }
  isSelectConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "select" && "options" in value && Array.isArray(value.options);
  }
  isColorConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "color";
  }
  isTextConfig(value) {
    return typeof value === "object" && value !== null && "type" in value && value.type === "text";
  }
  isHexColor(value) {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
  }
  formatLabel(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).trim();
  }
  inferRange(value) {
    if (value >= 0 && value <= 1) {
      return { min: 0, max: 1, step: 0.01 };
    } else if (value >= 0 && value <= 10) {
      return { min: 0, max: value * 3 || 10, step: 0.1 };
    } else if (value >= 0 && value <= 100) {
      return { min: 0, max: value * 3 || 100, step: 1 };
    } else if (value >= 0) {
      return { min: 0, max: value * 3 || 1e3, step: 10 };
    } else {
      return { min: value * 3, max: -value * 3, step: 1 };
    }
  }
  inferStep(min, max) {
    const range = max - min;
    if (range <= 1) return 0.01;
    if (range <= 10) return 0.1;
    if (range <= 100) return 1;
    return 10;
  }
  normalizePreservedValue(existingValue, defaultValue, control) {
    if (existingValue === void 0 || !control) {
      return defaultValue;
    }
    switch (control.type) {
      case "slider": {
        if (typeof existingValue !== "number" || typeof defaultValue !== "number") {
          return defaultValue;
        }
        const min = control.min ?? Number.NEGATIVE_INFINITY;
        const max = control.max ?? Number.POSITIVE_INFINITY;
        const clamped = Math.min(max, Math.max(min, existingValue));
        if (typeof control.step !== "number" || control.step <= 0) {
          return clamped;
        }
        return this.roundToStep(clamped, min, max, control.step);
      }
      case "toggle":
        return typeof existingValue === "boolean" ? existingValue : defaultValue;
      case "select": {
        if (typeof existingValue !== "string") {
          return defaultValue;
        }
        const options = control.options ?? [];
        const validValues = new Set(options.map((option) => typeof option === "string" ? option : option.value));
        return validValues.has(existingValue) ? existingValue : defaultValue;
      }
      case "color":
      case "text":
        return typeof existingValue === "string" ? existingValue : defaultValue;
      case "transition":
        if (this.isSpringConfig(defaultValue)) {
          return this.isSpringConfig(existingValue) ? existingValue : defaultValue;
        }
        if (this.isEasingConfig(defaultValue)) {
          return this.isEasingConfig(existingValue) ? existingValue : defaultValue;
        }
        return defaultValue;
      case "action":
        return defaultValue;
      default:
        return defaultValue;
    }
  }
  roundToStep(value, min, max, step) {
    const snapped = min + Math.round((value - min) / step) * step;
    const clamped = Math.min(max, Math.max(min, snapped));
    const precision = this.stepPrecision(step);
    return Number(clamped.toFixed(precision));
  }
  stepPrecision(step) {
    const text = String(step);
    const decimalIndex = text.indexOf(".");
    return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
  }
  mapControlsByPath(controls) {
    const map = /* @__PURE__ */ new Map();
    const visit = (nodes) => {
      for (const node of nodes) {
        if (node.type === "folder" && node.children) {
          visit(node.children);
          continue;
        }
        map.set(node.path, node);
      }
    };
    visit(controls);
    return map;
  }
  // ─── Conditional visibility ──────────────────────────────────────
  /**
   * Detects and unwraps a `{ value, visibleWhen }` wrapper produced by
   * {@link withVisibility}. Returns the inner control plus the rule (or
   * `undefined` for `visibleWhen` if the input was not a wrapper).
   */
  unwrapVisibilityWithRule(raw) {
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw) && "value" in raw && "visibleWhen" in raw) {
      const wrapper = raw;
      return { value: wrapper.value, visibleWhen: wrapper.visibleWhen };
    }
    return { value: raw, visibleWhen: void 0 };
  }
  /** Evaluate a visibility rule against a flat value map. */
  isVisible(rule, values) {
    if (!rule) return true;
    const actual = values[rule.field];
    if (actual === void 0 && !(rule.field in values)) {
      if (typeof globalThis !== "undefined" && typeof console !== "undefined") {
        console.warn(
          `[DialKit] visibleWhen references field "${rule.field}" which does not exist in the panel's values. The control will default to visible. Check for typos \u2014 field must be the full dot-delimited store path.`
        );
      }
    }
    if (rule.is !== void 0) {
      const targets = Array.isArray(rule.is) ? rule.is : [rule.is];
      return targets.some((t) => t === actual);
    }
    if (rule.not !== void 0) {
      const targets = Array.isArray(rule.not) ? rule.not : [rule.not];
      return !targets.some((t) => t === actual);
    }
    return true;
  }
  /**
   * Recursively filter a control tree by evaluating each control's
   * `visibleWhen` against the current values. Folders that become empty
   * after filtering their children are pruned.
   *
   * KNOWN LIMITATION — folder collapsed state across hide/show cycles:
   * Folder open/closed state lives in `Folder`'s local `useState`, not in
   * the store. When a folder's `visibleWhen` fails, its DOM node unmounts
   * and that local state is lost. Re-showing the folder mounts a fresh
   * instance with `defaultOpen`, so a user-collapsed folder will re-open
   * after a visibility cycle. Sibling visibility changes do NOT trigger
   * this (motion.div keys are stable by path), only the wrapped folder
   * itself hiding. This is a pre-existing architectural constraint of
   * DialKit's folder state model, not introduced by this feature — any
   * mechanism that unmounts a folder would behave the same. Lifting
   * folder state into the store is a possible follow-up.
   */
  filterByVisibility(controls, values) {
    const result = [];
    for (const control of controls) {
      if (!this.isVisible(control.visibleWhen, values)) continue;
      if (control.type === "folder" && control.children) {
        const filteredChildren = this.filterByVisibility(control.children, values);
        if (filteredChildren.length === 0) continue;
        result.push({ ...control, children: filteredChildren });
      } else {
        result.push(control);
      }
    }
    return result;
  }
  /**
   * Cheap structural comparison used to decide whether visibility flipped
   * after an updateValue. We only care about the set of visible paths —
   * labels/options/etc can't change between snapshots of the same tree.
   */
  sameControlPaths(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ca = a[i];
      const cb = b[i];
      if (ca.path !== cb.path || ca.type !== cb.type) return false;
      if (ca.type === "folder") {
        const childrenA = ca.children ?? [];
        const childrenB = cb.children ?? [];
        if (!this.sameControlPaths(childrenA, childrenB)) return false;
      }
    }
    return true;
  }
};
var DialStore = new DialStoreClass();

// src/hooks/useDialKit.ts
function useDialKit(name, config, options) {
  const instanceId = (0, import_react.useId)();
  const panelId = `${name}-${instanceId}`;
  const configRef = (0, import_react.useRef)(config);
  const serializedConfig = JSON.stringify(config);
  configRef.current = config;
  const onActionRef = (0, import_react.useRef)(options?.onAction);
  onActionRef.current = options?.onAction;
  const shortcutsRef = (0, import_react.useRef)(options?.shortcuts);
  shortcutsRef.current = options?.shortcuts;
  const serializedShortcuts = JSON.stringify(options?.shortcuts);
  (0, import_react.useEffect)(() => {
    DialStore.registerPanel(panelId, name, configRef.current, shortcutsRef.current);
    return () => DialStore.unregisterPanel(panelId);
  }, [panelId, name]);
  const mountedRef = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    DialStore.updatePanel(panelId, name, configRef.current, shortcutsRef.current);
  }, [panelId, name, serializedConfig, serializedShortcuts]);
  (0, import_react.useEffect)(() => {
    return DialStore.subscribeActions(panelId, (action) => {
      onActionRef.current?.(action);
    });
  }, [panelId]);
  const values = (0, import_react.useSyncExternalStore)(
    (callback) => DialStore.subscribe(panelId, callback),
    () => DialStore.getValues(panelId),
    () => DialStore.getValues(panelId)
  );
  return buildResolvedValues(config, values, "");
}
function buildResolvedValues(config, flatValues, prefix) {
  const result = {};
  for (const [key, rawConfigValue] of Object.entries(config)) {
    if (key === "_collapsed") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const configValue = unwrapVisibility(rawConfigValue);
    if (Array.isArray(configValue) && configValue.length <= 4 && typeof configValue[0] === "number") {
      result[key] = flatValues[path] ?? configValue[0];
    } else if (typeof configValue === "number" || typeof configValue === "boolean" || typeof configValue === "string") {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSpringConfig(configValue) || isEasingConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isActionConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue;
    } else if (isSelectConfig(configValue)) {
      const defaultValue = configValue.default ?? getFirstOptionValue(configValue.options);
      result[key] = flatValues[path] ?? defaultValue;
    } else if (isColorConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue.default ?? "#000000";
    } else if (isTextConfig(configValue)) {
      result[key] = flatValues[path] ?? configValue.default ?? "";
    } else if (typeof configValue === "object" && configValue !== null) {
      result[key] = buildResolvedValues(configValue, flatValues, path);
    }
  }
  return result;
}
function hasType(value, type) {
  return typeof value === "object" && value !== null && "type" in value && value.type === type;
}
function isSpringConfig(value) {
  return hasType(value, "spring");
}
function isEasingConfig(value) {
  return hasType(value, "easing");
}
function isActionConfig(value) {
  return hasType(value, "action");
}
function isSelectConfig(value) {
  return hasType(value, "select") && "options" in value && Array.isArray(value.options);
}
function isColorConfig(value) {
  return hasType(value, "color");
}
function isTextConfig(value) {
  return hasType(value, "text");
}
function getFirstOptionValue(options) {
  const first = options[0];
  return typeof first === "string" ? first : first.value;
}

// src/components/DialRoot.tsx
var import_react18 = require("react");
var import_react_dom3 = require("react-dom");

// src/components/Panel.tsx
var import_react16 = require("react");
var import_react17 = require("motion/react");

// src/components/control-motion.ts
var CONTROL_ANIM = {
  initial: { opacity: 0, height: 0, marginBottom: -6 },
  animate: { opacity: 1, height: "auto", marginBottom: 0 },
  exit: { opacity: 0, height: 0, marginBottom: -6 },
  transition: {
    type: "spring",
    visualDuration: 0.25,
    bounce: 0.1
  },
  style: { overflow: "hidden" }
};

// src/components/ShortcutListener.tsx
var import_react2 = require("react");

// src/shortcut-utils.ts
function decimalsForStep(step) {
  const s = step.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}
function roundValue(val, step) {
  const raw = Math.round(val / step) * step;
  return parseFloat(raw.toFixed(decimalsForStep(step)));
}
function getEffectiveStep(control, shortcut) {
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const range = max - min;
  const mode = shortcut.mode ?? "normal";
  return mode === "fine" ? range * 0.01 : mode === "coarse" ? range * 0.1 : control.step ?? 1;
}
function applySliderDelta(panelId, path, control, effectiveStep, direction) {
  const currentValue = DialStore.getValue(panelId, path);
  const min = control.min ?? 0;
  const max = control.max ?? 1;
  const newValue = Math.max(min, Math.min(max, currentValue + direction * effectiveStep));
  DialStore.updateValue(panelId, path, roundValue(newValue, effectiveStep));
}
function snapToDecile(rawValue, min, max) {
  const normalized = (rawValue - min) / (max - min);
  const nearest = Math.round(normalized * 10) / 10;
  if (Math.abs(normalized - nearest) <= 0.03125) {
    return min + nearest * (max - min);
  }
  return rawValue;
}
function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.contentEditable === "true") return true;
  return false;
}
function getActiveModifier(e) {
  if (e.altKey) return "alt";
  if (e.shiftKey) return "shift";
  if (e.metaKey) return "meta";
  return void 0;
}
function findControl(controls, path) {
  for (const control of controls) {
    if (control.path === path) return control;
    if (control.type === "folder" && control.children) {
      const found = findControl(control.children, path);
      if (found) return found;
    }
  }
  return null;
}
var DRAG_SENSITIVITY = 4;
function formatInteractionLabel(interaction) {
  switch (interaction) {
    case "drag":
      return "Drag";
    case "move":
      return "Move";
    case "scroll-only":
      return "Scroll";
    default:
      return "Scroll";
  }
}
function formatSliderShortcut(sc) {
  const interaction = sc.interaction ?? "scroll";
  const actionLabel = formatInteractionLabel(interaction);
  if (!sc.key) return actionLabel;
  const mod = formatModifier(sc.modifier);
  return `${mod}${sc.key.toUpperCase()}+${actionLabel}`;
}
function formatToggleShortcut(sc) {
  if (!sc.key) return "Press";
  const mod = formatModifier(sc.modifier);
  return `${mod}${sc.key.toUpperCase()}`;
}
function formatModifier(modifier) {
  return modifier === "alt" ? "\u2325" : modifier === "shift" ? "\u21E7" : modifier === "meta" ? "\u2318" : "";
}

// src/components/ShortcutListener.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var ShortcutContext = (0, import_react2.createContext)({ activePanelId: null, activePath: null });
function ShortcutListener({ children }) {
  const [activeShortcut, setActiveShortcut] = (0, import_react2.useState)({ activePanelId: null, activePath: null });
  const activeKeysRef = (0, import_react2.useRef)(/* @__PURE__ */ new Set());
  const isDraggingRef = (0, import_react2.useRef)(false);
  const lastMouseXRef = (0, import_react2.useRef)(null);
  const dragAccumulatorRef = (0, import_react2.useRef)(0);
  const resolveActiveTarget = (0, import_react2.useCallback)((interaction) => {
    for (const key of activeKeysRef.current) {
      const panels = DialStore.getPanels();
      for (const panel of panels) {
        for (const [path, shortcut] of Object.entries(panel.shortcuts)) {
          if (!shortcut.key) continue;
          if (shortcut.key.toLowerCase() !== key) continue;
          if ((shortcut.interaction ?? "scroll") !== interaction) continue;
          const control = findControl(panel.controls, path);
          if (control && control.type === "slider") {
            return { panelId: panel.id, path, control, shortcut };
          }
        }
      }
    }
    return null;
  }, []);
  (0, import_react2.useEffect)(() => {
    const handleKeyDown = (e) => {
      if (isInputFocused()) return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "arrowright" || key === "arrowup" || key === "arrowdown") {
        if (activeKeysRef.current.size > 0) {
          const target2 = resolveActiveTarget("scroll") || resolveActiveTarget("drag") || resolveActiveTarget("move");
          if (target2 && target2.control.type === "slider") {
            e.preventDefault();
            const direction = key === "arrowright" || key === "arrowup" ? 1 : -1;
            const effectiveStep = getEffectiveStep(target2.control, target2.shortcut);
            applySliderDelta(target2.panelId, target2.path, target2.control, effectiveStep, direction);
            return;
          }
        }
      }
      const wasAlreadyHeld = activeKeysRef.current.has(key);
      activeKeysRef.current.add(key);
      const modifier = getActiveModifier(e);
      const target = DialStore.resolveShortcutTarget(key, modifier);
      if (target) {
        setActiveShortcut({ activePanelId: target.panelId, activePath: target.path });
        if (!wasAlreadyHeld && target.control.type === "toggle") {
          const currentValue = DialStore.getValue(target.panelId, target.path);
          DialStore.updateValue(target.panelId, target.path, !currentValue);
        }
      }
      if (!wasAlreadyHeld) {
        lastMouseXRef.current = null;
        dragAccumulatorRef.current = 0;
      }
    };
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      activeKeysRef.current.delete(key);
      isDraggingRef.current = false;
      lastMouseXRef.current = null;
      dragAccumulatorRef.current = 0;
      if (activeKeysRef.current.size === 0) {
        setActiveShortcut({ activePanelId: null, activePath: null });
      } else {
        let found = false;
        for (const remainingKey of activeKeysRef.current) {
          const modifier = getActiveModifier(e);
          const target = DialStore.resolveShortcutTarget(remainingKey, modifier);
          if (target) {
            setActiveShortcut({ activePanelId: target.panelId, activePath: target.path });
            found = true;
            break;
          }
        }
        if (!found) {
          setActiveShortcut({ activePanelId: null, activePath: null });
        }
      }
    };
    const handleWheel = (e) => {
      if (isInputFocused()) return;
      const modifier = getActiveModifier(e);
      if (activeKeysRef.current.size > 0) {
        for (const key of activeKeysRef.current) {
          const target = DialStore.resolveShortcutTarget(key, modifier);
          if (!target) continue;
          const { panelId, path, control } = target;
          const interaction = control.shortcut?.interaction ?? "scroll";
          if (interaction !== "scroll" || control.type !== "slider") continue;
          e.preventDefault();
          const effectiveStep = getEffectiveStep(control, control.shortcut);
          const direction = e.deltaY > 0 ? -1 : 1;
          applySliderDelta(panelId, path, control, effectiveStep, direction);
          return;
        }
      }
      const scrollOnlyTargets = DialStore.resolveScrollOnlyTargets();
      for (const { panelId, path, control, shortcut } of scrollOnlyTargets) {
        if (control.type !== "slider") continue;
        e.preventDefault();
        const effectiveStep = getEffectiveStep(control, shortcut);
        const direction = e.deltaY > 0 ? -1 : 1;
        applySliderDelta(panelId, path, control, effectiveStep, direction);
        return;
      }
    };
    const handleMouseDown = (e) => {
      if (isInputFocused()) return;
      if (activeKeysRef.current.size === 0) return;
      const target = resolveActiveTarget("drag");
      if (target) {
        isDraggingRef.current = true;
        lastMouseXRef.current = e.clientX;
        dragAccumulatorRef.current = 0;
        e.preventDefault();
      }
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      lastMouseXRef.current = null;
      dragAccumulatorRef.current = 0;
    };
    const handleMouseMove = (e) => {
      if (isInputFocused()) return;
      if (activeKeysRef.current.size === 0) return;
      if (isDraggingRef.current) {
        const target = resolveActiveTarget("drag");
        if (target && lastMouseXRef.current !== null) {
          const deltaX = e.clientX - lastMouseXRef.current;
          lastMouseXRef.current = e.clientX;
          dragAccumulatorRef.current += deltaX;
          const effectiveStep = getEffectiveStep(target.control, target.shortcut);
          const steps = Math.trunc(dragAccumulatorRef.current / DRAG_SENSITIVITY);
          if (steps !== 0) {
            dragAccumulatorRef.current -= steps * DRAG_SENSITIVITY;
            applySliderDelta(target.panelId, target.path, target.control, effectiveStep, steps);
          }
        }
        return;
      }
      const moveTarget = resolveActiveTarget("move");
      if (moveTarget) {
        if (lastMouseXRef.current === null) {
          lastMouseXRef.current = e.clientX;
          return;
        }
        const deltaX = e.clientX - lastMouseXRef.current;
        lastMouseXRef.current = e.clientX;
        dragAccumulatorRef.current += deltaX;
        const effectiveStep = getEffectiveStep(moveTarget.control, moveTarget.shortcut);
        const steps = Math.trunc(dragAccumulatorRef.current / DRAG_SENSITIVITY);
        if (steps !== 0) {
          dragAccumulatorRef.current -= steps * DRAG_SENSITIVITY;
          applySliderDelta(moveTarget.panelId, moveTarget.path, moveTarget.control, effectiveStep, steps);
        }
      }
    };
    const handleWindowBlur = () => {
      activeKeysRef.current.clear();
      isDraggingRef.current = false;
      lastMouseXRef.current = null;
      dragAccumulatorRef.current = 0;
      setActiveShortcut({ activePanelId: null, activePath: null });
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [resolveActiveTarget]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShortcutContext.Provider, { value: activeShortcut, children });
}

// src/icons.ts
var ICON_CHEVRON = "M6 9.5L12 15.5L18 9.5";
var ICON_CHECK = "M5 12.75L10 19L19 5";
var ICON_CLIPBOARD = {
  board: "M8 6C8 4.34315 9.34315 3 11 3H13C14.6569 3 16 4.34315 16 6V7H8V6Z",
  sparkle: "M19.2405 16.1852L18.5436 14.3733C18.4571 14.1484 18.241 14 18 14C17.759 14 17.5429 14.1484 17.4564 14.3733L16.7595 16.1852C16.658 16.4493 16.4493 16.658 16.1852 16.7595L14.3733 17.4564C14.1484 17.5429 14 17.759 14 18C14 18.241 14.1484 18.4571 14.3733 18.5436L16.1852 19.2405C16.4493 19.342 16.658 19.5507 16.7595 19.8148L17.4564 21.6267C17.5429 21.8516 17.759 22 18 22C18.241 22 18.4571 21.8516 18.5436 21.6267L19.2405 19.8148C19.342 19.5507 19.5507 19.342 19.8148 19.2405L21.6267 18.5436C21.8516 18.4571 22 18.241 22 18C22 17.759 21.8516 17.5429 21.6267 17.4564L19.8148 16.7595C19.5507 16.658 19.342 16.4493 19.2405 16.1852Z",
  body: "M16 5H17C18.6569 5 20 6.34315 20 8V11M8 5H7C5.34315 5 4 6.34315 4 8V18C4 19.6569 5.34315 21 7 21H12"
};
var ICON_ADD_PRESET = [
  "M4 6H20",
  "M4 12H10",
  "M15 15L21 15",
  "M18 12V18",
  "M4 18H10"
];
var ICON_TRASH = [
  "M5 6.5L5.80734 18.2064C5.91582 19.7794 7.22348 21 8.80023 21H15.1998C16.7765 21 18.0842 19.7794 18.1927 18.2064L19 6.5",
  "M10 11V16",
  "M14 11V16",
  "M3.5 6H20.5",
  "M8.07092 5.74621C8.42348 3.89745 10.0485 2.5 12 2.5C13.9515 2.5 15.5765 3.89745 15.9291 5.74621"
];
var ICON_PANEL = {
  path: "M6.84766 11.75C6.78583 11.9899 6.75 12.2408 6.75 12.5C6.75 12.7592 6.78583 13.0101 6.84766 13.25H2C1.58579 13.25 1.25 12.9142 1.25 12.5C1.25 12.0858 1.58579 11.75 2 11.75H6.84766ZM14 11.75C14.4142 11.75 14.75 12.0858 14.75 12.5C14.75 12.9142 14.4142 13.25 14 13.25H12.6523C12.7142 13.0101 12.75 12.7592 12.75 12.5C12.75 12.2408 12.7142 11.9899 12.6523 11.75H14ZM3.09766 7.25C3.03583 7.48994 3 7.74075 3 8C3 8.25925 3.03583 8.51006 3.09766 8.75H2C1.58579 8.75 1.25 8.41421 1.25 8C1.25 7.58579 1.58579 7.25 2 7.25H3.09766ZM14 7.25C14.4142 7.25 14.75 7.58579 14.75 8C14.75 8.41421 14.4142 8.75 14 8.75H8.90234C8.96417 8.51006 9 8.25925 9 8C9 7.74075 8.96417 7.48994 8.90234 7.25H14ZM7.59766 2.75C7.53583 2.98994 7.5 3.24075 7.5 3.5C7.5 3.75925 7.53583 4.01006 7.59766 4.25H2C1.58579 4.25 1.25 3.91421 1.25 3.5C1.25 3.08579 1.58579 2.75 2 2.75H7.59766ZM14 2.75C14.4142 2.75 14.75 3.08579 14.75 3.5C14.75 3.91421 14.4142 4.25 14 4.25H13.4023C13.4642 4.01006 13.5 3.75925 13.5 3.5C13.5 3.24075 13.4642 2.98994 13.4023 2.75H14Z",
  circles: [
    { cx: "6", cy: "8", r: "0.998596" },
    { cx: "10.4999", cy: "3.5", r: "0.998657" },
    { cx: "9.75015", cy: "12.5", r: "0.997986" }
  ]
};

// src/components/Folder.tsx
var import_react3 = require("react");
var import_react4 = require("motion/react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function Folder({ title, children, defaultOpen = true, isRoot = false, inline = false, onOpenChange, toolbar, open, onToggle }) {
  const controlled = open !== void 0;
  const [internalOpen, setInternalOpen] = (0, import_react3.useState)(defaultOpen);
  const isOpen = controlled ? open : internalOpen;
  const [isCollapsed, setIsCollapsed] = (0, import_react3.useState)(!defaultOpen);
  const contentRef = (0, import_react3.useRef)(null);
  const [contentHeight, setContentHeight] = (0, import_react3.useState)(void 0);
  const [windowHeight, setWindowHeight] = (0, import_react3.useState)(typeof window !== "undefined" ? window.innerHeight : 800);
  (0, import_react3.useEffect)(() => {
    if (!isRoot) return;
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isRoot]);
  (0, import_react3.useEffect)(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (isOpen) {
        const h = el.offsetHeight;
        setContentHeight((prev) => prev === h ? prev : h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);
  const handleToggle = () => {
    if (inline && isRoot) return;
    const next = !isOpen;
    if (controlled) {
      onToggle?.(next);
      onOpenChange?.(next);
      return;
    }
    setInternalOpen(next);
    if (next) {
      setIsCollapsed(false);
    } else {
      setIsCollapsed(true);
    }
    onOpenChange?.(next);
  };
  const folderContent = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { ref: isRoot ? contentRef : void 0, className: `dialkit-folder ${isRoot ? "dialkit-folder-root" : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `dialkit-folder-header ${isRoot ? "dialkit-panel-header" : ""}`, onClick: handleToggle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dialkit-folder-header-top", children: [
        isRoot ? isOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dialkit-folder-title-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dialkit-folder-title dialkit-folder-title-root", children: title }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dialkit-folder-title-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dialkit-folder-title", children: title }) }),
        isRoot && !inline && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "svg",
          {
            className: "dialkit-panel-icon",
            viewBox: "0 0 16 16",
            fill: "none",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { opacity: "0.5", d: ICON_PANEL.path, fill: "currentColor" }),
              ICON_PANEL.circles.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: c.cx, cy: c.cy, r: c.r, fill: "currentColor", stroke: "currentColor", strokeWidth: "1.25" }, i))
            ]
          }
        ),
        !isRoot && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_react4.motion.svg,
          {
            className: "dialkit-folder-icon",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2.5",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            initial: false,
            animate: { rotate: isOpen ? 0 : 180 },
            transition: { type: "spring", visualDuration: 0.35, bounce: 0.15 },
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: ICON_CHEVRON })
          }
        )
      ] }),
      isRoot && toolbar && isOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dialkit-panel-toolbar", onClick: (e) => e.stopPropagation(), children: toolbar })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react4.AnimatePresence, { initial: false, children: isOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_react4.motion.div,
      {
        className: "dialkit-folder-content",
        initial: isRoot ? void 0 : { height: 0, opacity: 0 },
        animate: isRoot ? void 0 : { height: "auto", opacity: 1 },
        exit: isRoot ? void 0 : { height: 0, opacity: 0 },
        transition: isRoot ? void 0 : { type: "spring", visualDuration: 0.35, bounce: 0.1 },
        style: isRoot ? void 0 : { clipPath: "inset(0 -20px)" },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dialkit-folder-inner", children })
      }
    ) })
  ] });
  if (isRoot) {
    if (inline) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dialkit-panel-inner dialkit-panel-inline", children: folderContent });
    }
    const panelStyle = isOpen ? { width: 280, height: contentHeight !== void 0 ? Math.min(contentHeight + 10, windowHeight - 32) : "auto", borderRadius: 14, boxShadow: "var(--dial-shadow)", cursor: void 0, overflowY: "auto" } : { width: 42, height: 42, borderRadius: "50%", boxSizing: "border-box", boxShadow: "var(--dial-shadow-collapsed)", overflow: "hidden", cursor: "pointer" };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_react4.motion.div,
      {
        className: "dialkit-panel-inner",
        style: panelStyle,
        onClick: !isOpen ? handleToggle : void 0,
        "data-collapsed": isCollapsed,
        whileTap: !isOpen ? { scale: 0.9 } : void 0,
        transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 },
        children: folderContent
      }
    );
  }
  return folderContent;
}

// src/components/Slider.tsx
var import_react5 = require("react");
var import_react6 = require("motion/react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var CLICK_THRESHOLD = 3;
var DEAD_ZONE = 32;
var MAX_CURSOR_RANGE = 200;
var MAX_STRETCH = 8;
function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  unit,
  shortcut,
  shortcutActive
}) {
  const wrapperRef = (0, import_react5.useRef)(null);
  const trackRef = (0, import_react5.useRef)(null);
  const inputRef = (0, import_react5.useRef)(null);
  const labelRef = (0, import_react5.useRef)(null);
  const valueSpanRef = (0, import_react5.useRef)(null);
  const [isInteracting, setIsInteracting] = (0, import_react5.useState)(false);
  const [isDragging, setIsDragging] = (0, import_react5.useState)(false);
  const [isHovered, setIsHovered] = (0, import_react5.useState)(false);
  const [isValueHovered, setIsValueHovered] = (0, import_react5.useState)(false);
  const [isValueEditable, setIsValueEditable] = (0, import_react5.useState)(false);
  const [showInput, setShowInput] = (0, import_react5.useState)(false);
  const [inputValue, setInputValue] = (0, import_react5.useState)("");
  const hoverTimeoutRef = (0, import_react5.useRef)(null);
  const pointerDownPos = (0, import_react5.useRef)(null);
  const isClickRef = (0, import_react5.useRef)(true);
  const animRef = (0, import_react5.useRef)(null);
  const wrapperRectRef = (0, import_react5.useRef)(null);
  const scaleRef = (0, import_react5.useRef)(1);
  const percentage = (value - min) / (max - min) * 100;
  const isActive = isInteracting || isHovered;
  const fillPercent = (0, import_react6.useMotionValue)(percentage);
  const fillWidth = (0, import_react6.useTransform)(fillPercent, (pct) => `${pct}%`);
  const handleLeft = (0, import_react6.useTransform)(
    fillPercent,
    (pct) => `max(5px, calc(${pct}% - 9px))`
  );
  const rubberStretchPx = (0, import_react6.useMotionValue)(0);
  const rubberBandWidth = (0, import_react6.useTransform)(
    rubberStretchPx,
    (stretch) => `calc(100% + ${Math.abs(stretch)}px)`
  );
  const rubberBandX = (0, import_react6.useTransform)(
    rubberStretchPx,
    (stretch) => stretch < 0 ? stretch : 0
  );
  (0, import_react5.useEffect)(() => {
    if (!isInteracting && !animRef.current) {
      fillPercent.jump(percentage);
    }
  }, [percentage, isInteracting, fillPercent]);
  const positionToValue = (0, import_react5.useCallback)(
    (clientX) => {
      const rect = wrapperRectRef.current;
      if (!rect) return value;
      const screenX = clientX - rect.left;
      const sceneX = screenX / scaleRef.current;
      const nativeWidth = wrapperRef.current ? wrapperRef.current.offsetWidth : rect.width;
      const percent = Math.max(0, Math.min(1, sceneX / nativeWidth));
      const rawValue = min + percent * (max - min);
      return Math.max(min, Math.min(max, rawValue));
    },
    [min, max, value]
  );
  const percentFromValue = (0, import_react5.useCallback)(
    (v) => (v - min) / (max - min) * 100,
    [min, max]
  );
  const computeRubberStretch = (0, import_react5.useCallback)(
    (clientX, sign) => {
      const rect = wrapperRectRef.current;
      if (!rect) return 0;
      const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right;
      const overflow = Math.max(0, distancePast - DEAD_ZONE);
      return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1));
    },
    []
  );
  const handlePointerDown = (0, import_react5.useCallback)(
    (e) => {
      if (showInput) return;
      e.preventDefault();
      e.target.setPointerCapture(e.pointerId);
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      isClickRef.current = true;
      setIsInteracting(true);
      if (wrapperRef.current) {
        wrapperRectRef.current = wrapperRef.current.getBoundingClientRect();
        const nativeWidth = wrapperRef.current.offsetWidth;
        scaleRef.current = wrapperRectRef.current.width / nativeWidth;
      }
    },
    [showInput]
  );
  const handlePointerMove = (0, import_react5.useCallback)(
    (e) => {
      if (!isInteracting || !pointerDownPos.current) return;
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (isClickRef.current && distance > CLICK_THRESHOLD) {
        isClickRef.current = false;
        setIsDragging(true);
      }
      if (!isClickRef.current) {
        const rect = wrapperRectRef.current;
        if (rect) {
          if (e.clientX < rect.left) {
            rubberStretchPx.jump(computeRubberStretch(e.clientX, -1));
          } else if (e.clientX > rect.right) {
            rubberStretchPx.jump(computeRubberStretch(e.clientX, 1));
          } else {
            rubberStretchPx.jump(0);
          }
        }
        const newValue = positionToValue(e.clientX);
        const newPct = percentFromValue(newValue);
        if (animRef.current) {
          animRef.current.stop();
          animRef.current = null;
        }
        fillPercent.jump(newPct);
        onChange(roundValue(newValue, step));
      }
    },
    [
      isInteracting,
      positionToValue,
      percentFromValue,
      onChange,
      fillPercent,
      rubberStretchPx,
      computeRubberStretch
    ]
  );
  const handlePointerUp = (0, import_react5.useCallback)(
    (e) => {
      if (!isInteracting) return;
      if (isClickRef.current) {
        const rawValue = positionToValue(e.clientX);
        const discreteSteps2 = (max - min) / step;
        const snappedValue = discreteSteps2 <= 10 ? Math.max(min, Math.min(max, min + Math.round((rawValue - min) / step) * step)) : snapToDecile(rawValue, min, max);
        const newPct = percentFromValue(snappedValue);
        if (animRef.current) {
          animRef.current.stop();
        }
        animRef.current = (0, import_react6.animate)(fillPercent, newPct, {
          type: "spring",
          stiffness: 300,
          damping: 25,
          mass: 0.8,
          onComplete: () => {
            animRef.current = null;
          }
        });
        onChange(roundValue(snappedValue, step));
      }
      if (rubberStretchPx.get() !== 0) {
        (0, import_react6.animate)(rubberStretchPx, 0, {
          type: "spring",
          visualDuration: 0.35,
          bounce: 0.15
        });
      }
      setIsInteracting(false);
      setIsDragging(false);
      pointerDownPos.current = null;
    },
    [
      isInteracting,
      positionToValue,
      percentFromValue,
      onChange,
      min,
      max,
      fillPercent,
      rubberStretchPx
    ]
  );
  (0, import_react5.useEffect)(() => {
    if (isValueHovered && !showInput && !isValueEditable) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsValueEditable(true);
      }, 800);
    } else if (!isValueHovered && !showInput) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsValueEditable(false);
    }
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isValueHovered, showInput, isValueEditable]);
  (0, import_react5.useEffect)(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [showInput]);
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };
  const handleInputSubmit = () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(roundValue(clamped, step));
    }
    setShowInput(false);
    setIsValueHovered(false);
    setIsValueEditable(false);
  };
  const handleValueClick = (e) => {
    if (isValueEditable) {
      e.stopPropagation();
      e.preventDefault();
      setShowInput(true);
      setInputValue(value.toFixed(decimalsForStep(step)));
    }
  };
  const handleInputKeyDown = (e) => {
    if (e.key === "Enter") {
      handleInputSubmit();
    } else if (e.key === "Escape") {
      setShowInput(false);
      setIsValueHovered(false);
    }
  };
  const handleInputBlur = () => {
    handleInputSubmit();
  };
  const displayValue = value.toFixed(decimalsForStep(step));
  const HANDLE_BUFFER = 8;
  const LABEL_CSS_LEFT = 10;
  const VALUE_CSS_RIGHT = 10;
  let leftThreshold = 30;
  let rightThreshold = 78;
  const trackWidth = wrapperRef.current?.offsetWidth;
  if (trackWidth && trackWidth > 0) {
    if (labelRef.current) {
      leftThreshold = (LABEL_CSS_LEFT + labelRef.current.offsetWidth + HANDLE_BUFFER) / trackWidth * 100;
    }
    if (valueSpanRef.current) {
      rightThreshold = (trackWidth - VALUE_CSS_RIGHT - valueSpanRef.current.offsetWidth - HANDLE_BUFFER) / trackWidth * 100;
    }
  }
  const valueDodge = percentage < leftThreshold || percentage > rightThreshold;
  const handleOpacity = !isActive ? 0 : valueDodge ? 0.1 : isDragging ? 0.9 : 0.5;
  const discreteSteps = (max - min) / step;
  const hashMarks = discreteSteps <= 10 ? Array.from({ length: discreteSteps - 1 }, (_, i) => {
    const pct = (i + 1) * step / (max - min) * 100;
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        className: "dialkit-slider-hashmark",
        style: { left: `${pct}%` }
      },
      i
    );
  }) : Array.from({ length: 9 }, (_, i) => {
    const pct = (i + 1) * 10;
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        className: "dialkit-slider-hashmark",
        style: { left: `${pct}%` }
      },
      i
    );
  });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: wrapperRef, className: "dialkit-slider-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    import_react6.motion.div,
    {
      ref: trackRef,
      className: `dialkit-slider ${isActive ? "dialkit-slider-active" : ""}`,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      style: { width: rubberBandWidth, x: rubberBandX },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dialkit-slider-hashmarks", children: hashMarks }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_react6.motion.div,
          {
            className: "dialkit-slider-fill",
            style: {
              width: fillWidth
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_react6.motion.div,
          {
            className: "dialkit-slider-handle",
            style: {
              left: handleLeft,
              y: "-50%"
            },
            animate: {
              opacity: handleOpacity,
              scaleX: isActive ? 1 : 0.25,
              scaleY: isActive && valueDodge ? 0.75 : 1
            },
            transition: {
              scaleX: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
              scaleY: { type: "spring", visualDuration: 0.2, bounce: 0.1 },
              opacity: { duration: 0.15 }
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { ref: labelRef, className: "dialkit-slider-label", children: [
          label,
          shortcut && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `dialkit-shortcut-pill${shortcutActive ? " dialkit-shortcut-pill-active" : ""}`, children: formatSliderShortcut(shortcut) })
        ] }),
        showInput ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            ref: inputRef,
            type: "text",
            className: "dialkit-slider-input",
            value: inputValue,
            onChange: handleInputChange,
            onKeyDown: handleInputKeyDown,
            onBlur: handleInputBlur,
            onClick: (e) => e.stopPropagation(),
            onMouseDown: (e) => e.stopPropagation()
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "span",
          {
            ref: valueSpanRef,
            className: `dialkit-slider-value ${isValueEditable ? "dialkit-slider-value-editable" : ""}`,
            onMouseEnter: () => setIsValueHovered(true),
            onMouseLeave: () => setIsValueHovered(false),
            onClick: handleValueClick,
            onMouseDown: (e) => isValueEditable && e.stopPropagation(),
            style: { cursor: isValueEditable ? "text" : "default" },
            children: displayValue
          }
        )
      ]
    }
  ) });
}

// src/components/SegmentedControl.tsx
var import_react7 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function SegmentedControl({
  options,
  value,
  onChange
}) {
  const containerRef = (0, import_react7.useRef)(null);
  const hasAnimated = (0, import_react7.useRef)(false);
  const [pillStyle, setPillStyle] = (0, import_react7.useState)(null);
  const measure = (0, import_react7.useCallback)(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeButton = container.querySelector('[data-active="true"]');
    if (!activeButton) return;
    setPillStyle({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth
    });
  }, []);
  (0, import_react7.useLayoutEffect)(() => {
    measure();
  }, [value, options.length, measure]);
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dialkit-segmented", ref: containerRef, children: [
    pillStyle && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "div",
      {
        className: "dialkit-segmented-pill",
        style: {
          left: pillStyle.left,
          width: pillStyle.width,
          transition: shouldAnimate ? "left 0.2s cubic-bezier(0.25, 1, 0.5, 1), width 0.2s cubic-bezier(0.25, 1, 0.5, 1)" : "none"
        }
      }
    ),
    options.map((option) => {
      const isActive = value === option.value;
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          onClick: () => onChange(option.value),
          className: "dialkit-segmented-button",
          "data-active": String(isActive),
          children: option.label
        },
        option.value
      );
    })
  ] });
}

// src/components/Toggle.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function Toggle({ label, checked, onChange, shortcut, shortcutActive }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dialkit-labeled-control", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dialkit-labeled-control-label", children: [
      label,
      shortcut && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: `dialkit-shortcut-pill${shortcutActive ? " dialkit-shortcut-pill-active" : ""}`, children: formatToggleShortcut(shortcut) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      SegmentedControl,
      {
        options: [
          { value: "off", label: "Off" },
          { value: "on", label: "On" }
        ],
        value: checked ? "on" : "off",
        onChange: (val) => onChange(val === "on")
      }
    )
  ] });
}

// src/components/SpringVisualization.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function generateSpringCurve(stiffness, damping, mass, duration) {
  const points = [];
  const steps = 100;
  const dt = duration / steps;
  let position = 0;
  let velocity = 0;
  const target = 1;
  for (let i = 0; i <= steps; i++) {
    const time = i * dt;
    points.push([time, position]);
    const springForce = -stiffness * (position - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    velocity += acceleration * dt;
    position += velocity * dt;
  }
  return points;
}
function SpringVisualization({ spring, isSimpleMode }) {
  const width = 256;
  const height = 140;
  let stiffness;
  let damping;
  let mass;
  if (isSimpleMode) {
    const visualDuration = spring.visualDuration ?? 0.3;
    const bounce = spring.bounce ?? 0.2;
    mass = 1;
    stiffness = 2 * Math.PI / visualDuration;
    stiffness = Math.pow(stiffness, 2);
    const dampingRatio = 1 - bounce;
    damping = 2 * dampingRatio * Math.sqrt(stiffness * mass);
  } else {
    stiffness = spring.stiffness ?? 400;
    damping = spring.damping ?? 17;
    mass = spring.mass ?? 1;
  }
  const duration = 2;
  const points = generateSpringCurve(stiffness, damping, mass, duration);
  const values = points.map(([, value]) => value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;
  const pathData = points.map(([time, value], i) => {
    const x = time / duration * width;
    const normalizedValue = (value - minValue) / (valueRange || 1);
    const y = height - (normalizedValue * height * 0.6 + height * 0.2);
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
  const gridLines = [];
  for (let i = 1; i < 4; i++) {
    const x = width / 4 * i;
    const y = height / 4 * i;
    gridLines.push(
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("line", { x1: x, y1: 0, x2: x, y2: height, stroke: "rgba(255, 255, 255, 0.08)", strokeWidth: "1" }, `v-${i}`),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("line", { x1: 0, y1: y, x2: width, y2: y, stroke: "rgba(255, 255, 255, 0.08)", strokeWidth: "1" }, `h-${i}`)
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { viewBox: `0 0 ${width} ${height}`, className: "dialkit-spring-viz", children: [
    gridLines,
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "line",
      {
        x1: 0,
        y1: height / 2,
        x2: width,
        y2: height / 2,
        stroke: "rgba(255, 255, 255, 0.15)",
        strokeWidth: "1",
        strokeDasharray: "4,4"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "path",
      {
        d: pathData,
        fill: "none",
        stroke: "rgba(255, 255, 255, 0.6)",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    )
  ] });
}

// src/components/SpringControl.tsx
var import_react8 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function SpringControl({ panelId, path, label, spring, onChange }) {
  const mode = (0, import_react8.useSyncExternalStore)(
    (cb) => DialStore.subscribe(panelId, cb),
    () => DialStore.getSpringMode(panelId, path),
    () => DialStore.getSpringMode(panelId, path)
  );
  const isSimpleMode = mode === "simple";
  const cache = (0, import_react8.useRef)({
    simple: spring.visualDuration !== void 0 ? spring : { type: "spring", visualDuration: 0.3, bounce: 0.2 },
    advanced: spring.stiffness !== void 0 ? spring : { type: "spring", stiffness: 200, damping: 25, mass: 1 }
  });
  if (isSimpleMode) {
    cache.current.simple = spring;
  } else {
    cache.current.advanced = spring;
  }
  const handleModeChange = (newMode) => {
    DialStore.updateSpringMode(panelId, path, newMode);
    if (newMode === "simple") {
      onChange(cache.current.simple);
    } else {
      onChange(cache.current.advanced);
    }
  };
  const handleUpdate = (key, value) => {
    if (isSimpleMode) {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({ ...rest, [key]: value });
    } else {
      const { visualDuration, bounce, ...rest } = spring;
      onChange({ ...rest, [key]: value });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Folder, { title: label, defaultOpen: true, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(SpringVisualization, { spring, isSimpleMode }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dialkit-labeled-control", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dialkit-labeled-control-label", children: "Type" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        SegmentedControl,
        {
          options: [
            { value: "simple", label: "Time" },
            { value: "advanced", label: "Physics" }
          ],
          value: mode,
          onChange: handleModeChange
        }
      )
    ] }),
    isSimpleMode ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Slider,
        {
          label: "Duration",
          value: spring.visualDuration ?? 0.3,
          onChange: (v) => handleUpdate("visualDuration", v),
          min: 0.1,
          max: 1,
          step: 0.05,
          unit: "s"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Slider,
        {
          label: "Bounce",
          value: spring.bounce ?? 0.2,
          onChange: (v) => handleUpdate("bounce", v),
          min: 0,
          max: 1,
          step: 0.05
        }
      )
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Slider,
        {
          label: "Stiffness",
          value: spring.stiffness ?? 400,
          onChange: (v) => handleUpdate("stiffness", v),
          min: 1,
          max: 1e3,
          step: 10
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Slider,
        {
          label: "Damping",
          value: spring.damping ?? 17,
          onChange: (v) => handleUpdate("damping", v),
          min: 1,
          max: 100,
          step: 1
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Slider,
        {
          label: "Mass",
          value: spring.mass ?? 1,
          onChange: (v) => handleUpdate("mass", v),
          min: 0.1,
          max: 10,
          step: 0.1
        }
      )
    ] })
  ] }) });
}

// src/components/EasingVisualization.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function EasingVisualization({ easing }) {
  const ease = easing.ease;
  const s = 200;
  const pad = 10;
  const inner = s - pad * 2;
  const unit = inner / 2;
  const toSvg = (nx, ny) => ({
    x: pad + (nx + 0.5) * unit,
    y: pad + (1.5 - ny) * unit
  });
  const start = toSvg(0, 0);
  const end = toSvg(1, 1);
  const p1 = toSvg(ease[0], ease[1]);
  const p2 = toSvg(ease[2], ease[3]);
  const curvePath = `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "svg",
    {
      viewBox: `0 0 ${s} ${s}`,
      preserveAspectRatio: "xMidYMid slice",
      className: "dialkit-spring-viz dialkit-easing-viz",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "line",
          {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            stroke: "rgba(255, 255, 255, 0.15)",
            strokeWidth: "1",
            strokeDasharray: "4,4"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: curvePath, fill: "none", stroke: "rgba(255, 255, 255, 0.6)", strokeWidth: "2", strokeLinecap: "round" })
      ]
    }
  );
}

// src/components/TransitionControl.tsx
var import_react9 = require("react");
var import_react10 = require("motion/react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function TransitionControl({ panelId, path, label, value, onChange }) {
  const mode = (0, import_react9.useSyncExternalStore)(
    (cb) => DialStore.subscribe(panelId, cb),
    () => DialStore.getTransitionMode(panelId, path),
    () => DialStore.getTransitionMode(panelId, path)
  );
  const isEasing = mode === "easing";
  const isSimpleSpring = mode === "simple";
  const cache = (0, import_react9.useRef)({
    easing: value.type === "easing" ? value : { type: "easing", duration: 0.3, ease: [1, -0.4, 0.5, 1] },
    simple: value.type === "spring" && value.visualDuration !== void 0 ? value : { type: "spring", visualDuration: 0.3, bounce: 0.2 },
    advanced: value.type === "spring" && value.stiffness !== void 0 ? value : { type: "spring", stiffness: 200, damping: 25, mass: 1 }
  });
  if (isEasing && value.type === "easing") {
    cache.current.easing = value;
  } else if (isSimpleSpring && value.type === "spring") {
    cache.current.simple = value;
  } else if (mode === "advanced" && value.type === "spring") {
    cache.current.advanced = value;
  }
  const spring = value.type === "spring" ? value : cache.current.simple;
  const easing = value.type === "easing" ? value : cache.current.easing;
  const handleModeChange = (newMode) => {
    DialStore.updateTransitionMode(panelId, path, newMode);
    if (newMode === "easing") {
      onChange(cache.current.easing);
    } else if (newMode === "simple") {
      onChange(cache.current.simple);
    } else {
      onChange(cache.current.advanced);
    }
  };
  const handleSpringUpdate = (key, val) => {
    if (isSimpleSpring) {
      const { stiffness, damping, mass, ...rest } = spring;
      onChange({ ...rest, [key]: val });
    } else {
      const { visualDuration, bounce, ...rest } = spring;
      onChange({ ...rest, [key]: val });
    }
  };
  const updateEase = (index, val) => {
    const newEase = [...easing.ease];
    newEase[index] = val;
    onChange({ ...easing, ease: newEase });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Folder, { title: label, defaultOpen: true, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
    isEasing ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(EasingVisualization, { easing }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(SpringVisualization, { spring, isSimpleMode: isSimpleSpring }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dialkit-labeled-control", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dialkit-labeled-control-label", children: "Type" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        SegmentedControl,
        {
          options: [
            { value: "easing", label: "Easing" },
            { value: "simple", label: "Time" },
            { value: "advanced", label: "Physics" }
          ],
          value: mode,
          onChange: handleModeChange
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { display: "flex", flexDirection: "column-reverse" }, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_react10.AnimatePresence, { initial: false, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      import_react10.motion.div,
      {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: "auto" },
        exit: { opacity: 0, height: 0 },
        transition: { type: "spring", visualDuration: 0.25, bounce: 0.1 },
        style: { overflow: "hidden", display: "flex", flexDirection: "column", gap: 6 },
        children: isEasing ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "x1", value: easing.ease[0], onChange: (v) => updateEase(0, v), min: 0, max: 1, step: 0.01 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "y1", value: easing.ease[1], onChange: (v) => updateEase(1, v), min: -1, max: 2, step: 0.01 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "x2", value: easing.ease[2], onChange: (v) => updateEase(2, v), min: 0, max: 1, step: 0.01 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "y2", value: easing.ease[3], onChange: (v) => updateEase(3, v), min: -1, max: 2, step: 0.01 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "Duration", value: easing.duration, onChange: (v) => onChange({ ...easing, duration: v }), min: 0.1, max: 2, step: 0.05, unit: "s" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(EaseTextInput, { ease: easing.ease, onChange: (newEase) => onChange({ ...easing, ease: newEase }) })
        ] }) : isSimpleSpring ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "Duration", value: spring.visualDuration ?? 0.3, onChange: (v) => handleSpringUpdate("visualDuration", v), min: 0.1, max: 1, step: 0.05, unit: "s" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "Bounce", value: spring.bounce ?? 0.2, onChange: (v) => handleSpringUpdate("bounce", v), min: 0, max: 1, step: 0.05 })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "Stiffness", value: spring.stiffness ?? 400, onChange: (v) => handleSpringUpdate("stiffness", v), min: 1, max: 1e3, step: 10 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "Damping", value: spring.damping ?? 17, onChange: (v) => handleSpringUpdate("damping", v), min: 1, max: 100, step: 1 }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Slider, { label: "Mass", value: spring.mass ?? 1, onChange: (v) => handleSpringUpdate("mass", v), min: 0.1, max: 10, step: 0.1 })
        ] })
      },
      mode
    ) }) })
  ] }) });
}
function formatEase(ease) {
  return ease.map((v) => parseFloat(v.toFixed(2))).join(", ");
}
function parseEase(str) {
  const parts = str.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    return parts;
  }
  return null;
}
function EaseTextInput({ ease, onChange }) {
  const [editing, setEditing] = (0, import_react9.useState)(false);
  const [draft, setDraft] = (0, import_react9.useState)("");
  const handleFocus = () => {
    setDraft(formatEase(ease));
    setEditing(true);
  };
  const handleBlur = () => {
    const parsed = parseEase(draft);
    if (parsed) onChange(parsed);
    setEditing(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dialkit-labeled-control", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dialkit-labeled-control-label", children: "Ease" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "input",
      {
        type: "text",
        className: "dialkit-text-input",
        value: editing ? draft : formatEase(ease),
        onChange: (e) => setDraft(e.target.value),
        onFocus: handleFocus,
        onBlur: handleBlur,
        onKeyDown: handleKeyDown,
        spellCheck: false
      }
    )
  ] });
}

// src/components/TextControl.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function TextControl({ label, value, onChange, placeholder }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dialkit-text-control", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("label", { className: "dialkit-text-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      "input",
      {
        type: "text",
        className: "dialkit-text-input",
        value,
        onChange: (e) => onChange(e.target.value),
        placeholder
      }
    )
  ] });
}

// src/components/SelectControl.tsx
var import_react11 = require("react");
var import_react_dom = require("react-dom");
var import_react12 = require("motion/react");
var import_jsx_runtime11 = require("react/jsx-runtime");
function toTitleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function normalizeOptions(options) {
  return options.map(
    (opt) => typeof opt === "string" ? { value: opt, label: toTitleCase(opt) } : opt
  );
}
function SelectControl({ label, value, options, onChange }) {
  const [isOpen, setIsOpen] = (0, import_react11.useState)(false);
  const triggerRef = (0, import_react11.useRef)(null);
  const dropdownRef = (0, import_react11.useRef)(null);
  const [portalTarget, setPortalTarget] = (0, import_react11.useState)(null);
  const [pos, setPos] = (0, import_react11.useState)(null);
  const normalized = normalizeOptions(options);
  const selectedOption = normalized.find((o) => o.value === value);
  const updatePos = (0, import_react11.useCallback)(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dropdownHeight = 8 + normalized.length * 36;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const above = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    setPos({
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      above
    });
  }, [normalized.length]);
  (0, import_react11.useEffect)(() => {
    const root = triggerRef.current?.closest(".dialkit-root");
    setPortalTarget(root ?? document.body);
  }, []);
  (0, import_react11.useEffect)(() => {
    if (!isOpen) return;
    updatePos();
  }, [isOpen, updatePos]);
  (0, import_react11.useEffect)(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      const target = e.target;
      if (triggerRef.current && !triggerRef.current.contains(target) && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dialkit-select-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
      "button",
      {
        ref: triggerRef,
        className: "dialkit-select-trigger",
        onClick: () => setIsOpen(!isOpen),
        "data-open": String(isOpen),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dialkit-select-label", children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dialkit-select-right", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dialkit-select-value", children: selectedOption?.label ?? value }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              import_react12.motion.svg,
              {
                className: "dialkit-select-chevron",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2.5",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                animate: { rotate: isOpen ? 180 : 0 },
                transition: { type: "spring", visualDuration: 0.2, bounce: 0.15 },
                children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: ICON_CHEVRON })
              }
            )
          ] })
        ]
      }
    ),
    portalTarget && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_react12.AnimatePresence, { children: isOpen && pos && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        import_react12.motion.div,
        {
          ref: dropdownRef,
          className: "dialkit-select-dropdown",
          initial: { opacity: 0, y: pos.above ? 8 : -8, scale: 0.95 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: pos.above ? 8 : -8, scale: 0.95 },
          transition: { type: "spring", visualDuration: 0.15, bounce: 0 },
          style: {
            position: "fixed",
            left: pos.left,
            width: pos.width,
            ...pos.above ? { bottom: window.innerHeight - pos.top, transformOrigin: "bottom" } : { top: pos.top, transformOrigin: "top" }
          },
          children: normalized.map((option) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "button",
            {
              className: "dialkit-select-option",
              "data-selected": String(option.value === value),
              onClick: () => {
                onChange(option.value);
                setIsOpen(false);
              },
              children: option.label
            },
            option.value
          ))
        }
      ) }),
      portalTarget
    )
  ] });
}

// src/components/ColorControl.tsx
var import_react13 = require("react");
var import_jsx_runtime12 = require("react/jsx-runtime");
var HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
function ColorControl({ label, value, onChange }) {
  const [isEditing, setIsEditing] = (0, import_react13.useState)(false);
  const [editValue, setEditValue] = (0, import_react13.useState)(value);
  const colorInputRef = (0, import_react13.useRef)(null);
  (0, import_react13.useEffect)(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);
  function handleTextSubmit() {
    setIsEditing(false);
    if (HEX_COLOR_REGEX.test(editValue)) {
      onChange(editValue);
    } else {
      setEditValue(value);
    }
  }
  function handleKeyDown(e) {
    if (e.key === "Enter") {
      handleTextSubmit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(value);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dialkit-color-control", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dialkit-color-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dialkit-color-inputs", children: [
      isEditing ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "input",
        {
          type: "text",
          className: "dialkit-color-hex-input",
          value: editValue,
          onChange: (e) => setEditValue(e.target.value),
          onBlur: handleTextSubmit,
          onKeyDown: handleKeyDown,
          autoFocus: true
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "span",
        {
          className: "dialkit-color-hex",
          onClick: () => setIsEditing(true),
          children: (value ?? "").toUpperCase()
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "button",
        {
          className: "dialkit-color-swatch",
          style: { backgroundColor: value },
          onClick: () => colorInputRef.current?.click(),
          title: "Pick color"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "input",
        {
          ref: colorInputRef,
          type: "color",
          className: "dialkit-color-picker-native",
          value: value.length === 4 ? expandShorthandHex(value) : value.slice(0, 7),
          onChange: (e) => onChange(e.target.value)
        }
      )
    ] })
  ] });
}
function expandShorthandHex(hex) {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

// src/components/PresetManager.tsx
var import_react14 = require("react");
var import_react_dom2 = require("react-dom");
var import_react15 = require("motion/react");
var import_jsx_runtime13 = require("react/jsx-runtime");
function PresetManager({ panelId, presets, activePresetId, onAdd }) {
  const [isOpen, setIsOpen] = (0, import_react14.useState)(false);
  const triggerRef = (0, import_react14.useRef)(null);
  const dropdownRef = (0, import_react14.useRef)(null);
  const [pos, setPos] = (0, import_react14.useState)({ top: 0, left: 0, width: 0, above: false });
  const hasPresets = presets.length > 0;
  const activePreset = presets.find((p) => p.id === activePresetId);
  const open = (0, import_react14.useCallback)(() => {
    if (!hasPresets) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const dropdownHeight = 8 + (presets.length + 1) * 36;
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const above = spaceBelow < dropdownHeight && rect.top > spaceBelow;
      setPos({
        top: above ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        above
      });
    }
    setIsOpen(true);
  }, [hasPresets, presets.length]);
  const close = (0, import_react14.useCallback)(() => setIsOpen(false), []);
  const toggle = (0, import_react14.useCallback)(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);
  (0, import_react14.useEffect)(() => {
    if (!isOpen) return;
    const handler = (e) => {
      const target = e.target;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);
  const handleSelect = (presetId) => {
    if (presetId) {
      DialStore.loadPreset(panelId, presetId);
    } else {
      DialStore.clearActivePreset(panelId);
    }
    close();
  };
  const handleDelete = (e, presetId) => {
    e.stopPropagation();
    DialStore.deletePreset(panelId, presetId);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dialkit-preset-manager", children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
      "button",
      {
        ref: triggerRef,
        className: "dialkit-preset-trigger",
        onClick: toggle,
        "data-open": String(isOpen),
        "data-has-preset": String(!!activePreset),
        "data-disabled": String(!hasPresets),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dialkit-preset-label", children: activePreset ? activePreset.name : "Version 1" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            import_react15.motion.svg,
            {
              className: "dialkit-select-chevron",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2.5",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              animate: { rotate: isOpen ? 180 : 0, opacity: hasPresets ? 0.6 : 0.25 },
              transition: { type: "spring", visualDuration: 0.2, bounce: 0.15 },
              children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("path", { d: ICON_CHEVRON })
            }
          )
        ]
      }
    ),
    (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(import_react15.AnimatePresence, { children: isOpen && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
        import_react15.motion.div,
        {
          ref: dropdownRef,
          className: "dialkit-root dialkit-preset-dropdown",
          style: {
            position: "fixed",
            left: pos.left,
            minWidth: pos.width,
            ...pos.above ? { bottom: window.innerHeight - pos.top, transformOrigin: "bottom" } : { top: pos.top, transformOrigin: "top" }
          },
          initial: { opacity: 0, y: pos.above ? 8 : -8, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: pos.above ? 8 : -8, scale: 0.97, pointerEvents: "none" },
          transition: { type: "spring", visualDuration: 0.15, bounce: 0 },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              "div",
              {
                className: "dialkit-preset-item",
                "data-active": String(!activePresetId),
                onClick: () => handleSelect(null),
                children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dialkit-preset-name", children: "Version 1" })
              }
            ),
            presets.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
              "div",
              {
                className: "dialkit-preset-item",
                "data-active": String(preset.id === activePresetId),
                onClick: () => handleSelect(preset.id),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dialkit-preset-name", children: preset.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                    "button",
                    {
                      className: "dialkit-preset-delete",
                      onClick: (e) => handleDelete(e, preset.id),
                      title: "Delete preset",
                      children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: ICON_TRASH.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("path", { d }, i)) })
                    }
                  )
                ]
              },
              preset.id
            ))
          ]
        }
      ) }),
      document.body
    )
  ] });
}

// src/components/Panel.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
function Panel({ panel, defaultOpen = true, inline = false, folderMode = "independent" }) {
  const [copied, setCopied] = (0, import_react16.useState)(false);
  const [isPanelOpen, setIsPanelOpen] = (0, import_react16.useState)(defaultOpen);
  const shortcutCtx = (0, import_react16.useContext)(ShortcutContext);
  const hasShortcuts = Object.keys(panel.shortcuts).length > 0;
  const [openFolder, setOpenFolder] = (0, import_react16.useState)(() => {
    if (folderMode !== "accordion") return null;
    const first = panel.controls.find(
      (c) => c.type === "folder" && (c.defaultOpen ?? true)
    );
    return first?.path ?? null;
  });
  const accordion = folderMode === "accordion";
  const values = (0, import_react16.useSyncExternalStore)(
    (cb) => DialStore.subscribe(panel.id, cb),
    () => DialStore.getValues(panel.id),
    () => DialStore.getValues(panel.id)
  );
  const presets = DialStore.getPresets(panel.id);
  const activePresetId = DialStore.getActivePresetId(panel.id);
  const handleAddPreset = () => {
    const nextNum = presets.length + 2;
    DialStore.savePreset(panel.id, `Version ${nextNum}`);
  };
  const handleCopy = () => {
    const jsonStr = JSON.stringify(values, null, 2);
    const instruction = `Update the useDialKit configuration for "${panel.name}" with these values:

\`\`\`json
${jsonStr}
\`\`\`

Apply these values as the new defaults in the useDialKit call.`;
    navigator.clipboard.writeText(instruction);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const renderControlInner = (control, depth) => {
    const value = values[control.path];
    switch (control.type) {
      case "slider":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          Slider,
          {
            label: control.label,
            value,
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v),
            min: control.min,
            max: control.max,
            step: control.step,
            shortcut: control.shortcut,
            shortcutActive: shortcutCtx.activePanelId === panel.id && shortcutCtx.activePath === control.path
          }
        );
      case "toggle":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          Toggle,
          {
            label: control.label,
            checked: value,
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v),
            shortcut: control.shortcut,
            shortcutActive: shortcutCtx.activePanelId === panel.id && shortcutCtx.activePath === control.path
          }
        );
      case "spring":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          SpringControl,
          {
            panelId: panel.id,
            path: control.path,
            label: control.label,
            spring: value,
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v)
          }
        );
      case "transition":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          TransitionControl,
          {
            panelId: panel.id,
            path: control.path,
            label: control.label,
            value,
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v)
          }
        );
      case "folder": {
        const controlledProps = accordion && depth === 0 ? {
          open: openFolder === control.path,
          onToggle: (next) => setOpenFolder(next ? control.path : null)
        } : {};
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Folder, { title: control.label, defaultOpen: control.defaultOpen ?? true, ...controlledProps, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_react17.AnimatePresence, { initial: false, children: control.children?.map((child) => renderControl(child, depth + 1)) }) });
      }
      case "text":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          TextControl,
          {
            label: control.label,
            value,
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v),
            placeholder: control.placeholder
          }
        );
      case "select":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          SelectControl,
          {
            label: control.label,
            value,
            options: control.options ?? [],
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v)
          }
        );
      case "color":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          ColorControl,
          {
            label: control.label,
            value,
            onChange: (v) => DialStore.updateValue(panel.id, control.path, v)
          }
        );
      case "action":
        return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "button",
          {
            className: "dialkit-button",
            onClick: () => DialStore.triggerAction(panel.id, control.path),
            children: control.label
          }
        );
      default:
        return null;
    }
  };
  const renderControl = (control, depth = 0) => {
    const inner = renderControlInner(control, depth);
    if (inner === null) return null;
    const isFolder = control.type === "folder" || control.type === "spring" || control.type === "transition";
    const wrapClassName = isFolder ? "dialkit-control-wrap dialkit-control-wrap-folder" : "dialkit-control-wrap";
    return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      import_react17.motion.div,
      {
        className: wrapClassName,
        ...CONTROL_ANIM,
        children: inner
      },
      control.path
    );
  };
  const renderControls = () => {
    return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_react17.AnimatePresence, { initial: false, children: panel.controls.map((control) => renderControl(control, 0)) });
  };
  const iconTransition = { type: "spring", visualDuration: 0.4, bounce: 0.1 };
  const toolbar = /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      import_react17.motion.button,
      {
        className: "dialkit-toolbar-add",
        onClick: handleAddPreset,
        title: "Add preset",
        whileTap: { scale: 0.9 },
        transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 },
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: ICON_ADD_PRESET.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d }, i)) })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      PresetManager,
      {
        panelId: panel.id,
        presets,
        activePresetId,
        onAdd: handleAddPreset
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      import_react17.motion.button,
      {
        className: "dialkit-toolbar-add",
        onClick: handleCopy,
        title: "Copy parameters",
        whileTap: { scale: 0.9 },
        transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 },
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { style: { position: "relative", width: 16, height: 16 }, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_react17.AnimatePresence, { initial: false, mode: "wait", children: copied ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          import_react17.motion.svg,
          {
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            style: { position: "absolute", inset: 0, width: 16, height: 16, color: "var(--dial-text-label)" },
            initial: { scale: 0.8, opacity: 0 },
            animate: { scale: 1, opacity: 1 },
            exit: { scale: 0.8, opacity: 0 },
            transition: { duration: 0.08 },
            children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: ICON_CHECK })
          },
          "check"
        ) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
          import_react17.motion.svg,
          {
            viewBox: "0 0 24 24",
            fill: "none",
            style: { position: "absolute", inset: 0, width: 16, height: 16, color: "var(--dial-text-label)" },
            initial: { scale: 0.8, opacity: 0 },
            animate: { scale: 1, opacity: 1 },
            exit: { scale: 0.8, opacity: 0 },
            transition: { duration: 0.08 },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: ICON_CLIPBOARD.board, stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: ICON_CLIPBOARD.sparkle, fill: "currentColor" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: ICON_CLIPBOARD.body, stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
            ]
          },
          "clipboard"
        ) }) })
      }
    )
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dialkit-panel-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Folder, { title: panel.name, defaultOpen, isRoot: true, inline, onOpenChange: setIsPanelOpen, toolbar, children: renderControls() }) });
}

// src/components/DialRoot.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
var import_meta = {};
var isDevDefault = typeof process !== "undefined" && process?.env?.NODE_ENV ? process.env.NODE_ENV !== "production" : typeof import_meta !== "undefined" && import_meta.env?.MODE ? import_meta.env.MODE !== "production" : true;
function DialRoot({ position = "top-right", defaultOpen = true, mode = "popover", theme = "system", productionEnabled = isDevDefault, folderMode = "independent" }) {
  if (!productionEnabled) return null;
  const [panels, setPanels] = (0, import_react18.useState)([]);
  const [mounted, setMounted] = (0, import_react18.useState)(false);
  const inline = mode === "inline";
  const panelRef = (0, import_react18.useRef)(null);
  const [dragOffset, setDragOffset] = (0, import_react18.useState)(null);
  const [activePosition, setActivePosition] = (0, import_react18.useState)(position);
  const lastDragOffset = (0, import_react18.useRef)(null);
  const draggingRef = (0, import_react18.useRef)(false);
  const dragStartRef = (0, import_react18.useRef)(null);
  const didDragRef = (0, import_react18.useRef)(false);
  (0, import_react18.useEffect)(() => {
    setMounted(true);
    setPanels(DialStore.getPanels());
    const unsubscribe = DialStore.subscribeGlobal(() => {
      setPanels(DialStore.getPanels());
    });
    return unsubscribe;
  }, []);
  (0, import_react18.useEffect)(() => {
    if (!panelRef.current || inline) return;
    const observer = new MutationObserver(() => {
      const inner = panelRef.current?.querySelector(".dialkit-panel-inner");
      if (!inner) return;
      const collapsed = inner.getAttribute("data-collapsed") === "true";
      if (!collapsed) {
        if (dragOffset) {
          lastDragOffset.current = dragOffset;
          const bubbleCenterX = dragOffset.x + 21;
          const midX = window.innerWidth / 2;
          setActivePosition(bubbleCenterX < midX ? "top-left" : "top-right");
        } else {
          setActivePosition(position);
        }
        setDragOffset(null);
      } else if (lastDragOffset.current) {
        setDragOffset(lastDragOffset.current);
      }
    });
    observer.observe(panelRef.current, { subtree: true, attributes: true, attributeFilter: ["data-collapsed"] });
    return () => observer.disconnect();
  }, [inline, dragOffset, position]);
  const handlePointerDown = (0, import_react18.useCallback)((e) => {
    const inner = panelRef.current?.querySelector(".dialkit-panel-inner");
    if (!inner || inner.getAttribute("data-collapsed") !== "true") return;
    const rect = panelRef.current.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      elX: rect.left,
      elY: rect.top
    };
    didDragRef.current = false;
    draggingRef.current = true;
    e.target.setPointerCapture(e.pointerId);
  }, []);
  const handlePointerMove = (0, import_react18.useCallback)((e) => {
    if (!draggingRef.current || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    if (!didDragRef.current && Math.abs(dx) + Math.abs(dy) < 4) return;
    didDragRef.current = true;
    setDragOffset({
      x: dragStartRef.current.elX + dx,
      y: dragStartRef.current.elY + dy
    });
  }, []);
  const handlePointerUp = (0, import_react18.useCallback)((e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dragStartRef.current = null;
    if (didDragRef.current) {
      e.stopPropagation();
      const inner = panelRef.current?.querySelector(".dialkit-panel-inner");
      if (inner) {
        const blocker = (ev) => {
          ev.stopPropagation();
        };
        inner.addEventListener("click", blocker, { capture: true, once: true });
      }
    }
  }, []);
  if (!mounted || typeof window === "undefined") {
    return null;
  }
  if (panels.length === 0) {
    return null;
  }
  const dragStyle = dragOffset ? {
    top: dragOffset.y,
    left: dragOffset.x,
    right: "auto",
    bottom: "auto"
  } : void 0;
  const content = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ShortcutListener, { children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "dialkit-root", "data-mode": mode, "data-theme": theme, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
    "div",
    {
      ref: panelRef,
      className: "dialkit-panel",
      "data-position": inline ? void 0 : dragOffset ? void 0 : activePosition,
      "data-mode": mode,
      style: dragStyle,
      onPointerDown: !inline ? handlePointerDown : void 0,
      onPointerMove: !inline ? handlePointerMove : void 0,
      onPointerUp: !inline ? handlePointerUp : void 0,
      children: panels.map((panel) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Panel, { panel, defaultOpen: inline || defaultOpen, inline, folderMode }, panel.id))
    }
  ) }) });
  if (inline) {
    return content;
  }
  return (0, import_react_dom3.createPortal)(content, document.body);
}

// src/components/ButtonGroup.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
function ButtonGroup({ buttons }) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "dialkit-button-group", children: buttons.map((button, index) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
    "button",
    {
      className: "dialkit-button",
      onClick: button.onClick,
      children: button.label
    },
    index
  )) });
}

// src/components/ShortcutsMenu.tsx
var import_react19 = require("react");
var import_react_dom4 = require("react-dom");
var import_react20 = require("motion/react");
var import_jsx_runtime17 = require("react/jsx-runtime");
function formatShortcutKey(sc) {
  if (!sc.key) return "\u2014";
  const mod = sc.modifier === "alt" ? "\u2325" : sc.modifier === "shift" ? "\u21E7" : sc.modifier === "meta" ? "\u2318" : "";
  return `${mod}${sc.key.toUpperCase()}`;
}
function formatInteraction(sc) {
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
function ShortcutsMenu({ panelId }) {
  const [isOpen, setIsOpen] = (0, import_react19.useState)(false);
  const triggerRef = (0, import_react19.useRef)(null);
  const dropdownRef = (0, import_react19.useRef)(null);
  const [pos, setPos] = (0, import_react19.useState)({ top: 0, right: 0 });
  const open = (0, import_react19.useCallback)(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setIsOpen(true);
  }, []);
  const close = (0, import_react19.useCallback)(() => setIsOpen(false), []);
  const toggle = (0, import_react19.useCallback)(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);
  (0, import_react19.useEffect)(() => {
    if (!isOpen) return;
    const handler = (e) => {
      const target = e.target;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);
  const panel = DialStore.getPanel(panelId);
  if (!panel) return null;
  const shortcuts = Object.entries(panel.shortcuts);
  if (shortcuts.length === 0) return null;
  const rows = shortcuts.map(([path, shortcut]) => {
    const findLabel = (controls) => {
      for (const c of controls) {
        if (c.path === path) return c.label;
        if (c.type === "folder" && c.children) {
          const found = findLabel(c.children);
          if (found) return found;
        }
      }
      return path;
    };
    return {
      path,
      shortcut,
      label: findLabel(panel.controls)
    };
  });
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      import_react20.motion.button,
      {
        ref: triggerRef,
        className: "dialkit-shortcuts-trigger",
        onClick: toggle,
        title: "Keyboard shortcuts",
        whileTap: { scale: 0.9 },
        transition: { type: "spring", visualDuration: 0.15, bounce: 0.3 },
        children: /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("rect", { x: "2", y: "6", width: "20", height: "12", rx: "2" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("path", { d: "M6 10H6.01" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("path", { d: "M10 10H10.01" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("path", { d: "M14 10H14.01" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("path", { d: "M18 10H18.01" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("path", { d: "M8 14H16" })
        ] })
      }
    ),
    (0, import_react_dom4.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_react20.AnimatePresence, { children: isOpen && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
        import_react20.motion.div,
        {
          ref: dropdownRef,
          className: "dialkit-root dialkit-shortcuts-dropdown",
          style: { position: "fixed", top: pos.top, right: pos.right },
          initial: { opacity: 0, y: 4, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 4, scale: 0.97, pointerEvents: "none" },
          transition: { type: "spring", visualDuration: 0.15, bounce: 0 },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "dialkit-shortcuts-title", children: "Keyboard Shortcuts" }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "dialkit-shortcuts-list", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "dialkit-shortcuts-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "dialkit-shortcuts-row-key", children: formatShortcutKey(row.shortcut) }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "dialkit-shortcuts-row-label", children: row.label }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "dialkit-shortcuts-row-mode", children: formatInteraction(row.shortcut) })
            ] }, row.path)) }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "dialkit-shortcuts-hint", children: "See pill badges on controls for keys" })
          ]
        }
      ) }),
      document.body
    )
  ] });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ButtonGroup,
  ColorControl,
  DialRoot,
  DialStore,
  EasingVisualization,
  Folder,
  PresetManager,
  SelectControl,
  ShortcutsMenu,
  Slider,
  SpringControl,
  SpringVisualization,
  TextControl,
  Toggle,
  TransitionControl,
  unwrapVisibility,
  useDialKit,
  withVisibility
});
//# sourceMappingURL=index.cjs.map