'use strict';
/** Shared settings contract: strict validation before values reach a CSS property or a native window. */
const DEFAULT_LYRICS = Object.freeze({
  background:'none', originalColor:'#FFFFFF',translationColor:'#FFFFFF', outlineColor:'#FFFFFF',
  outlineWidth:0,shadow:2,glow:16,fontSize:30,translationSize:18,lineHeight:1.28,
  width:800,align:'center',showOriginal:true,showTranslation:true,alwaysOnTop:true,
  opacity:100,autoHideEmpty:false,mouseThrough:false
});
const clamp=(n,min,max,fallback)=>Number.isFinite(Number(n))?Math.min(max,Math.max(min,Number(n))):fallback;
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9A-Fa-f]{6}$/.test(value)?value:fallback;
function normalizeLyrics(input){
  const x=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  // Upgrade the historical pink/blue defaults without clobbering a custom palette.
  const oldDefaultPalette=x.originalColor==='#F6A8C8'&&x.translationColor==='#AFCFFF';
  return {
    background:['none','glass','solid'].includes(x.background)?x.background:DEFAULT_LYRICS.background,
    originalColor:oldDefaultPalette?DEFAULT_LYRICS.originalColor:color(x.originalColor,DEFAULT_LYRICS.originalColor),
    translationColor:oldDefaultPalette?DEFAULT_LYRICS.translationColor:color(x.translationColor,DEFAULT_LYRICS.translationColor),
    outlineColor:color(x.outlineColor,DEFAULT_LYRICS.outlineColor),
    outlineWidth:oldDefaultPalette?DEFAULT_LYRICS.outlineWidth:clamp(x.outlineWidth,0,5,DEFAULT_LYRICS.outlineWidth),
    glow:clamp(x.glow,0,30,DEFAULT_LYRICS.glow),
    shadow:clamp(x.shadow,0,6,DEFAULT_LYRICS.shadow),
    fontSize:clamp(x.fontSize,15,64,DEFAULT_LYRICS.fontSize),
    translationSize:clamp(x.translationSize,11,42,DEFAULT_LYRICS.translationSize),
    lineHeight:clamp(x.lineHeight,1,2,DEFAULT_LYRICS.lineHeight),
    width:clamp(x.width,420,1400,DEFAULT_LYRICS.width),
    align:['left','center','right'].includes(x.align)?x.align:DEFAULT_LYRICS.align,
    showOriginal:x.showOriginal!==false,
    showTranslation:x.showTranslation!==false,
    alwaysOnTop:x.alwaysOnTop!==false,
    opacity:clamp(x.opacity,30,100,DEFAULT_LYRICS.opacity),
    autoHideEmpty:x.autoHideEmpty===true,
    mouseThrough:x.mouseThrough===true
  };
}
module.exports={DEFAULT_LYRICS,normalizeLyrics};
