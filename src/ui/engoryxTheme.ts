import { defineTheme, defineSyntaxTheme } from "@astryxdesign/core/theme";
import { engoryxIconRegistry } from "./icons.ts";


const engoryxSyntax = defineSyntaxTheme({
  name: "engoryx-syntax",
  tokens: {
    keyword: ["#4f46e5", "#818cf8"],
    string: ["#059669", "#34d399"],
    comment: ["#64748b", "#94a3b8"],
    number: ["#d97706", "#fbbf24"],
    function: ["#2563eb", "#60a5fa"],
    type: ["#7c3aed", "#a78bfa"],
    variable: ["#0f172a", "#f8fafc"],
    operator: ["#475569", "#94a3b8"],
    constant: ["#ea580c", "#fb923c"],
    tag: ["#e11d48", "#f43f5e"],
    attribute: ["#0284c7", "#38bdf8"],
    property: ["#0d9488", "#2dd4bf"],
    punctuation: ["#94a3b8", "#64748b"],
    background: ["#f8fafc", "#0f172a"],
  },
});

export const engoryxTheme = defineTheme({
  name: "engoryx",

  typography: {
    scale: { base: 14, ratio: 1.18 },
    body: {
      family: "Inter",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    heading: {
      family: "Inter",
      fallbacks:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      weights: { 1: "bold", 2: "bold", 3: "bold", 4: "bold" },
    },
    code: {
      family: "ui-monospace",
      fallbacks:
        '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },

  motion: { fast: 120, medium: 240, slow: 450, ratio: 0.75 },

  syntax: engoryxSyntax,

  tokens: {
    // Backgrounds
    "--color-background-surface": ["#ffffff", "#1e293b"],
    "--color-background-body": ["#f8fafc", "#0f172a"],
    "--color-background-card": ["#ffffff", "#1e293b"],
    "--color-background-popover": ["#ffffff", "#1e293b"],
    "--color-background-muted": ["#f1f5f9", "#1e293b"],

    // Accent & Brand (Engoryx Navy / Indigo)
    "--color-accent": ["#4f46e5", "#818cf8"],
    "--color-accent-muted": ["#eef2ff", "#312e81"],
    "--color-neutral": ["#0000000D", "#FFFFFF14"],

    // Overlays
    "--color-overlay": ["#0f172a80", "#000000CC"],
    "--color-overlay-hover": ["#00000008", "#FFFFFF0D"],
    "--color-overlay-pressed": ["#00000014", "#FFFFFF1A"],

    // Text
    "--color-text-primary": ["#0f172a", "#f8fafc"],
    "--color-text-secondary": ["#475569", "#94a3b8"],
    "--color-text-disabled": ["#94a3b8", "#64748b"],
    "--color-text-accent": ["#4f46e5", "#818cf8"],
    "--color-on-dark": "#ffffff",
    "--color-on-light": "#0f172a",
    "--color-on-accent": ["#ffffff", "#0f172a"],
    "--color-on-success": ["#ffffff", "#0f172a"],
    "--color-on-error": ["#ffffff", "#0f172a"],
    "--color-on-warning": "#0f172a",

    // Icon
    "--color-icon-accent": ["#4f46e5", "#818cf8"],
    "--color-icon-primary": ["#0f172a", "#f8fafc"],
    "--color-icon-secondary": ["#64748b", "#94a3b8"],
    "--color-icon-disabled": ["#94a3b8", "#64748b"],

    // Status / Sentiment
    "--color-success": ["#059669", "#34d399"],
    "--color-error": ["#e11d48", "#f43f5e"],
    "--color-warning": ["#d97706", "#fbbf24"],
    "--color-success-muted": ["#ecfdf5", "#064e3b3D"],
    "--color-error-muted": ["#fff1f2", "#8813373D"],
    "--color-warning-muted": ["#fffbeb", "#78350f3D"],

    // Borders
    "--color-border": ["#e2e8f0", "#334155"],
    "--color-border-emphasized": ["#cbd5e1", "#475569"],

    // Effects
    "--color-skeleton": ["#e2e8f0", "#334155"],
    "--color-shadow": ["#0f172a0f", "#0000004D"],
    "--color-tint-hover": ["black", "white"],

    // Categorical Colors (for badges and operational status tags)
    "--color-background-blue": ["#e0f2fe", "#0369a13D"],
    "--color-border-blue": ["#bae6fd", "#38bdf8"],
    "--color-icon-blue": ["#0284c7", "#38bdf8"],
    "--color-text-blue": ["#0369a1", "#7dd3fc"],

    "--color-background-green": ["#dcfce7", "#15803d3D"],
    "--color-border-green": ["#bbf7d0", "#4ade80"],
    "--color-icon-green": ["#16a34a", "#4ade80"],
    "--color-text-green": ["#15803d", "#86efac"],

    "--color-background-yellow": ["#fef9c3", "#a162073D"],
    "--color-border-yellow": ["#fde047", "#eab308"],
    "--color-icon-yellow": ["#ca8a04", "#facc15"],
    "--color-text-yellow": ["#a16207", "#fde047"],

    "--color-background-red": ["#ffe4e6", "#be123c3D"],
    "--color-border-red": ["#fecdd3", "#fb7185"],
    "--color-icon-red": ["#e11d48", "#fb7185"],
    "--color-text-red": ["#be123c", "#fda4af"],

    "--color-background-purple": ["#f3e8ff", "#7e22ce3D"],
    "--color-border-purple": ["#e9d5ff", "#c084fc"],
    "--color-icon-purple": ["#9333ea", "#c084fc"],
    "--color-text-purple": ["#7e22ce", "#d8b4fe"],

    "--color-background-orange": ["#ffedd5", "#c2410c3D"],
    "--color-border-orange": ["#fed7aa", "#fb923c"],
    "--color-icon-orange": ["#ea580c", "#fb923c"],
    "--color-text-orange": ["#c2410c", "#fdba74"],

    "--color-background-teal": ["#ccfbf1", "#0f766e3D"],
    "--color-border-teal": ["#99f6e4", "#2dd4bf"],
    "--color-icon-teal": ["#0d9488", "#2dd4bf"],
    "--color-text-teal": ["#0f766e", "#5eead4"],

    "--color-background-cyan": ["#cffafe", "#0e74903D"],
    "--color-border-cyan": ["#a5f3fc", "#22d3ee"],
    "--color-icon-cyan": ["#0891b2", "#22d3ee"],
    "--color-text-cyan": ["#0e7490", "#67e8f9"],

    "--color-background-pink": ["#fce7f3", "#be185d3D"],
    "--color-border-pink": ["#fbcfe8", "#f472b6"],
    "--color-icon-pink": ["#db2777", "#f472b6"],
    "--color-text-pink": ["#be185d", "#f9a8d4"],

    "--color-background-gray": ["#f1f5f9", "#1e293b"],
    "--color-border-gray": ["#e2e8f0", "#334155"],
    "--color-icon-gray": ["#64748b", "#94a3b8"],
    "--color-text-gray": ["#334155", "#cbd5e1"],

    // Radius scale (clean AEC enterprise density)
    "--radius-none": "0px",
    "--radius-inner": "0.375rem",
    "--radius-element": "0.5rem",
    "--radius-container": "0.75rem",
    "--radius-page": "1.25rem",
    "--radius-full": "9999px",

    // Shadows
    "--shadow-low": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    "--shadow-med": "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
    "--shadow-high": "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
    "--shadow-inset-hover": "inset 0px 0px 0px 2px #4f46e54D",
    "--shadow-inset-selected": "inset 0px 0px 0px 2px #4f46e580",
    "--shadow-inset-success": "inset 0px 0px 0px 2px #0596694D",
    "--shadow-inset-warning": "inset 0px 0px 0px 2px #d977064D",
    "--shadow-inset-error": "inset 0px 0px 0px 2px #e11d484D",
  },

  components: {
    button: {
      "variant:primary": {
        backgroundColor: "var(--color-accent)",
        color: "#ffffff",
      },
      "variant:destructive": {
        backgroundColor: "var(--color-error-muted)",
        color: "var(--color-error)",
      },
    },

    card: {
      base: {
        padding: "var(--spacing-3)",
      },
    },

    badge: {
      "variant:info": {
        backgroundColor: "light-dark(#e0f2fe, #0369a13D)",
        color: "light-dark(#0369a1, #7dd3fc)",
      },
      "variant:success": {
        backgroundColor: "light-dark(#dcfce7, #15803d3D)",
        color: "light-dark(#15803d, #86efac)",
      },
      "variant:warning": {
        backgroundColor: "light-dark(#fef9c3, #a162073D)",
        color: "light-dark(#a16207, #fde047)",
      },
      "variant:error": {
        backgroundColor: "light-dark(#ffe4e6, #be123c3D)",
        color: "light-dark(#be123c, #fda4af)",
      },
      "variant:neutral": {
        backgroundColor: "var(--color-background-gray)",
        color: "var(--color-text-gray)",
      },
    },

    statusdot: {
      "variant:success": { backgroundColor: "light-dark(#059669, #34d399)" },
      "variant:warning": { backgroundColor: "light-dark(#d97706, #fbbf24)" },
      "variant:error": { backgroundColor: "light-dark(#e11d48, #f43f5e)" },
      "variant:accent": { backgroundColor: "light-dark(#4f46e5, #818cf8)" },
    },
  },

  icons: engoryxIconRegistry,
});

export default engoryxTheme;
