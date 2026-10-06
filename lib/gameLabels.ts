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
@media (prefers-reduced-motion:reduce){.inLbl,.glPlate i,.glPlate.vacant em,.inDock button.on,.inAct,.inSay,.cwSay{animation:none!important}}
`;
