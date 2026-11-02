// Allow-list sanitizer for workspace rich text (blocks scripts, handlers, styles).
export function sanitizeWorkspaceHtml(value: string): string {
  if (!value) return "";
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>");
  }
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","UL","OL","LI","H1","H2","H3","BLOCKQUOTE","A","TABLE","THEAD","TBODY","TR","TD","TH","HR"]);
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if (!(node instanceof Element)) return "";
    const children = Array.from(node.childNodes).map(clean).join("");
    if (!allowed.has(node.tagName)) return children;
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      return /^(https?:|mailto:)/i.test(href) ? '<a href="' + href.replace(/&/g,"&amp;").replace(/"/g,"&quot;") + '" target="_blank" rel="noopener noreferrer">' + children + "</a>" : children;
    }
    return "<" + node.tagName.toLowerCase() + ">" + children + "</" + node.tagName.toLowerCase() + ">";
  };
  return Array.from(parsed.body.childNodes).map(clean).join("");
}
