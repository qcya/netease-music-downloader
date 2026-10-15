'use strict';
// Screen coordinates belong to the desktop layout, not to the lyric appearance.
function normalizePosition(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(!Number.isInteger(value.x)||!Number.isInteger(value.y))return null;
  if(Math.abs(value.x)>100000||Math.abs(value.y)>100000)return null;
  return {x:value.x,y:value.y};
}
function workAreas(screen){
  if(typeof screen?.getAllDisplays!=='function')return [];
  return screen.getAllDisplays()
    .map(d=>d?.workArea)
    .filter(b=>b&&Number.isFinite(b.x)&&Number.isFinite(b.y)
      &&Number.isFinite(b.width)&&Number.isFinite(b.height)&&b.width>0&&b.height>0);
}
function fitInArea(point,area,width,height){
  return {
    x:Math.round(Math.max(area.x,Math.min(point.x,area.x+Math.max(0,area.width-width)))),
    y:Math.round(Math.max(area.y,Math.min(point.y,area.y+Math.max(0,area.height-height))))
  };
}
function defaultPosition(area,width,height){
  return {x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+Math.min(80,Math.max(0,area.height-height)))};
}
function resolvePosition(stored,screen,width,height){
  const position=normalizePosition(stored);
  const displays=workAreas(screen);
  if(!displays.length)return position;
  const main=screen?.getPrimaryDisplay?.()?.workArea;
  const primary=displays.find(d=>d===main||(main&&d.x===main.x&&d.y===main.y))||displays[0];
  if(!position)return fitInArea(defaultPosition(primary,width,height),primary,width,height);
  // Preserve its selected monitor; when monitor geometry changes, keep at
  // least part of the lyric window on-screen. Completely removed monitors reset.
  const area=displays.find(d=>position.x<d.x+d.width&&position.x+width>d.x&&position.y<d.y+d.height&&position.y+height>d.y);
  if(!area)return fitInArea(defaultPosition(primary,width,height),primary,width,height);
  return fitInArea(position,area,width,height);
}
module.exports={normalizePosition,resolvePosition};
