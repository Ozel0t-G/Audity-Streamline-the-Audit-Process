export type UserAgentParts = {
  raw: string | null;
  browser: string | null;
  os: string | null;
  device: "mobile" | "tablet" | "desktop" | "bot" | null;
};

/**
 * Lightweight user-agent parser. Not exhaustive but sufficient for audit
 * logs (browser family, OS family, device category) without adding a
 * dependency.
 */
export function parseUserAgent(input?: string | null): UserAgentParts {
  if (!input) return { raw: null, browser: null, os: null, device: null };
  const ua = String(input);
  const lower = ua.toLowerCase();

  let browser: string | null = null;
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
  else if (/curl\//i.test(ua)) browser = "curl";
  else if (/wget\//i.test(ua)) browser = "wget";
  else if (/postman/i.test(ua)) browser = "Postman";

  let os: string | null = null;
  if (/windows nt 10/i.test(ua)) os = "Windows 10/11";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  let device: UserAgentParts["device"] = null;
  if (/bot|crawler|spider|slurp/i.test(lower)) device = "bot";
  else if (/iphone|android.*mobile|windows phone/i.test(ua)) device = "mobile";
  else if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) device = "tablet";
  else if (browser) device = "desktop";

  return { raw: ua.slice(0, 400), browser, os, device };
}
