export const getComputedColor = (cssVarString: string): string => {
  // Extracts the variable name (e.g., '--chart-1') from "hsl(var(--chart-1))"
  const match = cssVarString.match(/--[\w-]+/);
  if (match && typeof window !== 'undefined') {
    const varName = match[0];
    try {
      // Get the computed style from the root element
      const computedStyle = getComputedStyle(document.documentElement);
      // Read the variable value and trim whitespace
      const colorValue = computedStyle.getPropertyValue(varName).trim();
      // If the value is successfully read, return it, otherwise return a default
      return colorValue || '#8884d8'; // Fallback color
    } catch (error) {
      console.error(`Error computing style for ${varName}:`, error);
      return '#8884d8'; // Fallback color on error
    }
  }
  // If it's not a CSS variable string or window is undefined, return the original string or fallback
  return cssVarString || '#8884d8';
};