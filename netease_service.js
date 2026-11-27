'use strict';
// Desktop bindings to CloudMusicApi.java. HTTP and WEAPI run in the upstream JVM.
const id=v=>{const x=String(v??'');if(!/^\d{1,20}$/.test(x))throw Error('请输入有效的网易云编号');return x;};
const room=v=>{const s=String(v||'');if(!/^[A-Za-z0-9_-]{1,128}$/.test(s))throw Error('房间编号无效');return s;};
const page=a=>({limit:Math.max(1,Math.min(100,Number(a.limit)||30)),offset:Math.max(0,Number(a.offset)||0)});
function playlistName(value){
 const name=typeof value==='string'?value.trim():'';
 if(!name||name.length>80)throw Error('歌单名称须为 1 至 80 个字');
 return name;
}
const ops={
 hot:()=>['/weapi/hotsearchlist/get',{}],
 search:a=>['/weapi/cloudsearch/pc',{s:String(a.keyword||'').slice(0,200),type:Number(a.type)||1,...page(a),total:true}],
 suggest:a=>['/weapi/search/suggest/web',{s:String(a.keyword||'').slice(0,200)}],
 charts:()=>['/weapi/toplist',{}],
 artists:a=>['/weapi/toplist/artist',{type:Math.max(1,Math.min(4,Number(a.area)||1)),limit:100,offset:0,total:true}],
 popular:a=>['/weapi/playlist/list',{cat:a.category||'全部',order:'hot',...page(a),total:true}],
 personalized:a=>['/weapi/personalized/playlist',{limit:page(a).limit,total:true,n:1000}],
 dailyPlaylists:()=>['/weapi/v1/discovery/recommend/resource',{}],
 dailySongs:()=>['/weapi/v3/discovery/recommend/songs',{}],
 userPlaylists:a=>['/weapi/user/playlist',{uid:id(a.uid),...page(a),includeVideo:true}],
 profile:()=>['/weapi/w/nuser/account/get',{}],
 playlist:a=>['/weapi/v6/playlist/detail',{id:id(a.id),n:100000,s:8}],
 songDetail:a=>['/weapi/v3/song/detail',{c:JSON.stringify((a.ids||[a.id]).slice(0,100).map(v=>({id:id(v)})))}],
 album:a=>['/weapi/v1/album/'+id(a.id),{}],
 recent:a=>['/weapi/play-record/song/list',{limit:page(a).limit}],
 cloud:a=>['/weapi/v1/cloud/get',page(a)],
 fm:()=>['/weapi/v1/radio/get',{}],
 likes:a=>['/weapi/song/like/get',{uid:id(a.uid)}],
 like:a=>['/weapi/radio/like',{trackId:id(a.id),like:a.like!==false,alg:'itembased',time:25}],
 subscribe:a=>['/weapi/playlist/'+(a.subscribe===false?'unsubscribe':'subscribe'),{id:id(a.id)}],
 // Same authenticated WEAPI contract as the installed API's playlist_delete.
 createPlaylist:a=>['/weapi/playlist/create',{name:playlistName(a.name),privacy:0,type:'NORMAL'}],
 deletePlaylist:a=>['/weapi/playlist/remove',{ids:'['+id(a.id)+']'}],
 playlistTracks:a=>['/weapi/playlist/manipulate/tracks',{op:a.remove?'del':'add',pid:id(a.id),trackIds:JSON.stringify((a.ids||[]).slice(0,100).map(id)),imme:true}],
 podcastCategories:()=>['/weapi/djradio/category/get',{}],
 podcasts:a=>['/weapi/djradio/hot/v1',page(a)],
 podcastRecommend:()=>['/weapi/djradio/recommend/v1',{}],
 podcastByCategory:a=>['/weapi/djradio/recommend',{cateId:id(a.id)}],
 podcast:a=>['/weapi/djradio/v2/get',{id:id(a.id)}],
 programs:a=>['/weapi/dj/program/byradio',{radioId:id(a.id),...page(a),asc:false}],
 program:a=>['/weapi/dj/program/detail',{id:id(a.id)}],
 subscribedPodcasts:a=>['/weapi/djradio/get/subed',{...page(a),total:true}],
 podcastSubscribe:a=>['/weapi/djradio/'+(a.subscribe===false?'unsub':'sub'),{id:id(a.id)}],
 broadcasts:()=>['/weapi/voice/broadcast/category/region/get',{}],
 broadcastChannels:a=>['/weapi/voice/broadcast/channel/list',{categoryId:a.category||'0',regionId:a.region||'0',limit:page(a).limit,lastId:a.lastId||'0',score:'-1'}],
 broadcast:a=>['/weapi/voice/broadcast/channel/currentinfo',{channelId:id(a.id)}],
 broadcastFavorites:()=>['/weapi/content/channel/collect/list',{contentType:'BROADCAST',limit:'99999',timeReverseOrder:true,startDate:'4762584922000'}],
 broadcastCollect:a=>['/weapi/content/interact/collect',{contentType:'BROADCAST',contentId:id(a.id),cancelCollect:a.collect===false}],
};
const auth=new Set(['dailyPlaylists','dailySongs','profile','userPlaylists','recent','cloud','fm','likes','like','subscribe','createPlaylist','deletePlaylist','playlistTracks','subscribedPodcasts','podcastSubscribe','broadcastFavorites','broadcastCollect']);
const writes=new Set(['like','subscribe','createPlaylist','deletePlaylist','playlistTracks','podcastSubscribe','broadcastCollect']);
// Invoke the unmodified original CloudMusicApi methods whenever their public
// signature covers the desktop operation. Search/detail batch pagination keeps
// the original MuNeteaseApi transport so offset and ID lists remain explicit.
const original={
 hot:()=>['searchHotDetail',[]],charts:()=>['topLists',[]],artists:a=>['topArtists',[Number(a.area)||1]],
 popular:a=>['topPlaylists',[page(a).limit,page(a).offset]],personalized:a=>['personalizedPlaylists',[page(a).limit]],
 dailyPlaylists:()=>['recommendResource',[]],dailySongs:()=>['recommendSongs',[]],
 userPlaylists:a=>['userPlaylist',[Number(a.uid),page(a).limit,page(a).offset]],profile:()=>['loginStatus',[]],
 album:a=>['album',[Number(a.id)]],recent:a=>['recentSongs',[page(a).limit]],cloud:a=>['userCloudSongs',[page(a).limit,page(a).offset]],
 fm:()=>['personalFm',[]],likes:a=>['likeList',[Number(a.uid)]],like:a=>['like',[Number(a.id),a.like!==false]],
 subscribe:a=>['subscribe',[Number(a.id),a.subscribe!==false]],
 playlistTracks:a=>['playlistTracks',[a.remove?'del':'add',Number(a.id),(a.ids||[]).map(id).join(',')]],
 podcastCategories:()=>['djCategoryList',[]],podcasts:a=>['djHot',[page(a).limit,page(a).offset]],
 podcastRecommend:()=>['djRecommend',[]],podcastByCategory:a=>['djRecommendByCategory',[String(a.id)]],podcast:a=>['djDetail',[Number(a.id)]],
 programs:a=>['djProgramByRadio',[Number(a.id),page(a).limit,page(a).offset,false]],program:a=>['djProgramDetail',[Number(a.id)]],
 subscribedPodcasts:a=>['djSublist',[page(a).limit,page(a).offset]],podcastSubscribe:a=>['djSub',[Number(a.id),a.subscribe!==false]],
 broadcasts:()=>['broadcastCategoryRegion',[]],broadcastChannels:a=>['broadcastChannelList',[Number(a.category)||0,Number(a.region)||0,page(a).limit,Number(a.lastId)||0]],
 broadcast:a=>['broadcastChannelCurrentInfo',[Number(a.id)]],broadcastFavorites:()=>['broadcastChannelCollectList',[]],broadcastCollect:a=>['broadcastCollect',[Number(a.id),a.collect!==false]],
};
const extra={
 userDetail:a=>['userDetail',[Number(id(a.id))]],
 albumRights:a=>['albumPrivilege',[Number(id(a.id))]],
 purchasedAlbums:a=>['digitalAlbumPurchased',[page(a).limit,page(a).offset]],
 events:a=>['eventList',[page(a).limit,Number(a.lastTime)||-1]],
 fmMode:a=>['personalFmMode',[String(a.mode||'DEFAULT'),String(a.submode||''),3]],
 fmTrash:a=>['personalFmTrash',[Number(id(a.id))]],
 podcastPersonal:a=>['djPersonalizeRecommend',[page(a).limit]],
 podcastChart:a=>['djToplist',[Number(a.type)||0,page(a).limit,page(a).offset]],
 podcastPaid:a=>['djPaygift',[page(a).limit,page(a).offset]],
 podcastRecent:a=>['recordRecentDjRadio',[page(a).limit]],
 radioStyles:()=>['djDifmStyleChannels',['[0]']],
 radioFavorites:()=>['djDifmSubscribedChannels',['[0]']],
 radioSubscribe:a=>[a.subscribe===false?'djDifmUnsubscribeChannel':'djDifmSubscribeChannel',[Number(id(a.id))]],
 radioTracks:a=>['djDifmPlayingTracks',[Number(a.source)||0,Number(id(a.id)),30]],
 roomCreate:()=>['listenTogetherRoomCreate',[]],roomStatus:()=>['listenTogetherStatus',[]],
 roomCheck:a=>['listenTogetherRoomCheck',[room(a.room)]],roomJoin:a=>['listenTogetherAccept',[room(a.room),Number(id(a.inviter))]],
 roomEnd:a=>['listenTogetherEnd',[room(a.room)]],roomPlaylist:a=>['listenTogetherPlaylistGet',[room(a.room)]],
 roomHeartbeat:a=>['listenTogetherHeartbeat',[room(a.room),Number(id(a.songId)),a.playing?'PLAY':'PAUSE',Math.max(0,Number(a.progress)||0)]],
 roomCommand:a=>{if(!['PLAY','PAUSE','SEEK','GOTO'].includes(a.command))throw Error('播放指令无效');return ['listenTogetherPlayCommand',[room(a.room),a.command,Math.max(0,Number(a.progress)||0),a.playing?'PLAY':'PAUSE',Number(a.former)||0,Number(id(a.songId)),Math.max(0,Number(a.sequence)||0)]];},
 roomSync:a=>['listenTogetherSyncList',[room(a.room),'REPLACE',Number(id(a.uid)),Math.max(0,Number(a.version)||0),(a.ids||[]).slice(0,1000).map(id).join(',')]],
};
for(const name of ['purchasedAlbums','events','fmMode','fmTrash','podcastPersonal','podcastRecent','radioFavorites','radioSubscribe','roomCreate','roomStatus','roomCheck','roomJoin','roomEnd','roomPlaylist','roomHeartbeat','roomCommand','roomSync'])auth.add(name);
for(const name of ['fmTrash','radioSubscribe','roomCreate','roomJoin','roomEnd','roomHeartbeat','roomCommand','roomSync'])writes.add(name);
function createNeteaseService({client,accountRequest}){
 async function request(operation,args={}){
  if((!Object.hasOwn(ops,operation)&&!Object.hasOwn(extra,operation))||!args||typeof args!=='object'||Array.isArray(args))throw Error('网易云操作无效');
  const [path,params]=ops[operation]?ops[operation](args):[null,{}];
  const binding=extra[operation]?extra[operation](args):typeof client.invoke==='function'&&original[operation]?original[operation](args):null;
  if(!path&&typeof client.invoke!=='function')throw Error('网易云原方法运行环境未就绪');
  const authenticated=auth.has(operation)||operation==='playlist'&&args.authenticated===true;
  const result=authenticated?await accountRequest(path,params,binding):binding?await client.invoke(...binding):await client.call(path,params);
  const body=operation==='profile'&&result.body?.data?result.body.data:result.body;if(!body||Number(body.code)!==200)throw Error([301,401,403].includes(Number(body?.code))?'请先在设置中登录网易云账号':String(body?.message||'网易云接口暂时未返回可用结果').slice(0,180));
  if(operation==='createPlaylist'){
   const playlistId=id(body.id??body.playlist?.id);
   return {code:200,playlist:{id:playlistId,name:params.name,coverImgUrl:body.playlist?.coverImgUrl||''}};
  }
  // Credentials never cross the renderer bridge.
  if(operation==='profile')return {code:200,profile:{userId:body.profile?.userId||body.account?.id,nickname:body.profile?.nickname||'',avatarUrl:body.profile?.avatarUrl||''}};
  return JSON.parse(JSON.stringify(body,(key,value)=>/cookie|token|password|secret|salt/i.test(key)?undefined:value));
 }
 return {request,isWrite:op=>writes.has(op),operations:[...Object.keys(ops),...Object.keys(extra)]};
}
module.exports={createNeteaseService};
