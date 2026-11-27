#define WIN32_LEAN_AND_MEAN
#include <windows.h>

namespace {
HANDLE worker{}, ready{}, stopping{}, taps{};
HWND inputWindow{};
bool registered{};

struct TapState {
    bool down{}, solo{};
    HANDLE device{};
};

bool isRightShift(const RAWKEYBOARD& key) {
    return !(key.Flags & (RI_KEY_E0 | RI_KEY_E1)) &&
        (key.VKey == VK_RSHIFT || (key.VKey == VK_SHIFT && key.MakeCode == 0x36));
}

bool anotherKeyHeld() {
    for (int key = VK_BACK; key < 0xff; ++key) {
        if (key != VK_SHIFT && key != VK_RSHIFT && (GetAsyncKeyState(key) & 0x8000)) return true;
    }
    return false;
}

LRESULT CALLBACK InputProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    // The message-only window has one owner thread. Only a tap signal leaves it.
    static TapState shift;
    if (message == WM_INPUT_DEVICE_CHANGE && wParam == GIDC_REMOVAL &&
        shift.device == reinterpret_cast<HANDLE>(lParam)) shift = {};
    if (message == WM_INPUT) {
        RAWINPUT input{};
        UINT size = sizeof(input);
        if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lParam), RID_INPUT,
                &input, &size, sizeof(RAWINPUTHEADER)) != UINT(-1) &&
                input.header.dwType == RIM_TYPEKEYBOARD) {
            const auto& key = input.data.keyboard;
            const bool released = (key.Flags & RI_KEY_BREAK) != 0;
            if (key.VKey < 0xff && key.MakeCode != KEYBOARD_OVERRUN_MAKE_CODE) {
                if (isRightShift(key)) {
                    if (!released && !shift.down) {
                        shift = {true, !anotherKeyHeld(), input.header.hDevice};
                    } else if (released && shift.down && shift.device == input.header.hDevice) {
                        if (shift.solo && !anotherKeyHeld()) ReleaseSemaphore(taps, 1, nullptr);
                        shift = {};
                    }
                } else if (!released) {
                    shift.solo = false;
                }
            }
        }
    }
    if (message == WM_DESTROY) shift = {};
    return DefWindowProcW(window, message, wParam, lParam);
}

DWORD WINAPI InputLoop(void*) {
    const auto instance = GetModuleHandleW(nullptr);
    WNDCLASSW klass{};
    klass.hInstance = instance;
    klass.lpfnWndProc = InputProc;
    klass.lpszClassName = L"CoastlinePlayerRightShift";
    if (RegisterClassW(&klass)) {
        inputWindow = CreateWindowExW(0, klass.lpszClassName, nullptr, 0, 0, 0, 0, 0,
            HWND_MESSAGE, nullptr, instance, nullptr);
    }
    if (inputWindow) {
        RAWINPUTDEVICE keyboard{1, 6, RIDEV_INPUTSINK | RIDEV_DEVNOTIFY, inputWindow};
        registered = RegisterRawInputDevices(&keyboard, 1, sizeof(keyboard)) != FALSE;
    }
    SetEvent(ready);
    while (registered && MsgWaitForMultipleObjects(1, &stopping, FALSE, INFINITE, QS_ALLINPUT) == WAIT_OBJECT_0 + 1) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) DispatchMessageW(&message);
    }
    if (registered) {
        RAWINPUTDEVICE keyboard{1, 6, RIDEV_REMOVE, nullptr};
        RegisterRawInputDevices(&keyboard, 1, sizeof(keyboard));
    }
    if (inputWindow) DestroyWindow(inputWindow);
    UnregisterClassW(klass.lpszClassName, instance);
    return 0;
}
}

extern "C" __declspec(dllexport) void __stdcall PlayerRightShiftStop() {
    if (stopping) SetEvent(stopping);
    if (worker) {
        WaitForSingleObject(worker, INFINITE);
        CloseHandle(worker);
        worker = nullptr;
    }
}

extern "C" __declspec(dllexport) int __stdcall PlayerRightShiftStart() {
    if (stopping) return 0;  // One registration per app lifetime.
    ready = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    stopping = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    taps = CreateSemaphoreW(nullptr, 0, 16, nullptr);
    if (ready && stopping && taps) worker = CreateThread(nullptr, 0, InputLoop, nullptr, 0, nullptr);
    if (!worker || WaitForSingleObject(ready, 3000) != WAIT_OBJECT_0 || !registered) {
        PlayerRightShiftStop();
        return 0;
    }
    CloseHandle(ready);
    ready = nullptr;
    return 1;
}

extern "C" __declspec(dllexport) int __stdcall PlayerRightShiftWait() {
    // Keep these two process-lifetime handles valid until the last async wait returns.
    const HANDLE handles[]{stopping, taps};
    return WaitForMultipleObjects(2, handles, FALSE, INFINITE) == WAIT_OBJECT_0 + 1;
}
