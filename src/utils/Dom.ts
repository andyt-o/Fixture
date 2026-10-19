// ==============================================================================
// Functions
// ==============================================================================
export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

export function requireClosest<T extends Element>(element: Element, selector: string): T {
  const match = element.closest<T>(selector);
  if (!match) throw new Error(`Required ancestor not found: ${selector}`);
  return match;
}

export function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, char => replacements[char] ?? char);
}
