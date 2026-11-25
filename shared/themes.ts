import type { PluginThemeContribution } from "@getpaseo/plugin";

/**
 * Five curated UI themes adapted from Multigravity's ThemePresetCatalog.
 * Clean names without plugin branding suffixes under Settings -> Appearance.
 */
export const CURATED_THEMES: readonly PluginThemeContribution[] = [
  {
    id: "mg-solarized-light",
    name: "Solarized Light",
    appearance: "light",
    colors: {
      background: "#faf4e5",
      foreground: "#435155",
      raised: "#fdf9ee",
      control: "#efe7d2",
      border: "#ddd3ba",
      accent: "#cb4b16",
      mutedForeground: "#738285",
      ring: "#268bd2",
      sidebar: "#f2e9d4",
    },
  },
  {
    id: "mg-nord",
    name: "Nord",
    appearance: "dark",
    colors: {
      background: "#2e3440",
      foreground: "#d8dee9",
      raised: "#3b4252",
      control: "#434c5e",
      border: "#4c566a",
      accent: "#88c0d0",
      mutedForeground: "#9aa5b8",
      ring: "#81a1c1",
      sidebar: "#242933",
    },
  },
  {
    id: "mg-tokyo-night",
    name: "Tokyo Night",
    appearance: "dark",
    colors: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      raised: "#24283b",
      control: "#2f3549",
      border: "#3b4261",
      accent: "#7aa2f7",
      mutedForeground: "#7c85a6",
      ring: "#bb9af7",
      sidebar: "#13141d",
    },
  },
  {
    id: "mg-catppuccin-macchiato",
    name: "Catppuccin Macchiato",
    appearance: "dark",
    colors: {
      background: "#24273a",
      foreground: "#cad3f5",
      raised: "#363a4f",
      control: "#494d64",
      border: "#5b6078",
      accent: "#c6a0f6",
      mutedForeground: "#939ab7",
      ring: "#8aadf4",
      sidebar: "#1b1e2e",
    },
  },
  {
    id: "mg-everforest-dark",
    name: "Everforest Dark",
    appearance: "dark",
    colors: {
      background: "#2d353b",
      foreground: "#d3c6aa",
      raised: "#343f44",
      control: "#3d484d",
      border: "#4f585e",
      accent: "#a7c080",
      mutedForeground: "#9aa69d",
      ring: "#83c092",
      sidebar: "#232a2e",
    },
  },
];
