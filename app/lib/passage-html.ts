import sanitizeHtml from "sanitize-html";

// Passages need only basic reading structure. Never trust attributes, links,
// images, styles or embedded content from an uploaded document.
export function sanitizePassageHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ["b", "br", "div", "em", "i", "li", "ol", "p", "span", "strong", "u", "ul"],
    allowedAttributes: {},
    // completelyDiscard also removes top-level plain text. Preserve reading
    // content while discarding executable/embedded element contents entirely.
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "xmp", "noscript", "iframe", "object", "embed", "svg", "math"],
  });
}
