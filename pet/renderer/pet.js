// Pet window behaviour: moods, click-through, dragging, chatting.
(() => {
  // Outside Electron (e.g. opened in a browser for a look) fall back to a canned brain.
  const api = window.pet ?? {
    setInteractive() {}, drag() {}, openMenu() {}, cancel() {},
    chat(id, msg) {
      const reply = `咕噜～（预览模式，没有连接妙搭）你说的是：${msg}`;
      [...reply].forEach((ch, i) => setTimeout(() => this._chunk?.({ id, text: ch }), 40 * i + 300));
      setTimeout(() => this._done?.({ id }), 40 * reply.length + 350);
      return Promise.resolve();
    },
    onTool() {}, onChunk(fn) { this._chunk = fn; }, onDone(fn) { this._done = fn; }, onError() {},
    onStatus() {}, onClear() {}, onSelftest() {}, selftestDone() {},
  };

  const stage = document.getElementById('stage');
  const fish = document.getElementById('fish');
  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const composer = document.getElementById('composer');
  const input = document.getElementById('input');
  const sendBtn = composer.querySelector('button');

  const MAX_TURNS = 10;
  const SLEEP_AFTER_MS = 90_000;
  const GREETINGS = ['咕噜～有事找我？', '今天也要元气满满呀！', '戳我干嘛，想聊天吗～', '饿了…不过先帮你干活！'];

  let history = []; // [{ role: 'user'|'pet', content }]
  let current = null; // { id, text, started, firstChunkAt }
  let hideTimer = null;
  let moodTimer = null;
  let idleTimer = null;
  let selftest = null;

  // ---------- animation clips (assets/whalechan, see CREDITS.md) ----------
  const CLIP_DIR = '../assets/whalechan/';
  const MOOD_CLIPS = {
    idle: 'idle', listening: 'look', thinking: 'think', working: 'busy',
    talking: 'talk', happy: 'cheer', error: 'sigh', sleepy: 'sleep',
  };
  const IDLE_EXTRAS = ['look', 'cube', 'rice', 'hum', 'yawn'];
  const REACTIONS = ['react-jump', 'react-shy', 'react-tickle', 'react-wave', 'react-pout'];
  const layers = [document.getElementById('clip-a'), document.getElementById('clip-b')];
  let front = 0;
  let loopClip = 'idle'; // what the current mood keeps playing
  let oneShot = null; // a reaction playing once before returning to loopClip

  // Loads the clip into the hidden layer and swaps it in once it can play, so there is no blank frame.
  function showClip(name, loop) {
    const next = layers[1 - front];
    const cur = layers[front];
    next.loop = loop;
    next.onended = loop ? null : () => { oneShot = null; showClip(loopClip, true); };
    next.oncanplay = () => {
      next.oncanplay = null;
      next.play().catch(() => {});
      next.classList.add('on');
      cur.classList.remove('on');
      setTimeout(() => cur.pause(), 200);
      front = 1 - front;
    };
    next.src = `${CLIP_DIR}${name}.webm`;
  }
  function playOnce(name) {
    oneShot = name;
    showClip(name, false);
  }
  // While idle, now and then swap the breathing loop for a little idle activity.
  setInterval(() => {
    if (stage.className === 'mood-idle' && !oneShot && !dragging && Math.random() < 0.35) {
      playOnce(IDLE_EXTRAS[Math.floor(Math.random() * IDLE_EXTRAS.length)]);
    }
  }, 15_000);

  // ---------- moods ----------
  function setMood(mood, backToIdleMs) {
    const wasSleepy = stage.className === 'mood-sleepy';
    stage.className = `mood-${mood}`;
    clearTimeout(moodTimer);
    if (backToIdleMs) moodTimer = setTimeout(() => setMood('idle'), backToIdleMs);
    if (mood !== 'sleepy') armSleep();
    const clip = MOOD_CLIPS[mood] ?? 'idle';
    if (wasSleepy && mood !== 'sleepy') {
      loopClip = clip;
      playOnce('wake');
    } else if (clip !== loopClip || !oneShot) {
      loopClip = clip;
      oneShot = null;
      if (!dragging) showClip(clip, true);
    }
  }
  function armSleep() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!current) setMood('sleepy'); }, SLEEP_AFTER_MS);
  }

  // ---------- bubble ----------
  function say(text, { error = false, streaming = false, holdMs } = {}) {
    clearTimeout(hideTimer);
    bubble.classList.remove('hidden');
    bubble.classList.toggle('error', error);
    bubbleText.textContent = text;
    bubble.querySelector('.cursor')?.remove();
    if (streaming) bubble.insertAdjacentHTML('beforeend', '<span class="cursor"></span>');
    bubble.scrollTop = bubble.scrollHeight;
    if (!streaming) {
      const ms = holdMs ?? Math.min(20_000, 4_000 + text.length * 120);
      hideTimer = setTimeout(() => { if (!bubble.matches(':hover')) bubble.classList.add('hidden'); }, ms);
    }
  }

  // ---------- click-through: only the fish and UI take the mouse ----------
  let pointerOver = 0;
  let dragging = false;
  const interactive = () => api.setInteractive(pointerOver > 0 || dragging || document.activeElement === input);
  for (const el of [fish, bubble, composer]) {
    el.addEventListener('mouseenter', () => { pointerOver++; interactive(); });
    el.addEventListener('mouseleave', () => { pointerOver = Math.max(0, pointerOver - 1); interactive(); });
  }
  input.addEventListener('blur', interactive);

  // ---------- drag vs click on the fish ----------
  let down = null;
  fish.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY, lastX: e.screenX, lastY: e.screenY, moved: false };
    dragging = true;
    interactive();
  });
  window.addEventListener('mousemove', e => {
    if (!down) return;
    const dx = e.screenX - down.lastX;
    const dy = e.screenY - down.lastY;
    if (!down.moved && Math.abs(e.screenX - down.x) + Math.abs(e.screenY - down.y) > 4) {
      down.moved = true;
      showClip('drag', true);
    }
    if (down.moved && (dx || dy)) api.drag(dx, dy);
    down.lastX = e.screenX;
    down.lastY = e.screenY;
  });
  window.addEventListener('mouseup', () => {
    if (!down) return;
    const wasClick = !down.moved;
    down = null;
    dragging = false;
    interactive();
    if (wasClick) toggleComposer();
    else showClip(loopClip, true);
  });
  fish.addEventListener('contextmenu', e => { e.preventDefault(); api.openMenu(); });
  fish.addEventListener('dblclick', () => {
    if (!current) playOnce(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
    say(GREETINGS[Math.floor(Math.random() * GREETINGS.length)], { holdMs: 3000 });
  });

  function toggleComposer(force, { focus = true } = {}) {
    const show = force ?? composer.classList.contains('hidden');
    composer.classList.toggle('hidden', !show);
    if (show) {
      if (focus) input.focus();
      if (!current) setMood('listening');
    } else {
      input.blur();
      if (!current) setMood('idle');
    }
    interactive();
  }
  input.addEventListener('keydown', e => { if (e.key === 'Escape') toggleComposer(false); });

  // ---------- chat ----------
  composer.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || current) return;
    input.value = '';
    send(text);
  });

  function send(text) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    current = { id, text: '', started: performance.now(), firstChunkAt: null, message: text };
    sendBtn.disabled = true;
    setMood('thinking');
    say('咕噜咕噜…', { streaming: true });
    api.chat(id, text, history.slice(-MAX_TURNS));
  }

  // The Miaoda gateway sometimes buffers the SSE stream and delivers it in one go, so text is
  // revealed by a typewriter at a steady pace whether it arrives in pieces or all at once.
  const TYPE_MS = 28;
  let typeTimer = null;
  function typewriter() {
    if (typeTimer) return;
    typeTimer = setInterval(() => {
      if (!current) return stopTypewriter();
      if (current.shown < current.text.length) {
        current.shown = Math.min(current.text.length, current.shown + (current.text.length - current.shown > 60 ? 3 : 1));
        say(current.text.slice(0, current.shown), { streaming: true });
      } else if (current.finished) {
        finish();
      }
    }, TYPE_MS);
  }
  function stopTypewriter() {
    clearInterval(typeTimer);
    typeTimer = null;
  }

  const TOOL_LINES = {
    calendar_agenda: ({ date }) => ['📅', `翻翻你${date ? ` ${date.slice(5).replace('-', '月')}日` : ''}的日历…`],
    task_list: () => ['✅', '看看你还有哪些待办…'],
  };
  const badge = document.getElementById('badge');

  api.onTool(({ id, action, date }) => {
    if (!current || id !== current.id || !TOOL_LINES[action]) return;
    const [icon, line] = TOOL_LINES[action]({ date });
    badge.textContent = icon;
    current.tool = action;
    setMood('working');
    say(line, { streaming: true });
  });

  api.onChunk(({ id, text }) => {
    if (!current || id !== current.id) return;
    if (current.firstChunkAt === null) {
      current.firstChunkAt = performance.now();
      current.shown = 0;
      setMood('talking');
      typewriter();
    }
    current.text += text;
  });

  api.onDone(({ id, toolResult }) => {
    if (!current || id !== current.id) return;
    current.toolResult = toolResult;
    current.finished = true;
    current.doneAt = performance.now();
    if (current.firstChunkAt === null) finish();
  });

  function finish() {
    stopTypewriter();
    const done = current;
    current = null;
    sendBtn.disabled = false;
    history.push({ role: 'user', content: done.message }, { role: 'pet', content: done.text });
    history = history.slice(-MAX_TURNS * 2);
    say(done.text || '（肥鱼一时语塞）');
    setMood('happy', 1200);
    finishSelftest({
      ok: true,
      reply: done.text,
      tool: done.tool ?? 'none',
      toolResultLines: done.toolResult ? done.toolResult.split('\n').length : 0,
      toolResultHead: done.toolResult ? done.toolResult.split('\n')[0] : '',
      firstChunkMs: done.firstChunkAt === null ? null : Math.round(done.firstChunkAt - done.started),
      totalMs: Math.round(done.doneAt - done.started),
    });
  }

  api.onError(({ id, message, auth }) => {
    if (!current || id !== current.id) return;
    stopTypewriter();
    current = null;
    sendBtn.disabled = false;
    say(auth ? message : `呜…出错了：${message}`, { error: !auth, holdMs: auth ? 12_000 : undefined });
    setMood(auth ? 'listening' : 'error', 1800);
    finishSelftest({ ok: false, error: message });
  });

  api.onStatus(({ text, mood }) => {
    say(text, { holdMs: 4000 });
    if (mood) setMood(mood, 1500);
  });

  api.onClear(() => {
    history = [];
    say('记忆清空啦，我们重新认识一下吧～', { holdMs: 3000 });
  });

  // ---------- self test (AIPET_SELFTEST=1) ----------
  api.onSelftest(({ message }) => {
    selftest = { message };
    toggleComposer(true, { focus: false }); // never grab the keyboard during an unattended run
    input.value = message;
    composer.requestSubmit();
  });
  function finishSelftest(result) {
    if (!selftest) return;
    selftest = null;
    // leave the bubble on screen briefly so the screenshot shows the finished reply
    setTimeout(() => api.selftestDone(result), 900);
  }

  setMood('idle');
  setTimeout(() => say('咕噜～我是肥鱼，点我聊天，右键看菜单', { holdMs: 5000 }), 600);
})();
