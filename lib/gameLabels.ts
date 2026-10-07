// Game-style text for Abuja Real Life: chunky outlined type, hard "sticker" shadows, colour-coded by what the thing does.
// Injected AFTER each component's own <style>, so these rules win on equal specificity.
// Font comes from app/layout.tsx (Lilita One -> --font-game); the fallbacks keep it chunky if the font is blocked.
export const GAME_LABEL_CSS = `
:root{--ink:#1a1410;--cream:#fff3d6;--gold:#ffb81c;--green:#2fc66b;--blue:#3b9bff;--red:#ff5147;--purple:#9b6bff;--plum:#261a36;--plum2:#34244a;--gf:var(--font-game),'Lilita One','Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif}

/* ---------- in-world: action spot labels (Jobs / Buy / Quests / Till / Management) ---------- */
.inLbl{--c:var(--gold);all:unset;box-sizing:border-box;position:relative;display:inline-flex;align-items:center;gap:7px;padding:3px 14px 3px 4px;cursor:pointer;pointer-events:auto;
  background:var(--c);border:3px solid var(--ink);border-radius:999px;box-shadow:0 4px 0 var(--ink),0 9px 14px #0006;
  font-family:var(--gf);font-size:16px;line-height:1;letter-spacing:.03em;color:#fff;white-space:nowrap;
  animation:glBob 2.4s ease-in-out infinite;transition:transform .12s}
.inLbl::after{content:'';position:absolute;left:50%;bottom:-11px;width:12px;height:12px;background:var(--c);border:3px solid var(--ink);border-top:0;border-left:0;transform:translateX(-50%) rotate(45deg);z-index:-1}
.inLbl:hover{transform:scale(1.1);animation:none}.inLbl:active{transform:translateY(3px) scale(1.05);box-shadow:0 1px 0 var(--ink)}
.inLbl .glIco{flex:none;width:28px;height:28px;border-radius:50%;background:var(--cream);border:3px solid var(--ink);display:grid;place-items:center;font-size:14px;line-height:1}
.inLbl .glTx{-webkit-text-stroke:5px var(--ink);paint-order:stroke fill;text-shadow:0 2px 0 var(--ink)}
.inLbl.gl-work{--c:var(--blue)}.inLbl.gl-shop{--c:var(--green)}.inLbl.gl-quest{--c:var(--gold)}.inLbl.gl-crime{--c:var(--red)}.inLbl.gl-mgmt{--c:var(--purple)}.inLbl.gl-board{--c:#6f87a8}
.inLbl.on{animation:glPulse .9s ease-in-out infinite;filter:brightness(1.12)}

/* ---------- in-world: people (name plates, staff roles) ---------- */
.glName,.cityNameTag{all:unset;box-sizing:border-box;display:inline-block;padding:3px 11px 2px;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:10px;
  box-shadow:0 3px 0 var(--ink),0 7px 10px #0005;font-family:var(--gf);font-size:14px;line-height:1.1;letter-spacing:.03em;white-space:nowrap}
.glName.cop{background:var(--blue);color:#fff;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}
.cityNameTag.cwTapTag{pointer-events:auto;cursor:pointer}.cityNameTag.cwTapTag:hover{transform:scale(1.08)}
.glPlate{all:unset;box-sizing:border-box;position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:0;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 6px 6px #0006)}
.glPlate b{font:inherit;display:block;padding:4px 14px 2px;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:11px 11px 4px 4px;font-family:var(--gf);font-size:15px;line-height:1.1;letter-spacing:.03em;white-space:nowrap}
.glPlate em{font-style:normal;display:block;margin-top:-3px;padding:2px 12px 2px;background:var(--blue);color:#fff;border:3px solid var(--ink);border-radius:4px 4px 11px 11px;font-family:var(--gf);font-size:12px;line-height:1.15;letter-spacing:.04em;white-space:nowrap;-webkit-text-stroke:3.5px var(--ink);paint-order:stroke fill}
.glPlate.vacant em{background:var(--red);animation:glPulse 1s ease-in-out infinite}
.glPlate.boss em{background:var(--purple)}
.glPlate i{position:absolute;right:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:var(--gold);border:3px solid var(--ink);display:grid;place-items:center;font-style:normal;font-size:12px;line-height:1;font-family:var(--gf);color:var(--ink);animation:glBob 1.6s ease-in-out infinite}
.glPlate:hover b,.glPlate:hover em{filter:brightness(1.08)}.glPlate:active{transform:translateY(2px)}

/* ---------- speech bubbles ---------- */
.inSay,.cwSay{position:relative;background:#fff;color:var(--ink);border:3px solid var(--ink);border-radius:16px;padding:6px 12px;font-family:var(--gf);font-size:14px;line-height:1.25;letter-spacing:.01em;
  max-width:200px;text-align:center;white-space:normal;box-shadow:0 3px 0 var(--ink),0 7px 10px #0005;margin-bottom:6px;animation:glPop .22s cubic-bezier(.3,1.6,.5,1)}
.inSay::after,.cwSay::after{content:'';position:absolute;left:50%;bottom:-10px;width:11px;height:11px;background:#fff;border:3px solid var(--ink);border-top:0;border-left:0;transform:translateX(-50%) rotate(45deg)}

/* ---------- city: car tag ---------- */
.cityBizTag{background:var(--cream)!important;color:var(--ink)!important;border:3px solid var(--ink)!important;border-radius:12px!important;padding:4px 12px 3px!important;box-shadow:0 3px 0 var(--ink),0 7px 10px #0005;font-family:var(--gf);font-size:14px!important;line-height:1.15;letter-spacing:.03em}
.cityBizTag small{display:inline-block;margin-top:2px;padding:1px 9px;background:var(--gold);color:#fff!important;border:2px solid var(--ink);border-radius:999px;font-size:11px;-webkit-text-stroke:3px var(--ink);paint-order:stroke fill}

/* ---------- HUD (screen-space) ---------- */
.inTop{background:var(--plum)!important;border:3px solid var(--ink)!important;border-radius:16px!important;box-shadow:0 4px 0 var(--ink),0 10px 16px #0005;padding:7px 8px 7px 14px!important;color:var(--cream)!important;font-family:var(--gf);font-size:15px!important;letter-spacing:.03em}
.inTop b{font-weight:400;font-size:17px;color:#fff}.inTop span{color:#c9b8e8!important;font-size:13px}
.inTop button{background:var(--gold)!important;color:var(--ink)!important;border:3px solid var(--ink)!important;border-radius:11px!important;padding:5px 12px!important;font-family:var(--gf);font-size:15px;font-weight:400!important;letter-spacing:.04em;box-shadow:0 3px 0 var(--ink);cursor:pointer}
.inTop button:active{transform:translateY(3px);box-shadow:0 0 0 var(--ink)}
.inTop .inGear{background:var(--plum2)!important;color:#fff!important;padding:4px 9px!important}
.inDock{gap:9px!important}
.inDock i{font-family:var(--gf);font-size:13px!important;letter-spacing:.04em;color:var(--cream)!important;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}
.inDock button{--c:var(--plum2);display:inline-flex;align-items:center;gap:8px;background:var(--c)!important;color:#fff!important;border:3px solid var(--ink)!important;border-radius:999px!important;padding:4px 16px 4px 5px!important;
  font-family:var(--gf);font-size:16px!important;font-weight:400!important;letter-spacing:.03em;box-shadow:0 4px 0 var(--ink),0 9px 12px #0004;cursor:pointer;-webkit-text-stroke:0;transition:transform .1s}
.inDock button .glIco{flex:none;width:28px;height:28px;border-radius:50%;background:var(--cream);border:3px solid var(--ink);display:grid;place-items:center;font-size:14px;line-height:1}
.inDock button .glTx{-webkit-text-stroke:5px var(--ink);paint-order:stroke fill}
.inDock button:hover{transform:translateX(-3px)}.inDock button:active{transform:translateY(3px);box-shadow:0 1px 0 var(--ink)}
.inDock button.gd-work{--c:var(--blue)}.inDock button.gd-shop{--c:var(--green)}.inDock button.gd-quest{--c:var(--gold)}.inDock button.gd-crime{--c:var(--red)}.inDock button.gd-mgmt{--c:var(--purple)}.inDock button.gd-board{--c:#6f87a8}
.inDock button.on{background:var(--c)!important;color:#fff!important;border-color:var(--ink)!important;outline:3px solid #fff;outline-offset:2px;animation:glPulse .9s ease-in-out infinite}
.inAct{background:var(--gold)!important;color:#fff!important;border:3px solid var(--ink)!important;border-radius:16px!important;padding:9px 22px!important;font-family:var(--gf);font-weight:400!important;font-size:19px!important;letter-spacing:.04em;
  box-shadow:0 5px 0 var(--ink),0 12px 18px #0006;-webkit-text-stroke:5px var(--ink);paint-order:stroke fill;animation:glPulseX 1.1s ease-in-out infinite;cursor:pointer}
.inAct small{font-size:12px;opacity:.95}.inAct.cop{background:var(--blue)!important}
.inToast{background:var(--plum)!important;color:var(--cream)!important;border:3px solid var(--ink);border-radius:14px!important;box-shadow:0 4px 0 var(--ink),0 10px 16px #0006;font-family:var(--gf);font-size:16px!important;letter-spacing:.03em;padding:9px 18px!important}
.inChat div{background:var(--plum)!important;color:var(--cream);border:2px solid var(--ink);border-radius:10px!important;padding:4px 9px!important;font-family:var(--gf);font-size:13px!important;letter-spacing:.02em}
.inChat input{background:var(--cream)!important;color:var(--ink)!important;border:3px solid var(--ink)!important;border-radius:12px!important;padding:8px 12px!important;font-family:var(--gf);font-size:14px!important;box-shadow:0 3px 0 var(--ink)}
.inChat input::placeholder{color:#8a7a60}
.inCam button{background:var(--plum)!important;border:3px solid var(--ink)!important;box-shadow:0 3px 0 var(--ink);color:#fff!important;font-family:var(--gf);cursor:pointer}.inCam button:active{transform:translateY(3px);box-shadow:none}

@keyframes glBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes glPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes glPulseX{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.06)}}
@keyframes glPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@media (max-width:700px){.inLbl{font-size:14px}.inLbl .glIco{width:24px;height:24px;font-size:12px}.glPlate b{font-size:13px}.glPlate em{font-size:11px}.inDock button{font-size:14px!important}.inAct{font-size:16px!important}}
html[data-reduce-motion="1"] .inLbl,html[data-reduce-motion="1"] .glPlate i,html[data-reduce-motion="1"] .glPlate.vacant em,html[data-reduce-motion="1"] .inDock button.on,html[data-reduce-motion="1"] .inAct,html[data-reduce-motion="1"] .inSay,html[data-reduce-motion="1"] .cwSay,html[data-reduce-motion="1"] .stoBox,html[data-reduce-motion="1"] .stBox{animation:none!important}
html[data-hints="0"] .cwHint,html[data-hints="0"] .cwTip,html[data-hints="0"] .hint,html[data-hints="0"] .inDock i{display:none!important}
.inLbl,.glPlate,.glName,.cityNameTag,.inSay,.cwSay,.cityBizTag{zoom:var(--gl-scale,1)}
@media (prefers-reduced-motion:reduce){.inLbl,.glPlate i,.glPlate.vacant em,.inDock button.on,.inAct,.inSay,.cwSay{animation:none!important}}
`;

