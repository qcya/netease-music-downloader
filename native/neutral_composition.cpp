#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <dwmapi.h>
#include <DispatcherQueue.h>
#include <d2d1effects.h>
#include <windows.ui.composition.interop.h>
#include <windows.graphics.effects.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Numerics.h>
#include <winrt/Windows.Graphics.Effects.h>
#include <winrt/Windows.System.h>
#include <winrt/Windows.UI.Composition.h>
#include <winrt/Windows.UI.Composition.Desktop.h>
#include <memory>
#include <mutex>
#include <unordered_map>
namespace wuc=winrt::Windows::UI::Composition;
namespace wge=winrt::Windows::Graphics::Effects;
namespace abi=ABI::Windows::Graphics::Effects;
struct BlurEffect : winrt::implements<BlurEffect,wge::IGraphicsEffect,wge::IGraphicsEffectSource,abi::IGraphicsEffectD2D1Interop> {
 wge::IGraphicsEffectSource source{nullptr};float amount=3;winrt::hstring name{L"NeutralBlur"};
 winrt::hstring Name(){return name;}void Name(winrt::hstring const& value){name=value;}
 HRESULT __stdcall GetEffectId(GUID* id)noexcept override{*id=CLSID_D2D1GaussianBlur;return S_OK;}
 HRESULT __stdcall GetNamedPropertyMapping(LPCWSTR property,UINT* index,abi::GRAPHICS_EFFECT_PROPERTY_MAPPING* mapping)noexcept override{if(wcscmp(property,L"BlurAmount"))return E_INVALIDARG;*index=0;*mapping=abi::GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT;return S_OK;}
 HRESULT __stdcall GetPropertyCount(UINT* count)noexcept override{*count=3;return S_OK;}
 HRESULT __stdcall GetProperty(UINT index,ABI::Windows::Foundation::IPropertyValue** value)noexcept override{try{using winrt::Windows::Foundation::PropertyValue;winrt::Windows::Foundation::IInspectable p{nullptr};if(index==0)p=PropertyValue::CreateSingle(amount);else if(index==1)p=PropertyValue::CreateUInt32(D2D1_GAUSSIANBLUR_OPTIMIZATION_BALANCED);else if(index==2)p=PropertyValue::CreateUInt32(D2D1_BORDER_MODE_HARD);else return E_INVALIDARG;auto typed=p.as<winrt::Windows::Foundation::IPropertyValue>();*value=static_cast<ABI::Windows::Foundation::IPropertyValue*>(winrt::detach_abi(typed));return S_OK;}catch(...){return winrt::to_hresult();}}
 HRESULT __stdcall GetSource(UINT index,abi::IGraphicsEffectSource** value)noexcept override{if(index!=0)return E_INVALIDARG;return source.as<::IUnknown>()->QueryInterface(__uuidof(abi::IGraphicsEffectSource),reinterpret_cast<void**>(value));}
 HRESULT __stdcall GetSourceCount(UINT* count)noexcept override{*count=1;return S_OK;}
};
struct State{HWND hwnd;int width,height;float radius,amount,opacity;HANDLE ready=CreateEventW(nullptr,TRUE,FALSE,nullptr),thread=nullptr;DWORD tid=0;HRESULT result=E_PENDING;~State(){if(ready)CloseHandle(ready);if(thread)CloseHandle(thread);}};
std::mutex guard;std::unordered_map<HWND,std::shared_ptr<State>> states;
DWORD WINAPI Run(void* parameter){
 auto owner=std::unique_ptr<std::shared_ptr<State>>(static_cast<std::shared_ptr<State>*>(parameter));auto s=*owner;
 try{
  winrt::init_apartment(winrt::apartment_type::single_threaded);
  struct ApartmentScope{~ApartmentScope(){winrt::uninit_apartment();}} apartmentScope;
  winrt::Windows::System::DispatcherQueueController queue{nullptr};
  DispatcherQueueOptions options{sizeof(options),DQTYPE_THREAD_CURRENT,DQTAT_COM_STA};
  winrt::check_hresult(CreateDispatcherQueueController(options,reinterpret_cast<ABI::Windows::System::IDispatcherQueueController**>(winrt::put_abi(queue))));
  wuc::Compositor compositor;
  winrt::Windows::UI::Composition::Desktop::DesktopWindowTarget target{nullptr};
  winrt::check_hresult(compositor.as<ABI::Windows::UI::Composition::Desktop::ICompositorDesktopInterop>()->CreateDesktopWindowTarget(s->hwnd,FALSE,reinterpret_cast<ABI::Windows::UI::Composition::Desktop::IDesktopWindowTarget**>(winrt::put_abi(target))));
  auto effect=winrt::make_self<BlurEffect>();effect->amount=s->amount;effect->source=wuc::CompositionEffectSourceParameter(L"behind");
  auto brush=compositor.CreateEffectFactory(*effect).CreateBrush();brush.SetSourceParameter(L"behind",compositor.CreateHostBackdropBrush());
  auto visual=compositor.CreateSpriteVisual();visual.Brush(brush);visual.Opacity(s->opacity);
  auto geometry=compositor.CreateRoundedRectangleGeometry();geometry.CornerRadius({s->radius,s->radius});visual.Clip(compositor.CreateGeometricClip(geometry));
  auto resize=[&]{RECT r{};GetClientRect(s->hwnd,&r);winrt::Windows::Foundation::Numerics::float2 size{float(r.right),float(r.bottom)};visual.Size(size);geometry.Size(size);float scale=GetDpiForWindow(s->hwnd)/96.0f;geometry.CornerRadius({s->radius*scale,s->radius*scale});};
  resize();target.Root(visual);s->result=S_OK;SetEvent(s->ready);
  MSG message{};while(GetMessageW(&message,nullptr,0,0)>0){if(message.message==WM_APP+42)resize();else{TranslateMessage(&message);DispatchMessageW(&message);}}
  target.Root(nullptr);brush.Close();compositor.Close();
 }catch(...){s->result=winrt::to_hresult();SetEvent(s->ready);}
 return 0;
}
extern "C" __declspec(dllexport) int __stdcall PlayerBlurAttach(HWND hwnd,int width,int height,float radius,float amount,float opacity){
 std::lock_guard lock(guard);if(states.count(hwnd))return S_FALSE;
 auto s=std::make_shared<State>();s->hwnd=hwnd;s->width=width;s->height=height;s->radius=radius;s->amount=amount;s->opacity=opacity;
 BOOL enabled=TRUE;HRESULT result=DwmSetWindowAttribute(hwnd,DWMWA_USE_HOSTBACKDROPBRUSH,&enabled,sizeof(enabled));if(FAILED(result))return result;
 s->thread=CreateThread(nullptr,0,Run,new std::shared_ptr<State>(s),0,&s->tid);if(!s->thread)return HRESULT_FROM_WIN32(GetLastError());
 if(WaitForSingleObject(s->ready,5000)!=WAIT_OBJECT_0){PostThreadMessageW(s->tid,WM_QUIT,0,0);return E_FAIL;}
 if(SUCCEEDED(s->result))states.emplace(hwnd,s);return s->result;
}
extern "C" __declspec(dllexport) void __stdcall PlayerBlurResize(HWND hwnd){std::lock_guard lock(guard);auto it=states.find(hwnd);if(it!=states.end())PostThreadMessageW(it->second->tid,WM_APP+42,0,0);}
extern "C" __declspec(dllexport) void __stdcall PlayerBlurDetach(HWND hwnd){std::shared_ptr<State>s;{std::lock_guard lock(guard);auto it=states.find(hwnd);if(it==states.end())return;s=it->second;states.erase(it);}PostThreadMessageW(s->tid,WM_QUIT,0,0);WaitForSingleObject(s->thread,2000);}

extern "C" __declspec(dllexport) int __stdcall PlayerBlurCount(){std::lock_guard lock(guard);return static_cast<int>(states.size());}
