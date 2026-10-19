"""Offline interaction smoke checks. Requires playwright and a local Chromium executable.
This uses deterministic fixture data, not claims about current online recommendations.
"""
from pathlib import Path
import json
import os
import re
import base64
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('MUSIC_UI_ARTIFACTS', str(ROOT.parent / 'ui-artifacts')))
OUT.mkdir(parents=True, exist_ok=True)
FIXTURE = r"""
window.__calls=[];
const tracks=Array.from({length:1205},(_,i)=>({name:'本地测试 '+String(i).padStart(4,'0')+' [999'+i+'].wav',size:1000,inPlaylist:i<3}));
let meta={categories:[],assignments:{},defaultName:'未分类'};
window.musicBridge=new Proxy({
 getSettings:async()=>({downloadDir:'/music',disclaimerAcceptedVersion:1,quality:'best',apiBases:[],floatingLyrics:{},desktopLyricsEnabled:false,miniPlayerEnabled:false}),
 cacheStats:async()=>({count:0,bytes:0}), checkPython:async()=>({version:'测试环境'}),
 playlistsList:async()=>[{id:'default',tracks:tracks.slice(0,3).map(x=>x.name)}],
 playlistCategoriesList:async()=>meta,
 playlistCategoryCreate:async name=>{meta.categories.push({id:'12345678-1234-1234-1234-123456789abc',name});},
 playlistCategoryRename:async(id,name)=>{meta.categories.find(x=>x.id===id).name=name;},
 playlistRenameDefault:async name=>{meta.defaultName=name;},
 listFiles:async()=>tracks,
 discovery:async options=>{window.__calls.push(['discovery',options]);if(window.__offline)throw Error('测试断网');return {ok:true,day:'2026-10-19',poolSize:64,message:'公开精选 · 界面验收测试数据',songs:Array.from({length:8},(_,i)=>({id:String(10000+options.batch*10+i),name:'测试歌曲 '+(options.batch*10+i),artists:'测试歌手',cover_url:''})),playlists:Array.from({length:6},(_,i)=>({id:String(100+i),name:'测试精选歌单 '+i,trackCount:35,cover_url:''}))};},
 playlist:async id=>{window.__calls.push(['playlist',id]);return {tracks:[{id:'7',name:'歌单测试曲',artists:'歌手',duration_seconds:180}],total:1};},
 download:async ids=>{window.__calls.push(['download',ids]);return {success_count:1,results:[{ok:true,localName:tracks[0].name,path:'/music/'+tracks[0].name}]};},
 playLocal:async name=>{window.__calls.push(['playLocal',name]);return {ok:true,url:'',name,id:null};},
 localLyrics:async()=>({found:false}), songInfo:async()=>null, downloadHistory:async()=>[],
 playerBackground:async()=>({kind:'default'})
},{get(target,key){return target[key]||(String(key).startsWith('on')?()=>()=>{}:async()=>true);}});
"""
print('UI: starting Chromium',flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    print('UI: browser ready',flush=True)
    page=browser.new_page(viewport={'width':1210,'height':790},device_scale_factor=1)
    page.set_default_timeout(6000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    html=(ROOT/'app/index.html').read_text()
    scripts=re.findall(r'<script src="([^"]+)"></script>',html)
    html=re.sub(r'<script src="[^"]+"></script>','',html)
    html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+(ROOT/'app'/m[1]).read_text()+'</style>',html)
    avatar=base64.b64encode((ROOT/'assets/avatar.png').read_bytes()).decode()
    html=html.replace('../assets/avatar.png','data:image/png;base64,'+avatar)
    print('UI: set content',flush=True)
    page.set_content(html,wait_until="domcontentloaded",timeout=6000)
    print('UI: inject fixture',flush=True)
    page.evaluate("() => {" + FIXTURE + "}")
    for script in scripts:
        print('UI: script',script,flush=True)
        page.add_script_tag(content=(ROOT/'app'/script).read_text())
    print('UI: start renderer',flush=True)
    page.evaluate('document.dispatchEvent(new Event("DOMContentLoaded"))')
    print('UI: errors',errors,'toasts',page.locator('.toast').all_text_contents(),flush=True)
    page.locator('.discovery-song').first.wait_for(timeout=6000)
    assert page.locator('.discovery-song').count()==8
    assert page.evaluate('window.__calls.filter(x=>x[0]==="download"||x[0]==="playLocal").length')==0
    print('UI: homepage loaded',flush=True)
    page.screenshot(path=str(OUT/'homepage-fixture.png'),timeout=5000)
    old=page.locator('.discovery-song').first.get_attribute('data-song-id')
    page.locator('#discovery-next').click()
    page.wait_for_function('(old)=>document.querySelector(".discovery-song").dataset.songId!==old',arg=old)
    page.locator('.discovery-playlist').first.click()
    page.locator('#search-panel').wait_for(state='visible')
    assert page.locator('.song-card').count()==1
    page.locator('#home-discover-tab').click()
    page.locator('.discovery-play').first.click()
    page.wait_for_function('window.__calls.some(x=>x[0]==="download")')
    page.evaluate('window.__offline=true')
    page.locator('#discovery-refresh').click()
    page.wait_for_function('document.querySelector("#discovery-state").textContent.includes("测试断网")')
    assert page.locator('#discovery-refresh').is_enabled()
    page.evaluate('window.__offline=false')
    page.locator('#discovery-refresh').click()
    page.locator('.discovery-song').first.wait_for()
    page.locator('[data-view="local"]').click()
    page.wait_for_function('document.querySelectorAll(".local-item").length===1205')
    page.locator('#local-filter').fill('1204')
    assert page.locator('.local-item:visible').count()==1
    page.locator('[data-view="playlists"]').click()
    page.locator('#playlist-create-category').click()
    page.locator('#playlist-name-input').fill('界面验收歌单')
    page.locator('#playlist-name-save').click()
    page.wait_for_function('document.querySelector("#my-playlist-tracks").textContent.includes("界面验收歌单")')
    page.locator('.category-collapse').first.click()
    assert page.locator('.playlist-category.collapsed').count()==1
    for width,height in [(930,620),(1210,790),(1600,900)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for selector in ['#toggle-desktop-lyrics','#toggle-desktop-lock','#toggle-mini-player','#toggle-queue']:
            rect=page.locator(selector).bounding_box()
            assert rect and rect['x']>=0 and rect['x']+rect['width']<=width, (width,selector,rect)
    assert not errors,errors
    print(json.dumps({'ok':True,'checks':['no autoplay','daily batch','playlist click','download click','offline retry','1205 files','filter','create playlist','collapse','three viewport sizes'],'consoleErrors':errors},ensure_ascii=False))
    browser.close()
