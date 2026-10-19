// ==============================================================================
// Imports
// ==============================================================================
import "../styles/Toggle.css";

// ==============================================================================
// Functions
// ==============================================================================
export function buildToggleRow(id: string, label: string, sublabel: string, checked: boolean): string {
  const checkedAttr = checked ? " checked" : "";
  return `
    <div class="toggle-row">
      <div class="toggle-row__body">
        <span class="toggle-row__label">${label}</span>
        <span class="toggle-row__sublabel">${sublabel}</span>
      </div>
      <label class="toggle" aria-label="${label}">
        <input type="checkbox" class="toggle__input" id="${id}"${checkedAttr} />
        <span class="toggle__track"></span>
      </label>
    </div>
  `;
}

export function buildCompactToggle(id: string, label: string, checked: boolean): string {
  const checkedAttr = checked ? " checked" : "";
  return `
    <label class="toggle toggle--compact">
      <input type="checkbox" class="toggle__input" id="${id}"${checkedAttr} />
      <span class="toggle__track"></span>
      <span>${label}</span>
    </label>
  `;
}
