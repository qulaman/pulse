import { describe, expect, it } from "vitest";

import { svgLooksSafe } from "./svg";

const svg = (inner: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${attrs}>${inner}</svg>`;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** The shape of a real company logo: comments in Russian, gradients, an animation, a mask, url(#…). */
const LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1860.9 636.75" role="img" aria-label="Logo">
  <defs>
    <!-- Базовое золото с двумя горизонтальными переливами -->
    <linearGradient id="goldBase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#E8C567"/>
      <stop offset="100%" stop-color="#E0B850"/>
    </linearGradient>
    <linearGradient id="shimmer" gradientUnits="userSpaceOnUse"
                    x1="0" y1="0" x2="900" y2="0">
      <stop offset="0"    stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="0.50" stop-color="#FFF4D0" stop-opacity="0.85"/>
      <animateTransform attributeName="gradientTransform"
                        type="translate"
                        values="-1900,0; 1900,0; 1900,0"
                        keyTimes="0; 0.45; 1"
                        dur="5s"
                        repeatCount="indefinite"/>
    </linearGradient>
    <!-- Маска с буквами, чтобы блик показывался только внутри логотипа -->
    <mask id="wagMask">
      <g fill="#fff">
        <path fill-rule="evenodd" d="M0 0h100v100H0z"/>
      </g>
    </mask>
  </defs>
  <g fill="url(#goldBase)">
    <path fill-rule="evenodd" d="M10.5 20.25l30 40-12.75 3z"/>
  </g>
  <rect x="0" y="0" width="1860.9" height="636.75" fill="url(#shimmer)" mask="url(#wagMask)"/>
</svg>
`;

/** What Illustrator and Inkscape write: a public DOCTYPE, xlink:href to #ids, metadata, an embedded PNG, CSS. */
const ILLUSTRATOR = `<?xml version="1.0" encoding="iso-8859-1"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 200 100" style="enable-background:new 0 0 200 100;" xml:space="preserve">
<style type="text/css">
	.st0{fill:url(#SVGID_1_);}
	.st1{font-family:'Arial'; font-size:12px;}
</style>
<linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0">
	<stop  offset="0" style="stop-color:#000000"/>
</linearGradient>
<linearGradient id="SVGID_2_" xlink:href="#SVGID_1_" gradientTransform="rotate(90)"/>
<defs><path id="p" d="M0 0L10 10"/></defs>
<use xlink:href="#p" x="5"/>
<image width="10" height="10" href="${PNG}"/>
<a href="#p"><text class="st1">Логотип &amp; знак</text></a>
<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><cc:Work xmlns:cc="http://creativecommons.org/ns#" rdf:about=""><dc:format xmlns:dc="http://purl.org/dc/elements/1.1/">image/svg+xml</dc:format></cc:Work></rdf:RDF></metadata>
<sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:pageopacity="0.0" inkscape:current-layer="Layer_1"/>
<g><![CDATA[ plain text ]]><path class="st0" d="M0,0 L200,100"/></g>
</svg>`;

describe("svgLooksSafe — clean files pass", () => {
  it("takes a company logo with gradients, an animation and a mask", () => {
    expect(svgLooksSafe(LOGO)).toBe(true);
  });

  it("takes what the editors write", () => {
    expect(svgLooksSafe(ILLUSTRATOR)).toBe(true);
    expect(svgLooksSafe(svg(`<circle cx="5" cy="5" r="4" fill="red"/>`))).toBe(true);
    expect(svgLooksSafe(`\ufeff${svg("<g/>")}`)).toBe(true);
    expect(svgLooksSafe(svg(`<image href="data:image/jpeg;base64,/9j/4AAQ"/><image xlink:href="data:image/webp;base64,UklG"/>`))).toBe(true);
    expect(svgLooksSafe(svg(`<a href=""><g/></a>`))).toBe(true);
    expect(svgLooksSafe(svg(`<text>open the door; one = 1</text>`))).toBe(true);
  });
});

describe("svgLooksSafe — anything that runs is refused", () => {
  it("refuses script in every spelling", () => {
    expect(svgLooksSafe(svg(`<script>alert(1)</script>`))).toBe(false);
    expect(svgLooksSafe(svg(`<SCRIPT type="text/ecmascript">alert(1)</SCRIPT>`))).toBe(false);
    expect(svgLooksSafe(svg(`<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>`))).toBe(false);
    expect(svgLooksSafe(svg(`<script href="https://evil.example/x.js"/>`))).toBe(false);
  });

  it("refuses event handlers", () => {
    expect(svgLooksSafe(svg("<g/>", ` onload="alert(1)"`))).toBe(false);
    expect(svgLooksSafe(svg(`<rect width="1" height="1" onclick='alert(1)'/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<rect OnMouseOver = "alert(1)"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<rect\nonfocusin="alert(1)"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<animate onbegin="alert(1)" attributeName="x" dur="1s"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<rect x:onload="alert(1)" xmlns:x="urn:x"/>`))).toBe(false);
  });

  it("refuses javascript:, vbscript: and data:text/html however they are spelled", () => {
    expect(svgLooksSafe(svg(`<a href="javascript:alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a xlink:href=" JaVaScRiPt:alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="java&#x09;script:alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="java&#9;script&#58;alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="&#x6A;avascript&colon;alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="java\nscript:alert(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="vbscript:msgbox(1)"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<animate attributeName="x" values="javascript:alert(1)"/>`))).toBe(false);
  });

  it("refuses embedded documents", () => {
    expect(svgLooksSafe(svg(`<foreignObject width="10" height="10"><div>x</div></foreignObject>`))).toBe(false);
    expect(svgLooksSafe(svg(`<iframe src="https://evil.example"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<embed src="x.swf"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<object data="x.html"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<h:img xmlns:h="http://www.w3.org/1999/xhtml" src="x"/>`))).toBe(false);
    expect(svgLooksSafe(`<html xmlns="http://www.w3.org/1999/x&#104;tml"><body>x</body></html>`)).toBe(false);
  });

  it("refuses DTD tricks and stylesheets", () => {
    expect(svgLooksSafe(`<!DOCTYPE svg [<!ENTITY x "&lt;script&gt;alert(1)&lt;/script&gt;">]>${svg("<text>&x;</text>")}`)).toBe(false);
    expect(svgLooksSafe(`<!DOCTYPE svg [<!ATTLIST svg onload CDATA "alert(1)">]>${svg("<g/>")}`)).toBe(false);
    expect(svgLooksSafe(`<!DOCTYPE svg PUBLIC "a>b" "c" []>${svg("<g/>")}`)).toBe(false);
    expect(svgLooksSafe(`<?xml-stylesheet type="text/xsl" href="https://evil.example/x.xsl"?>${svg("<g/>")}`)).toBe(false);
  });

  it("refuses hrefs that leave the document", () => {
    expect(svgLooksSafe(svg(`<use href="https://evil.example/x.svg#a"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<use xlink:href="//evil.example/x.svg#a"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<use href="other.svg#a"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<image href="https://evil.example/pixel.png"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<image href="data:image/svg+xml;base64,PHN2Zz4="/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="https://evil.example"><text>x</text></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<filter id="f"><feImage href="https://evil.example/x.png"/></filter>`))).toBe(false);
    expect(svgLooksSafe(svg(`<use href="&#x68;ttps://evil.example/x.svg#a"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="#x"><set attributeName="href" to="https://evil.example"/></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<a href="#x"><animate attributeName="xlink:href" values="#a;#b"/></a>`))).toBe(false);
    expect(svgLooksSafe(svg(`<set attributeName="onmouseover" to="alert(1)"/>`))).toBe(false);
  });

  it("refuses external CSS", () => {
    expect(svgLooksSafe(svg(`<style>@import url(https://evil.example/x.css);</style>`))).toBe(false);
    expect(svgLooksSafe(svg(`<style>@IMPORT "x.css";</style>`))).toBe(false);
    expect(svgLooksSafe(svg(`<style>rect{fill:url(http://evil.example/x.svg#g)}</style>`))).toBe(false);
    expect(svgLooksSafe(svg(`<style><![CDATA[rect{background:url( 'https://evil.example/p.png' )}]]></style>`))).toBe(false);
    expect(svgLooksSafe(svg(`<rect fill="url(//evil.example/x.svg#g)"/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<style>rect{fill:u\\72l(https://evil.example/x)}</style>`))).toBe(false);
  });

  it("refuses an encoding a browser could read differently", () => {
    expect(svgLooksSafe(`<?xml version="1.0" encoding="UTF-16"?>${svg("<g/>")}`)).toBe(false);
    expect(svgLooksSafe(`<?xml version="1.0" encoding="ISO-2022-JP"?>${svg("<g/>")}`)).toBe(false);
    // UTF-16 read as UTF-8: every other character is NUL
    expect(svgLooksSafe(svg("<g/>").split("").join("\u0000"))).toBe(false);
    // an ISO-2022 shift hides «<script» from a plain reader
    expect(svgLooksSafe(svg(`<scr\u001b(Bipt>alert(1)</script>`))).toBe(false);
  });

  it("refuses what it cannot read", () => {
    expect(svgLooksSafe(svg(`<rect width=1 onload=alert(1)/>`))).toBe(false);
    expect(svgLooksSafe(svg(`<!-- never closed <g/>`))).toBe(false);
    expect(svgLooksSafe(svg(`< script>alert(1)</script>`))).toBe(false);
    expect(svgLooksSafe(svg(`<rect width="1"`))).toBe(false);
  });
});
