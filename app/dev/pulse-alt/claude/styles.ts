/**
 * The prototype's own paper: tokens for light and a warm dark, keyframes for the few loops
 * that run on the compositor (the pulse line, drains, shimmer). Scoped to [data-pc].
 */
export const CSS = `
[data-pc]{
  --paper:#FAF9F5; --paper-2:#F4F3EE; --oat:#F0EEE6; --card:#FFFFFF; --bubble:#F0EEE6;
  --ink:#141413; --ink-2:#3D3D3A; --ink-3:#73726C; --ink-4:#B0AEA5;
  --line:#E8E6DC; --line-2:#DAD7CB;
  --clay:#D97757; --clay-deep:#C15F3C; --clay-ink:#B0532F; --clay-soft:#F6E5DC;
  --olive:#788C5D; --olive-ink:#56693D; --olive-soft:#E8ECDF;
  --slate:#6A9BCC; --slate-ink:#3C6A97; --slate-soft:#E4ECF5;
  --btn:#141413; --on-btn:#FAF9F5;
  --scrim:rgba(31,30,29,.26);
  --sh-1:0 1px 2px rgba(20,20,19,.05);
  --sh-2:0 1px 2px rgba(20,20,19,.04),0 12px 32px -14px rgba(20,20,19,.18);
  --sh-3:0 -1px 0 rgba(20,20,19,.02),0 -18px 50px -22px rgba(20,20,19,.22);
  --accent:#D97757;
  color-scheme:light;
  font-feature-settings:normal;
  -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){
  [data-pc]{
    --paper:#262624; --paper-2:#2B2B29; --oat:#3B3A37; --card:#30302E; --bubble:#1F1E1D;
    --ink:#FAF9F5; --ink-2:#DCDAD1; --ink-3:#A3A198; --ink-4:#6E6C65;
    --line:#3A3936; --line-2:#4D4B46;
    --clay:#D97757; --clay-deep:#E3876A; --clay-ink:#EC9A7C; --clay-soft:#45302A;
    --olive:#93A777; --olive-ink:#AFC195; --olive-soft:#30372A;
    --slate:#7FAAD6; --slate-ink:#A6C6E8; --slate-soft:#283442;
    --btn:#FAF9F5; --on-btn:#141413;
    --scrim:rgba(0,0,0,.5);
    --sh-1:0 1px 2px rgba(0,0,0,.25);
    --sh-2:0 1px 2px rgba(0,0,0,.3),0 14px 36px -14px rgba(0,0,0,.6);
    --sh-3:0 -1px 0 rgba(255,255,255,.03),0 -20px 50px -20px rgba(0,0,0,.6);
    color-scheme:dark;
  }
}
[data-pc] *{ -webkit-tap-highlight-color:transparent; }
[data-pc] .pc-serif{ font-family:var(--pc-serif),"Source Serif 4",Georgia,serif; font-optical-sizing:auto; font-variant-numeric:lining-nums; }
[data-pc] .pc-num{ font-variant-numeric:lining-nums tabular-nums; }
[data-pc] .pc-caps{ font-size:11px; line-height:14px; letter-spacing:.08em; text-transform:uppercase; font-weight:500; }
[data-pc] .pc-scroll{ overflow-y:auto; overscroll-behavior:contain; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
[data-pc] .pc-scroll::-webkit-scrollbar{ display:none; }
[data-pc] .pc-xscroll{ overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; }
[data-pc] .pc-xscroll::-webkit-scrollbar{ display:none; }
[data-pc] button{ cursor:pointer; }
[data-pc] button:focus-visible,[data-pc] [role=button]:focus-visible{ outline:2px solid var(--clay); outline-offset:2px; }
[data-pc] input,[data-pc] textarea{ caret-color:var(--clay); }
[data-pc] input::placeholder,[data-pc] textarea::placeholder{ color:var(--ink-3); opacity:1; }
[data-pc] .pc-press{ transition:transform .14s cubic-bezier(.2,.8,.2,1), background-color .2s, opacity .2s; }
[data-pc] .pc-press:active{ transform:scale(.97); }

@keyframes pc-line{ from{ transform:translateX(0) } to{ transform:translateX(-32px) } }
@keyframes pc-drain{ from{ transform:scaleX(1) } to{ transform:scaleX(0) } }
@keyframes pc-fill{ from{ transform:scaleX(0) } to{ transform:scaleX(1) } }
@keyframes pc-shimmer{ 0%{ background-position:120% 0 } 100%{ background-position:-20% 0 } }
@keyframes pc-halo{ 0%{ transform:scale(.95); opacity:.5 } 100%{ transform:scale(1.55); opacity:0 } }
@keyframes pc-dot{ 0%,100%{ opacity:1 } 50%{ opacity:.25 } }
@keyframes pc-caret{ 0%,49%{ opacity:1 } 50%,100%{ opacity:0 } }
@keyframes pc-ring{ from{ stroke-dashoffset:var(--len) } to{ stroke-dashoffset:0 } }
@keyframes pc-breath{ 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.04) } }

[data-pc] .pc-shimmer{
  background:linear-gradient(90deg,var(--ink-3) 0%,var(--ink-3) 40%,var(--ink) 50%,var(--ink-3) 60%,var(--ink-3) 100%);
  background-size:250% 100%; -webkit-background-clip:text; background-clip:text; color:transparent;
  animation:pc-shimmer 1.6s linear infinite;
}
@media (prefers-reduced-motion: reduce){
  [data-pc] .pc-anim, [data-pc] .pc-shimmer{ animation:none !important; }
  [data-pc] .pc-shimmer{ color:var(--ink-2); background:none; }
}
`;
