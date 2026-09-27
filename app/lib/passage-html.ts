import sanitizeHtml from "sanitize-html";

// Passages need only basic reading structure. Never trust attributes, links,
// images, styles or embedded content from an uploaded document.
export function sanitizePassageHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ["b", "br", "div", "em", "i", "li", "ol", "p", "span", "strong", "u", "ul"],
    allowedAttributes: {},
    disallowedTagsMode: "completelyDiscard",
  });
}
