**English | [日本語](../interactive-ui.md)**

# Interactive UI

Interactive UI lets the AI embed dynamic UI components — forms, buttons, sliders, games — directly inside chat messages.
The AI defines the UI as JSON inside a special fenced code block.

---

## Table of Contents

- [Overview](#overview)
- [Rendering Modes](#rendering-modes)
- [UI Block Format](#ui-block-format)
- [Primitive Reference](#primitive-reference)
- [Default Mode vs Live Mode](#default-mode-vs-live-mode)
- [Sandbox HTML](#sandbox-html)
- [Examples](#examples)

---

## Overview

The AI includes an ` ```interactive-ui ` fenced block in its response to display UI.

```
User: Show me a form to plan a trip

AI: Sure! Fill out the form below.

​```interactive-ui
{ ... UI JSON definition ... }
​```
```

When the user fills the form and submits, the structured data is automatically sent as a user message,
and the AI responds based on the input.

---

## Rendering Modes

Two rendering modes are available.

### Mode 1: Primitive Composition (Lightweight / Integrated)

Lightweight UI that blends naturally into the chat. Atomic primitives (`box`, `button`, `input`, etc.)
are composed via JSON to build arbitrary UI.

**Best for:**
- Form inputs, option selection
- Progress indicators, card lists
- Interactions that fit naturally into the chat flow

### Mode 2: Sandbox HTML (Flexible / Isolated)

The AI writes HTML/CSS/JavaScript directly, which runs inside a sandboxed iframe.
Same approach as Claude Artifacts.

**Best for:**
- Games (Canvas rendering, complex logic)
- Data visualization (Chart.js, D3.js, etc.)
- Animations, simulations

---

## UI Block Format

### Basic Structure

```json
{
  "id": "unique-block-id",
  "mode": "default",
  "title": "Optional Title",
  "root": { ... UI tree ... },
  "actions": [
    { "type": "submit", "label": "Submit", "variant": "primary" }
  ]
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✓ | Unique block ID |
| `mode` | string | — | `"default"` (one-shot) or `"live"` (persistent) |
| `title` | string | — | Block title |
| `state` | object | — | Dynamic state (for live mode) |
| `root` | UINode | ✓ | Root node of the UI tree |
| `actions` | UIAction[] | — | Submit / cancel buttons |

### UINode Structure

```json
{
  "primitive": "box",
  "id": "optional-id",
  "props": { "direction": "column", "gap": 16 },
  "children": [ ... child nodes ... ],
  "bind": "state.fieldName",
  "showIf": "state.isVisible"
}
```

| Field | Description |
|---|---|
| `primitive` | Primitive name (see reference below) |
| `id` | Node identifier (used for event identification) |
| `props` | Primitive-specific properties |
| `children` | Child nodes (used with layout primitives) |
| `bind` | Bind input value to a state key path (e.g. `"form.name"`) |
| `showIf` | Only render when this state key path is truthy (e.g. `"ui.showDetail"`) |

---

## Primitive Reference

### Layout

#### `box`

General-purpose container (like a div). Arranges children horizontally or vertically.

```json
{
  "primitive": "box",
  "props": {
    "direction": "column",
    "gap": 16,
    "padding": 16,
    "align": "center",
    "bg": "#1e1e2e",
    "border": true,
    "rounded": true,
    "minWidth": 200,
    "maxWidth": 400
  }
}
```

| Prop | Type | Description |
|---|---|---|
| `direction` | `"row"` / `"column"` | Child layout direction |
| `gap` | number | Space between children (px) |
| `padding` | number | Inner padding (px) |
| `align` | string | Child alignment (`"start"` / `"center"` / `"end"`) |
| `bg` | string | Background color |
| `border` | boolean | Show border |
| `rounded` | boolean | Round corners |
| `minWidth` / `maxWidth` | number | Width constraints (px) |

---

#### `grid`

Grid layout. Good for game boards or image galleries.

```json
{
  "primitive": "grid",
  "props": { "cols": 3, "gap": 8, "cellWidth": 100, "cellHeight": 100 }
}
```

---

#### `scroll`

Scrollable region.

```json
{ "primitive": "scroll", "props": { "maxHeight": 300 } }
```

---

#### `divider`

Horizontal or vertical separator line.

```json
{ "primitive": "divider", "props": { "direction": "horizontal" } }
```

---

### Display

#### `text`

Text display. Supports Markdown rendering.

```json
{
  "primitive": "text",
  "props": {
    "content": "**Hello** World",
    "size": "lg",
    "weight": "bold",
    "color": "#cdd6f4",
    "align": "center",
    "markdown": true
  }
}
```

| `size` | Description |
|---|---|
| `"xs"` / `"sm"` / `"md"` / `"lg"` / `"xl"` | Font size |

---

#### `icon`

Emoji icon.

```json
{ "primitive": "icon", "props": { "emoji": "🎯", "size": 32 } }
```

---

#### `badge`

Badge or label.

```json
{ "primitive": "badge", "props": { "content": "NEW", "color": "#fff", "bg": "#7c3aed" } }
```

---

#### `image`

Image display.

```json
{ "primitive": "image", "props": { "url": "https://...", "alt": "description", "width": 200, "fit": "cover" } }
```

---

#### `progress-bar`

Progress bar.

```json
{ "primitive": "progress-bar", "props": { "value": 75, "max": 100, "showLabel": true } }
```

---

### Interaction

#### `button`

Button. Clicking sends the action ID to the AI.

```json
{
  "primitive": "button",
  "props": { "label": "Run", "actionId": "run", "variant": "primary" }
}
```

| `variant` | Description |
|---|---|
| `"primary"` | Main action (purple, emphasized) |
| `"secondary"` | Secondary action (gray) |
| `"danger"` | Destructive action (red) |

---

#### `input`

Text input field.

```json
{
  "primitive": "input",
  "props": { "placeholder": "Enter your name...", "multiline": false },
  "bind": "form.name"
}
```

---

#### `select`

Dropdown selection.

```json
{
  "primitive": "select",
  "props": { "placeholder": "Select...", "options": ["Option A", "Option B", "Option C"] },
  "bind": "form.choice"
}
```

---

#### `checkbox`

Checkbox.

```json
{
  "primitive": "checkbox",
  "props": { "label": "I agree" },
  "bind": "form.agreed"
}
```

---

#### `slider`

Slider.

```json
{
  "primitive": "slider",
  "props": { "min": 0, "max": 100, "step": 5 },
  "bind": "form.value"
}
```

---

#### `chips`

Tag selection. Supports multi-select (`multi: true`).

```json
{
  "primitive": "chips",
  "props": { "options": ["Food", "Sightseeing", "Nature", "Shopping"], "multi": true },
  "bind": "form.interests"
}
```

---

#### `clickable`

Clickable region that wraps child nodes.

```json
{
  "primitive": "clickable",
  "props": { "actionId": "select_item", "cursor": "pointer", "hoverBg": "rgba(255,255,255,0.1)" },
  "children": [ ... ]
}
```

---

## Default Mode vs Live Mode

### Default Mode (`mode: "default"`)

When the user clicks submit, inputs are sent as a user message.
After submission the UI becomes disabled (submitted state).

Use for general forms and surveys.

### Live Mode (`mode: "live"`)

User interactions are sent to the AI in real time and the AI updates `state` to re-render the UI.
No chat history is recorded; communication happens via silent IPC.

Use for games, interactive tools, real-time visualizations.

```json
{
  "id": "counter",
  "mode": "live",
  "state": { "count": 0 },
  "root": {
    "primitive": "box",
    "props": { "direction": "row", "gap": 16, "align": "center" },
    "children": [
      { "primitive": "button", "props": { "label": "-", "actionId": "decrement" } },
      { "primitive": "text", "props": { "content": "{state.count}" } },
      { "primitive": "button", "props": { "label": "+", "actionId": "increment" } }
    ]
  }
}
```

---

## Sandbox HTML

For complex UI that primitives can't express, the AI can write HTML/CSS/JS directly.

````markdown
​```interactive-ui
{
  "id": "chart-1",
  "type": "sandbox",
  "html": "<!DOCTYPE html><html>...</html>"
}
​```
````

- Runs safely inside a sandboxed iframe
- Can communicate with the parent window via `postMessage`
- Canvas, WebGL, and CDN libraries are supported

---

## Examples

### Survey Form

```json
{
  "id": "survey-1",
  "title": "Trip Planner",
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 16, "padding": 16 },
    "children": [
      {
        "primitive": "select",
        "props": { "placeholder": "Select destination", "options": ["Domestic", "Asia", "Europe", "North America"] },
        "bind": "destination"
      },
      {
        "primitive": "slider",
        "props": { "min": 5, "max": 100, "step": 5 },
        "bind": "budget"
      },
      {
        "primitive": "chips",
        "props": { "options": ["Food", "Sightseeing", "Nature", "Shopping"], "multi": true },
        "bind": "interests"
      }
    ]
  },
  "actions": [
    { "type": "submit", "label": "Suggest a Plan", "variant": "primary" }
  ]
}
```

### Choice Prompt

```json
{
  "id": "choice-1",
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 8 },
    "children": [
      { "primitive": "text", "props": { "content": "Which approach would you like to use?", "weight": "bold" } },
      { "primitive": "button", "props": { "label": "A: REST API", "actionId": "choose_rest", "variant": "secondary" } },
      { "primitive": "button", "props": { "label": "B: GraphQL", "actionId": "choose_graphql", "variant": "secondary" } }
    ]
  }
}
```
