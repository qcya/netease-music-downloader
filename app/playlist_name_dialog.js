'use strict';
// The renderer cannot rely on window.prompt(): Electron does not implement it.
// Keep this as an ordinary DOM dialog so failures can be edited and retried.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlaylistNameDialog = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function create(doc) {
    const get = id => doc.getElementById(id);
    const overlay = get('playlist-name-dialog');
    const form = get('playlist-name-form');
    const title = get('playlist-name-title');
    const input = get('playlist-name-input');
    const error = get('playlist-name-error');
    const cancel = get('playlist-name-cancel');
    const save = get('playlist-name-save');
    if (![overlay, form, title, input, error, cancel, save].every(Boolean)) {
      throw new Error('歌单名称弹窗缺少必要的页面元素');
    }

    const shell = doc.querySelector?.('.app-shell');
    let oldInert = false;
    let active = null;
    let saving = false;
    function busy(value) {
      saving = value;
      input.disabled = value;
      cancel.disabled = value;
      save.disabled = value;
      save.textContent = value ? '保存中…' : active?.confirmText || '保存';
    }
    function close(result) {
      if (!active) return;
      const {resolve, previousFocus} = active;
      active = null;
      overlay.hidden = true;
      if(shell)shell.inert=oldInert;
      error.textContent = '';
      busy(false);
      previousFocus?.focus?.();
      resolve(result);
    }

    input.addEventListener('input', () => {error.textContent = '';});
    cancel.addEventListener('click', () => {if (!saving) close(null);});
    overlay.addEventListener('click', event => {
      if (event.target === overlay && !saving) close(null);
    });
    overlay.addEventListener('keydown', event => {
      if(!active)return;
      if(event.key==='Tab'){
        const controls=[input,cancel,save].filter(el=>!el.disabled);
        if(!controls.length){event.preventDefault();return;}
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!saving) close(null);
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!active || saving) return;
      const name = input.value.trim();
      if (!name || name.length > 32 || /[\\/\x00-\x1f]/.test(name)) {
        error.textContent = '请输入 1—32 字的歌单名称，不能包含斜杠或控制字符。';
        input.focus();
        return;
      }
      busy(true);
      try {
        await active.onSubmit(name);
        close(name);
      } catch (e) {
        // Do not close on a failed IPC write (including duplicate names).
        error.textContent = e?.message || String(e);
        busy(false);
        input.focus();
      }
    });

    return {
      open({title: heading, initialName = '', confirmText = '保存', onSubmit}) {
        if (active) return Promise.reject(new Error('已有一个歌单编辑窗口打开'));
        if (typeof onSubmit !== 'function') return Promise.reject(new Error('未设置歌单保存操作'));
        const previousFocus = doc.activeElement;
        title.textContent = heading;
        input.value = String(initialName);
        error.textContent = '';
        overlay.hidden = false;
        if(shell){oldInert=shell.inert;shell.inert=true;}
        const promise = new Promise(resolve => {
          active = {resolve, onSubmit, confirmText, previousFocus};
        });
        busy(false);
        input.focus();
        input.select();
        return promise;
      }
    };
  }
  return {create};
});
