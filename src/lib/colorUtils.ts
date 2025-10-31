export const getComputedColor = (cssVarString: string): string => {
  const match = cssVarString.match(/--[\w-]+/);
  if (match && typeof window !== 'undefined') {
    const varName = match[0];
    try {
      const computedStyle = getComputedStyle(document.documentElement);
      const colorValue = computedStyle.getPropertyValue(varName).trim();
      return colorValue || '#8884d8'; // Fallback color
    } catch (error) {
      console.error(`Error computing style for ${varName}:`, error);
      return '#8884d8'; // Fallback color on error
    }
  }
  return cssVarString || '#8884d8';
};