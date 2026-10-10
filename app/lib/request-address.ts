import { isIP } from "node:net";

export function requestAddress(request: Request) {
  // Vercel overwrites x-forwarded-for at its edge. Never prefer a caller's
  // x-real-ip over that trusted platform header.
  const trustedHeader = process.env.VERCEL === "1"
    ? "x-forwarded-for" : process.env.TRUSTED_CLIENT_IP_HEADER;
  if (trustedHeader) {
    const address = request.headers.get(trustedHeader)?.split(",")[0]?.trim();
    return address && isIP(address) ? address : "unknown";
  }
  if (process.env.NODE_ENV !== "production") {
    const address = request.headers.get("x-real-ip")?.trim()
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return address && isIP(address) ? address : "unknown";
  }
  // Self-hosted production requires a proxy which overwrites the configured
  // header. Without it, anonymous traffic shares one conservative quota.
  return "unknown";
}
