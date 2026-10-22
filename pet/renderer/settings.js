(() => {
  const $ = id => document.getElementById(id);
  const msg = (text, err = false) => { $('msg').textContent = text; $('msg').classList.toggle('err', err); };
  const mode = () => document.querySelector('input[name="mode"]:checked')?.value ?? 'key';

  function render(view) {
    document.querySelector(`input[name="mode"][value="${view.mode}"]`).checked = true;
    $('baseUrl').value = view.baseUrl;
    $('userName').value = view.userName;
    $('keyPreview').textContent = view.hasKey ? `已配置 ${view.keyPreview}` : '未配置';
    $('who').textContent = view.mode === 'login' && view.userName ? view.userName : '未登录';
    $('apiKey').value = '';
    toggleSections();
  }
  function toggleSections() {
    $('key-section').hidden = mode() !== 'key';
    $('login-section').hidden = mode() !== 'login';
  }
  const run = fn => async () => {
    try { await fn(); } catch (e) { msg(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
  };

  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', toggleSections));

  $('save').addEventListener('click', run(async () => {
    const view = await window.settings.save({
      mode: mode(), baseUrl: $('baseUrl').value, userName: $('userName').value, apiKey: $('apiKey').value,
    });
    render(view);
    msg('已保存，可以去跟肥鱼聊天了');
  }));

  $('import').addEventListener('click', run(async () => {
    const view = await window.settings.importKeyFile();
    if (view) { render(view); msg('Key 导入成功'); }
  }));

  $('login').addEventListener('click', run(async () => {
    await window.settings.save({ mode: 'login', baseUrl: $('baseUrl').value });
    msg('在弹出的窗口里完成飞书登录…');
    const { user, view } = await window.settings.login();
    render(view);
    msg(user ? `登录成功：${user.userName}` : '登录窗口已关闭，未完成登录', !user);
  }));

  $('logout').addEventListener('click', run(async () => {
    render(await window.settings.logout());
    msg('已退出飞书登录，切回 API Key 模式');
  }));

  window.settings.get().then(render);
})();
