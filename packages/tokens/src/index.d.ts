export declare const scalars: Record<string, string>;

export declare const tokens: {
  font: { mono: string };
  type: { xs: string; sm: string; base: string; md: string; lg: string; xl: string; '2xl': string; '3xl': string };
  lineHeight: { tight: string; head: string; body: string };
  tracking: { display: string; eyebrow: string };
  space: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11, string>;
  layout: { sectionY: string; gutter: string; maxw: string };
  radius: { sm: string; base: string; lg: string; pill: string };
  cut: { base: string; lg: string };
  motion: { speed: string; ease: string };
};

export declare const colorThemes: { dark: Record<string, string>; light: Record<string, string> };

/** Render the scalar tokens as a CSS `:root { … }` block. */
export declare function toCssRoot(scalars: Record<string, string>): string;

/** Render the color themes as `:root { …dark… }` + `:root.light { …light… }`. */
export declare function toCssThemes(themes: { dark: Record<string, string>; light: Record<string, string> }): string;
