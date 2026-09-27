import { sanitizePassageHtml } from "@/app/lib/passage-html";

export default function SafePassage({
  html,
  className,
}: {
  html: string;
  className: string;
}) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizePassageHtml(html) }} />;
}
