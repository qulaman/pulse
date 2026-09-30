/**
 * Every looping CSS animation on a screen (the faces, the desk, the dreams, the wall) runs on the
 * compositor — until somebody listens for `animationiteration`. React does, on the root, for its
 * `onAnimationIteration` prop (event delegation registers every event it knows), and while such a
 * listener exists Chrome wakes the main thread at every loop boundary of every infinite animation
 * to deliver an event nobody here reads. Measured on Chrome 154, CPU×4: 20 loops cost 0.05 s of
 * main thread per 8 s without the listener and 0.6 s with it; an idle Пульс went from ~9 s to
 * under 1 s per 10 s together with a static client logo (2026-09-30 animation pass).
 *
 * The root layout runs this inline in <head>, before React registers its listeners: a registration
 * for that one event is dropped. Nothing in the app uses `onAnimationIteration` — a component
 * that ever needs it must read the loop some other way (a timer, `animationend` of a finite run).
 * A plain module — the server layout needs the string itself, not a client reference.
 */
export const QUIET_LOOPS = `(function(){var p=EventTarget.prototype,add=p.addEventListener;p.addEventListener=function(type,listener,options){if(type==="animationiteration"||type==="webkitAnimationIteration")return;return add.call(this,type,listener,options)}})();`;
