import { Martian_Mono, Onest } from "next/font/google";

// Onest carries every word; Martian Mono, set narrow, carries time, counts and receipts — the
// numbers a director reads on an outstretched arm.
export const sans = Onest({ subsets: ["cyrillic", "latin"], variable: "--own-sans", display: "swap" });
export const mono = Martian_Mono({ subsets: ["cyrillic", "latin"], variable: "--own-mono", axes: ["wdth"], display: "swap" });