// Inside buildings (components/Interior.tsx): layering, compact in-world badges, and the "what can I do here" side sheet.
// Injected AFTER GAME_LABEL_CSS so it wins on equal specificity.
export const INTERIOR_UI_CSS = `
/* ---------- layering: screen UI always sits above the floating 3D labels ---------- */
.inTop,.inDock,.inCam,.inAct,.inChat,.inStick{z-index:12}
.inToast{z-index:13}
.inTag{transition:opacity .18s}.inTag.near{opacity:0;pointer-events:none}
/* a menu is open: the world labels get out of the way completely */
.inWrap.menuOpen .inTag,.inWrap.menuOpen .inLbl{opacity:0!important;pointer-events:none!important}
.inWrap.menuOpen .inDock{display:none}

/* ---------- top-left banner: smaller, never wider than it needs to be ---------- */
.inTop{max-width:min(440px,50vw);gap:8px!important;padding:6px 8px 6px 12px!important}
.inTop b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.inTop span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.inTop button{flex:none;white-space:nowrap}
@media (max-height:480px){.inTop{top:calc(44px + env(safe-area-inset-top,0px))!important}.inCam{top:calc(104px + env(safe-area-inset-top,0px))!important}.inDock{top:calc(44px + env(safe-area-inset-top,0px))!important}.inMenu{top:calc(44px + env(safe-area-inset-top,0px))!important}}

/* ---------- in-world action spots: small icon badges (names live in the right-hand list and on hover) ---------- */
.inLbl{padding:3px!important;gap:0!important;transition:opacity .18s,transform .12s}
.inLbl .glIco{width:34px;height:34px;font-size:18px}
.inLbl .glTx{display:none}
.inLbl:hover{padding:3px 14px 3px 3px!important;gap:7px!important}.inLbl:hover .glTx{display:inline}
.inLbl.on,.inLbl.far{opacity:0;pointer-events:none;animation:none}   /* you are standing on it: the button at the bottom takes over */

/* ---------- name plates: a little smaller, so they cover less of the room ---------- */
.glPlate b{font-size:13px}.glPlate em{font-size:11px}


/* ---------- mobile: world action badges are replaced by the screen-space Actions tray ---------- */
@media (pointer:coarse),(max-width:900px){
  .inLbl{display:none!important}
}

/* ---------- the "what can I do here" sheet (jobs, buy, quests, management...) ---------- */
.inMenu{--c:var(--gold);position:absolute;z-index:14;left:auto;right:calc(12px + env(safe-area-inset-right,0px));top:calc(54px + env(safe-area-inset-top,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:none;
  width:min(340px,39vw);max-height:none;padding:0;gap:0;display:flex;flex-direction:column;overflow:hidden;
  background:var(--plum);color:var(--cream);border:4px solid var(--ink);border-radius:22px;box-shadow:0 6px 0 var(--ink),0 18px 34px #000a;
  font-family:var(--gf);animation:inSlide .24s cubic-bezier(.3,1.4,.5,1)}
.inMenu.k-work,.inMenu.k-npc{--c:var(--blue)}.inMenu.k-shop{--c:var(--green)}.inMenu.k-quest{--c:var(--gold)}.inMenu.k-crime{--c:var(--red)}.inMenu.k-mgmt{--c:var(--purple)}.inMenu.k-board{--c:#6f87a8}
.inMenu h3{flex:none;margin:0;padding:10px 54px 8px 16px;background:var(--c);border-bottom:4px solid var(--ink);font-weight:400;font-size:22px;line-height:1.1;letter-spacing:.04em;color:#fff;
  background-image:repeating-linear-gradient(135deg,#ffffff1c 0 10px,#0000 10px 20px)}
.inMenu h3 span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;-webkit-text-stroke:6px var(--ink);paint-order:stroke fill}
.inMenu .x{all:unset;box-sizing:border-box;position:absolute;z-index:2;right:10px;top:8px;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;cursor:pointer;
  background:var(--red);border:3px solid var(--ink);box-shadow:0 3px 0 var(--ink);color:#fff;font-size:15px;line-height:1}
.inMenu .x:active{transform:translateY(3px);box-shadow:none}
.inBody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px 12px 14px;display:flex;flex-direction:column;gap:11px;scrollbar-width:thin;scrollbar-color:var(--gold) transparent}
.inBody>div{display:flex;flex-direction:column;gap:11px}

/* speech-bubble style info text */
.inBody p{margin:0;padding:7px 12px;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:14px;box-shadow:0 3px 0 var(--ink);font-size:13px;line-height:1.28;letter-spacing:.01em}
.inBody p b{font-weight:400;color:#7a3fd0}

/* each option is a chunky game card: round icon badge, title, small print, big action button */
.inBody button:not(.x){all:unset;box-sizing:border-box;position:relative;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;padding:9px 9px 9px 10px;
  background:var(--plum2);color:var(--cream);border:3px solid var(--ink);border-radius:16px;box-shadow:0 4px 0 var(--ink);font-family:var(--gf);transition:transform .1s,filter .1s}
.inBody button:not(.x)::before{content:var(--e,'⭐');flex:none;width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:var(--cream);border:3px solid var(--ink);box-shadow:inset 0 -4px 0 #0002;font-size:20px;line-height:1}
.inBody button:not(.x):hover{filter:brightness(1.12);transform:translateY(-1px)}
.inBody button:not(.x):active{transform:translateY(4px);box-shadow:0 0 0 var(--ink)}
.inBody .tx{flex:1;min-width:0;display:block}
.inBody .tx b{display:block;font-weight:400;font-size:16px;line-height:1.15;letter-spacing:.03em;color:#fff}
.inBody .tx small{display:block;margin-top:3px;font-size:12px;line-height:1.25;letter-spacing:.02em;color:#cdbfe6}
.inBody .pill{flex:none;font-style:normal;padding:6px 14px 5px;background:var(--green);color:#fff;border:3px solid var(--ink);border-radius:12px;box-shadow:0 3px 0 var(--ink),inset 0 3px 0 #ffffff55;
  font-family:var(--gf);font-weight:400;font-size:15px;letter-spacing:.04em;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}
.inMenu.k-crime .pill{background:var(--red)}.inMenu.k-mgmt .pill{background:var(--purple)}.inMenu.k-quest .pill{background:var(--gold)}.inMenu.k-shop .pill{background:var(--blue)}

@keyframes inSlide{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
html[data-reduce-motion="1"] .inMenu{animation:none}

/* portrait / very narrow screens: bottom sheet instead of a side sheet */
@media (max-width:620px) and (orientation:portrait){.inMenu{left:10px;right:10px;top:auto;bottom:calc(10px + env(safe-area-inset-bottom,0px));width:auto;max-height:46vh}}
/* the action button sits beside the list, never over the player */
.inAct{animation:none!important;transform:none!important;left:auto!important;max-width:44vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:3px solid var(--ink)!important;box-shadow:0 4px 0 var(--ink)!important;font-family:var(--gf);font-weight:400!important;font-size:17px!important;letter-spacing:.03em}
@media (pointer:coarse){.inAct small{display:none}}
/* tighter right-hand list so five spots fit without reaching the bottom buttons */
.inDock{gap:6px!important}.inDock button{padding:4px 12px 4px 4px!important;font-size:15px!important}.inDock .glIco{width:26px;height:26px;font-size:14px}.inDock i{font-size:12px}
`;
