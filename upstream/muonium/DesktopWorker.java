import com.google.gson.*;
import com.muoniumplayer.core.music.source.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Desktop pipe adapter; API/HTTP/crypto implementation remains upstream Java. */
public final class DesktopWorker {
 private static final Gson GSON=new Gson();
 private static final Set<String> PATHS=new HashSet<>();
 private static final Set<String> METHODS=new HashSet<>();
 public static void main(String[] args)throws Exception{
  JsonObject manifest=JsonParser.parseReader(new InputStreamReader(new FileInputStream(args[0]),StandardCharsets.UTF_8)).getAsJsonObject();
  for(JsonElement p:manifest.getAsJsonArray("paths"))PATHS.add(p.getAsString());
  for(JsonElement p:manifest.getAsJsonArray("features"))METHODS.add(p.getAsJsonObject().get("method").getAsString());
  java.net.HttpURLConnection.setFollowRedirects(false);
  MuNeteaseApi api=new MuNeteaseApi();
  BufferedReader input=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8));
  PrintWriter output=new PrintWriter(new OutputStreamWriter(System.out,StandardCharsets.UTF_8),true);
  // Upstream diagnostics may contain request data; keep them off the IPC pipe.
  System.setOut(new PrintStream(OutputStream.nullOutputStream()));
  String line;
  while((line=input.readLine())!=null){
   JsonObject result=new JsonObject();
   try{
    if(line.length()>65536)throw new IllegalArgumentException();
    JsonObject request=JsonParser.parseString(line).getAsJsonObject();
    result.add("id",request.get("id"));
    String cookie=request.has("cookie")?request.get("cookie").getAsString():"";
    if(cookie.length()>16384||cookie.indexOf('\r')>=0||cookie.indexOf('\n')>=0)throw new IllegalArgumentException();
    if(request.has("method")){
     String name=request.get("method").getAsString();if(!METHODS.contains(name))throw new IllegalArgumentException();
     JsonArray values=request.getAsJsonArray("arguments");
     java.lang.reflect.Method selected=null;Object[] valuesOut=null;
     for(java.lang.reflect.Method m:com.muoniumplayer.core.ncm.api.CloudMusicApi.class.getDeclaredMethods()){
      if(!m.getName().equals(name)||!java.lang.reflect.Modifier.isPublic(m.getModifiers())||m.getParameterCount()!=values.size())continue;
      try{Object[] candidate=new Object[values.size()];for(int j=0;j<candidate.length;j++)candidate[j]=GSON.fromJson(values.get(j),m.getGenericParameterTypes()[j]);selected=m;valuesOut=candidate;break;}catch(Exception ignored){}
     }
     if(selected==null)throw new IllegalArgumentException();
     com.muoniumplayer.core.ncm.OptionsUtil.setCookie(cookie);
     JsonElement data;
     try{data=GSON.toJsonTree(selected.invoke(null,valuesOut));}
     finally{com.muoniumplayer.core.ncm.OptionsUtil.setCookie("");}
     result.addProperty("ok",true);result.add("result",data);output.println(GSON.toJson(result));continue;
    }
    String path=request.get("path").getAsString();
    if(!PATHS.contains(path)&&!path.matches("/weapi/v1/album/[0-9]{1,20}"))throw new IllegalArgumentException();
    LinkedHashMap<String,String> params=new LinkedHashMap<>();
    if(request.has("params"))for(Map.Entry<String,JsonElement> e:request.getAsJsonObject("params").entrySet()){
     if(!e.getValue().isJsonPrimitive())throw new IllegalArgumentException();
     params.put(e.getKey(),e.getValue().getAsString());
    }
    MuNeteaseApi.RawResult response=api.call(path,params,cookie);
    result.addProperty("ok",true);
    result.add("body",JsonParser.parseString(response.getBody()));
    // Main process only. Never expose this field over renderer IPC.
    result.addProperty("cookie",response.getCookie());
   }catch(Exception ignored){result.addProperty("ok",false);result.addProperty("error","网易云原接口请求失败");}
   output.println(GSON.toJson(result));
  }
 }
}
