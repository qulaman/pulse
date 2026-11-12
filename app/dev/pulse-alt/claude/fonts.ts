import { Inter, Source_Serif_4 } from "next/font/google";

// The assistant's voice and every heading: a literary serif with optical sizes and Cyrillic.
export const serif = Source_Serif_4({
  subsets: ["latin", "cyrillic"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--pc-serif",
  display: "swap",
});

// The interface: a calm humanist grotesque.
export const sans = Inter({ subsets: ["latin", "cyrillic"], variable: "--pc-sans", display: "swap" });
