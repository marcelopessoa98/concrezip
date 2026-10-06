export function getElement<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento não encontrado: ${selector}`);
  return element;
}

export function setText(selector: string, value: string, root: ParentNode = document): void {
  getElement<HTMLElement>(selector, root).textContent = value;
}

export function setHidden(selector: string, hidden: boolean, root: ParentNode = document): void {
  getElement<HTMLElement>(selector, root).hidden = hidden;
}
