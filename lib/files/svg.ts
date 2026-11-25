/**
 * The gate for an SVG that lands in a public bucket (the company logo). An SVG is a document, not
 * a picture: opened by its own URL it runs its scripts, follows its links and loads what it points
 * at — on our Storage origin. So a file that carries any of that is REFUSED, never cleaned: a logo
 * has no use for it, and a refusal leaves nothing half-trusted behind.
 *
 * Refused: script and every element that embeds another document (foreignObject, iframe, embed,
 * object, …), the XHTML namespace, event-handler attributes (`on…=`), javascript: / vbscript: /
 * data:text/html however they are spelled with character references or CSS escapes, a DTD
 * internal subset (entities and default attributes smuggle markup), xml-stylesheet, an href that
 * leaves the document (only `#id` and data:image/png|jpeg|webp|gif stay), an animation of href or
 * of a handler, external CSS (@import, url() to another origin), and any encoding a browser could
 * read differently from this check (control characters, a declared encoding that is not
 * ASCII-compatible).
 *
 * The markup is walked tag by tag, as an XML parser reads it; what the walk cannot read is refused
 * too — a well-formed logo always reads, and a browser shows nothing of a malformed one anyway.
 */

/** XML 1.0 has no use for them; NUL marks UTF-16/32 read as UTF-8, ESC an ISO-2022 shift. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const DECLARED_ENCODING = /^\ufeff?\s*<\?xml\b[^>]*?\bencoding\s*=\s*["']([^"']*)["']/i;
/** Encodings in which an ASCII byte is that ASCII character and nothing else. */
const SAFE_ENCODING = /^(?:utf-?8|us-ascii|ascii|iso-8859-1|latin-?1|windows-125[0-8])$/i;

/** Element names, whatever the prefix; a closing tag counts as well. */
const FORBIDDEN_ELEMENT =
  /<\s*\/?\s*(?:[^\s<>/:]+:)?(?:script|foreignobject|iframe|frame|frameset|embed|object|applet|portal|handler|listener|meta|base|link)\b/i;
const DTD_DECLARATION = /<!\s*(?:entity|attlist|element|notation)\b/i;
/** No `<` inside: each try stops at the next markup, so a file of unclosed doctypes stays linear. */
const INTERNAL_SUBSET = /<!doctype(?:[^<>"'[]|"[^<"]*"|'[^<']*')*\[/i;
const STYLESHEET_PI = /<\?\s*xml-stylesheet/i;

/** Read on the decoded, whitespace-free, lower-cased text. */
const BAD_SCHEME = /(?:javascript|vbscript|livescript):|data:(?:text\/html|application\/xhtml)/;
const XHTML_NS = /www\.w3\.org\/1999\/xhtml/;
const EXTERNAL_CSS = /@import|(?:url|image-set|src)\(["']?(?!data:)(?:[a-z][a-z0-9+.-]*:|\/\/)/;

const NAME = "[^\\s<>/=\"']+";
const START_TAG = new RegExp(`<(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"]*"|'[^']*'))*)\\s*/?>`, "y");
const ATTRIBUTE = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g");
const END_TAG = new RegExp(`</${NAME}\\s*>`, "y");
const DOCTYPE = /<!doctype(?:[^<>"'[]|"[^<"]*"|'[^<']*')*>/iy;

const LOCAL_FORBIDDEN = new Set([
  "script", "foreignobject", "iframe", "frame", "frameset", "embed", "object", "applet", "portal", "handler", "listener", "meta", "base", "link",
]);
/** Where an href may point: inside this document, or a raster picture carried in it. */
const SAFE_HREF = /^(?:#|data:image\/(?:png|jpe?g|webp|gif)[;,])/i;

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", tab: "\t", newline: "\n", colon: ":", sol: "/", lpar: "(", rpar: ")" };

function fromCode(code: number): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
}

/** Character references and CSS escapes, as a browser would read them inside a value. */
function decode(text: string): string {
  return text
    .replace(/&#x0*([0-9a-f]{1,6});?/gi, (_, hex: string) => fromCode(parseInt(hex, 16)))
    .replace(/&#0*([0-9]{1,7});?/g, (_, dec: string) => fromCode(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole: string, name: string) => NAMED[name.toLowerCase()] ?? whole)
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) => fromCode(parseInt(hex, 16)))
    .replace(/\\([^0-9a-f\r\n])/gi, "$1");
}

/** Everything a URL parser or a sloppy reader would skip — gone, so `java&#x09;script:` reads whole. */
function flatten(text: string): string {
  return text.replace(/[\s\u0000-\u001f\u007f-\u00a0\u00ad\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, "").toLowerCase();
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1).toLowerCase();
}

/** One start tag: its element and every attribute. */
function tagLooksSafe(name: string, attributes: string): boolean {
  if (LOCAL_FORBIDDEN.has(localName(name))) return false;
  for (const match of attributes.matchAll(ATTRIBUTE)) {
    const attribute = localName(match[1]);
    const value = decode(match[2] ?? match[3] ?? "");
    if (attribute.startsWith("on")) return false;
    if (attribute === "href") {
      // a URL parser drops tabs and newlines anywhere, and control characters and spaces at the ends
      const url = value.replace(/[\t\n\r]/g, "").replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
      if (url !== "" && !SAFE_HREF.test(url)) return false;
    }
    if (attribute === "attributename") {
      const target = localName(value.trim());
      if (target === "href" || target.startsWith("on")) return false;
    }
  }
  return true;
}

/** The markup, construct by construct; false as soon as something is refused or unreadable. */
function markupLooksSafe(text: string): boolean {
  let at = text.indexOf("<");
  while (at !== -1) {
    let next: number;
    if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at + 4);
      if (end === -1) return false;
      next = end + 3;
    } else if (text.startsWith("<![CDATA[", at)) {
      const end = text.indexOf("]]>", at + 9);
      if (end === -1) return false;
      next = end + 3;
    } else if (text.startsWith("<?", at)) {
      const end = text.indexOf("?>", at + 2);
      if (end === -1) return false;
      next = end + 2;
    } else if (text.startsWith("<!", at)) {
      DOCTYPE.lastIndex = at;
      if (!DOCTYPE.test(text)) return false;
      next = DOCTYPE.lastIndex;
    } else if (text.startsWith("</", at)) {
      END_TAG.lastIndex = at;
      if (!END_TAG.test(text)) return false;
      next = END_TAG.lastIndex;
    } else {
      START_TAG.lastIndex = at;
      const tag = START_TAG.exec(text);
      if (!tag || !tagLooksSafe(tag[1], tag[2])) return false;
      next = START_TAG.lastIndex;
    }
    at = text.indexOf("<", next);
  }
  return true;
}

/** True when the SVG text carries nothing that could run, navigate or load from elsewhere. */
export function svgLooksSafe(text: string): boolean {
  if (CONTROL.test(text)) return false;
  const declared = DECLARED_ENCODING.exec(text)?.[1];
  if (declared !== undefined && !SAFE_ENCODING.test(declared.trim())) return false;

  if (FORBIDDEN_ELEMENT.test(text) || DTD_DECLARATION.test(text) || INTERNAL_SUBSET.test(text) || STYLESHEET_PI.test(text)) {
    return false;
  }
  // twice: a reference that spells a reference still reads as the second one somewhere
  const flat = flatten(decode(decode(text)));
  if (BAD_SCHEME.test(flat) || XHTML_NS.test(flat) || EXTERNAL_CSS.test(flat)) return false;

  return markupLooksSafe(text);
}
