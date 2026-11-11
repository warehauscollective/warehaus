export type DomNode = {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  childNodes: DomNode[];
  children: DomNode[];
  style: Record<string, string>;
  attributes: Record<string, string>;
  parentNode: DomNode | null;
  ownerDocument: DomDocument | null;
  textContent: string;
  namespaceURI: string;
  nextSibling: DomNode | null;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  removeAttribute: (name: string) => void;
  appendChild: (child: DomNode) => DomNode;
  removeChild: (child: DomNode) => DomNode;
  insertBefore: (child: DomNode, before: DomNode | null) => DomNode;
  addEventListener: () => void;
  removeEventListener: () => void;
};

export type DomDocument = DomNode & {
  createElement: (tag: string) => DomNode;
  createElementNS: (ns: string, tag: string) => DomNode;
  createTextNode: (text: string) => DomNode;
  body: DomNode;
};

export function textOf(node: { childNodes?: DomNode[]; textContent?: string }): string {
  if (node.childNodes && node.childNodes.length > 0) return node.childNodes.map((child) => textOf(child)).join('');
  return node.textContent ?? '';
}

export function installTestDom(): DomDocument {
  const existing = (globalThis as unknown as { document?: DomDocument }).document;
  if (existing?.createElement) return existing;

  function linkSiblings(parent: DomNode) {
    parent.childNodes.forEach((child, index) => {
      child.nextSibling = parent.childNodes[index + 1] ?? null;
    });
  }

  function createNode(tag: string): DomNode {
    const node: DomNode = {
      nodeType: tag === '#text' ? 3 : 1,
      nodeName: tag.toUpperCase(),
      tagName: tag === '#text' ? undefined : tag.toUpperCase(),
      childNodes: [],
      children: [],
      style: {},
      attributes: {},
      parentNode: null,
      ownerDocument: null,
      textContent: '',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      nextSibling: null,
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        if (child.nodeType === 1) this.children.push(child);
        linkSiblings(this);
        return child;
      },
      removeChild(child) {
        this.childNodes = this.childNodes.filter((item) => item !== child);
        this.children = this.children.filter((item) => item !== child);
        child.parentNode = null;
        linkSiblings(this);
        return child;
      },
      insertBefore(child, before) {
        child.parentNode = this;
        const index = before ? this.childNodes.indexOf(before) : -1;
        if (index < 0) this.childNodes.push(child);
        else this.childNodes.splice(index, 0, child);
        if (child.nodeType === 1) this.children.push(child);
        linkSiblings(this);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  }

  const document = createNode('#document') as DomDocument;
  document.nodeType = 9;
  document.createElement = (tag) => {
    const node = createNode(tag);
    node.ownerDocument = document;
    return node;
  };
  document.createElementNS = (_ns, tag) => document.createElement(tag);
  document.createTextNode = (text) => {
    const node = createNode('#text');
    node.nodeType = 3;
    node.textContent = text;
    node.ownerDocument = document;
    return node;
  };
  document.body = document.createElement('body');
  const html = document.createElement('html');
  html.appendChild(document.body);
  const view = {
    document,
    location: { search: '' },
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  };
  (document as DomDocument & { defaultView: typeof view; documentElement: DomNode }).defaultView = view;
  (document as DomDocument & { documentElement: DomNode }).documentElement = html;
  const target = globalThis as Record<string, unknown>;
  target.window = view;
  target.document = document;
  target.HTMLElement = view.HTMLElement;
  target.HTMLIFrameElement = view.HTMLIFrameElement;
  target.Element = view.Element;
  target.Node = view.Node;
  target.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}
