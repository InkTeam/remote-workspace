/**
 * Save customize init script, set to empty or null to delete
 */
export function saveCustomizeInitScript(content: string): void {
  if (content === null || content === '') {
    localStorage.removeItem('customizeInitScript');
  } else {
    localStorage.setItem('customizeInitScript', content);
  }
}

export function loadCustomizeInitScript(): string {
  return localStorage.getItem('customizeInitScript') || '';
}
