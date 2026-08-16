(() => {
  'use strict';

  const API_BASE = 'https://seekservice-9gkeeztlfcb2a6d4-1301441002.ap-shanghai.app.tcloudbase.com';
  const PAYMENT_QR = 'https://7365-seekservice-9gkeeztlfcb2a6d4-1301441002.tcb.qcloud.la/mini-gotopay.png?sign=61cda63121f6df0be8f4d11caa43002a&t=1755240478';
  const STORAGE_KEY = 'markdown2word_user_v1';
  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  const state = {
    format: 'word',
    user: loadUser(),
    loginPoll: null,
    loginCountdown: null,
    pendingConversion: false,
    busy: false
  };

  const el = {
    input: document.querySelector('#markdownInput'),
    preview: document.querySelector('#markdownPreview'),
    charCount: document.querySelector('#charCount'),
    upload: document.querySelector('#markdownFile'),
    pasteButton: document.querySelector('#pasteButton'),
    uploadButton: document.querySelector('#uploadButton'),
    sampleButton: document.querySelector('#sampleButton'),
    clearButton: document.querySelector('#clearButton'),
    formatButtons: [...document.querySelectorAll('[data-format]')],
    convertButton: document.querySelector('#convertButton'),
    status: document.querySelector('#converterStatus'),
    result: document.querySelector('#resultCard'),
    resultText: document.querySelector('#resultText'),
    downloadLink: document.querySelector('#downloadLink'),
    accountStatus: document.querySelector('#accountStatus'),
    loginButton: document.querySelector('#loginButton'),
    logoutButton: document.querySelector('#logoutButton'),
    loginModal: document.querySelector('#loginModal'),
    loginQr: document.querySelector('#loginQr'),
    loginMessage: document.querySelector('#loginMessage'),
    loginCountdown: document.querySelector('#loginCountdown'),
    vipModal: document.querySelector('#vipModal'),
    vipQr: document.querySelector('#vipQr'),
    vipMessage: document.querySelector('#vipMessage'),
    paymentButton: document.querySelector('#paymentCompleted')
  };

  if (!el.input || !el.convertButton) return;

  function loadUser() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value && typeof value === 'object' ? value : emptyUser();
    } catch {
      return emptyUser();
    }
  }

  function emptyUser() {
    return { userId: '', userToken: '', userStatus: 'unlogin', vipStatus: 'none' };
  }

  function saveUser(next) {
    state.user = { ...emptyUser(), ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
    renderAccount();
  }

  function clearUser() {
    state.user = emptyUser();
    localStorage.removeItem(STORAGE_KEY);
    renderAccount();
  }

  async function request(endpoint, data = {}, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 120000);
    const headers = {
      'Content-Type': 'application/json',
      'Plugin-Type': 'doubao'
    };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    try {
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal
      });
      let result;
      try {
        result = await response.json();
      } catch {
        result = { code: -500, message: '服务返回了无法识别的数据' };
      }
      if (!response.ok && typeof result.code === 'undefined') result.code = response.status;
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('处理时间较长，请稍后重试');
      throw new Error('无法连接转换服务，请检查网络后重试');
    } finally {
      clearTimeout(timeout);
    }
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function inlineMarkdown(value) {
    let text = value;
    const codeTokens = [];
    text = text.replace(/`([^`]+)`/g, (_, code) => {
      const token = `@@INLINECODE${codeTokens.length}@@`;
      codeTokens.push(`<code>${code}</code>`);
      return token;
    });
    text = text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/\$([^$\n]+)\$/g, '<span class="math-inline">$1</span>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    codeTokens.forEach((html, index) => { text = text.replace(`@@INLINECODE${index}@@`, html); });
    return text;
  }

  function renderMarkdown(source) {
    if (!source.trim()) return '<div class="preview-empty">在左侧输入 Markdown，预览会显示在这里。</div>';
    const escaped = escapeHtml(source.replace(/\r\n?/g, '\n'));
    const blocks = [];
    const withoutCode = escaped.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => {
      const token = `@@CODEBLOCK${blocks.length}@@`;
      blocks.push(`<pre><code${language ? ` data-language="${language.trim()}"` : ''}>${code.replace(/\n$/, '')}</code></pre>`);
      return token;
    });
    const lines = withoutCode.split('\n');
    const html = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const codeMatch = line.match(/^@@CODEBLOCK(\d+)@@$/);
      if (codeMatch) { html.push(blocks[Number(codeMatch[1])]); index += 1; continue; }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) { const level = heading[1].length; html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); index += 1; continue; }
      if (line.startsWith('&gt; ')) { html.push(`<blockquote>${inlineMarkdown(line.slice(5))}</blockquote>`); index += 1; continue; }
      if (line.includes('|') && lines[index + 1] && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
        const splitRow = row => row.replace(/^\s*\||\|\s*$/g, '').split('|').map(cell => cell.trim());
        const headers = splitRow(line);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { rows.push(splitRow(lines[index])); index += 1; }
        html.push(`<table><thead><tr>${headers.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*[-*+]\s+/, '')); index += 1; }
        html.push(`<ul>${items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*\d+\.\s+/, '')); index += 1; }
        html.push(`<ol>${items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</ol>`);
        continue;
      }
      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+|^\s*[-*+]\s+|^\s*\d+\.\s+|^@@CODEBLOCK/.test(lines[index])) { paragraph.push(lines[index]); index += 1; }
      html.push(`<p>${inlineMarkdown(paragraph.join('<br>'))}</p>`);
    }
    return html.join('');
  }

  let previewTimer;
  function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const content = el.input.value;
      el.preview.innerHTML = renderMarkdown(content);
      el.charCount.textContent = `${content.length.toLocaleString('zh-CN')} 字符`;
    }, 80);
  }

  function showStatus(message, type = '') {
    el.status.textContent = message;
    el.status.className = `converter-status${type ? ` ${type}` : ''}`;
  }

  function renderAccount() {
    const loggedIn = state.user.userStatus === 'loggedIn' && state.user.userId && state.user.userToken;
    if (!loggedIn) {
      el.accountStatus.innerHTML = '未登录';
      el.loginButton.textContent = '登录';
      el.logoutButton.classList.remove('visible');
      return;
    }
    const vip = state.user.vipStatus === 'vip';
    el.accountStatus.innerHTML = vip ? '<strong>VIP会员</strong>' : '<strong>普通用户</strong>';
    el.loginButton.textContent = vip ? 'VIP已开通' : '开通VIP';
    el.logoutButton.classList.add('visible');
  }

  function openModal(modal) { modal.classList.add('visible'); modal.setAttribute('aria-hidden', 'false'); }
  function closeModal(modal) { modal.classList.remove('visible'); modal.setAttribute('aria-hidden', 'true'); }

  function stopLoginPolling() {
    clearInterval(state.loginPoll);
    clearInterval(state.loginCountdown);
    state.loginPoll = null;
    state.loginCountdown = null;
  }

  async function openLogin() {
    stopLoginPolling();
    el.loginQr.removeAttribute('src');
    el.loginQr.classList.add('loading');
    el.loginMessage.textContent = '正在获取登录二维码…';
    el.loginMessage.className = 'modal-message';
    el.loginCountdown.textContent = '';
    openModal(el.loginModal);
    try {
      const result = await request('pg2qcurl', {});
      if (!result.ticket || !result.qrCodeBase64) throw new Error(result.message || '二维码获取失败');
      el.loginQr.src = `data:image/png;base64,${result.qrCodeBase64}`;
      el.loginQr.classList.remove('loading');
      el.loginMessage.textContent = '请使用微信扫码登录';
      let seconds = 120;
      const updateCountdown = () => {
        const minutes = Math.floor(seconds / 60);
        const rest = String(seconds % 60).padStart(2, '0');
        el.loginCountdown.textContent = `二维码有效期 ${minutes}:${rest}`;
        seconds -= 1;
        if (seconds < 0) {
          stopLoginPolling();
          el.loginMessage.textContent = '二维码已过期，请关闭后重新获取';
          el.loginMessage.className = 'modal-message error';
        }
      };
      updateCountdown();
      state.loginCountdown = setInterval(updateCountdown, 1000);
      state.loginPoll = setInterval(async () => {
        try {
          const login = await request('pclogin', { bridgingId: result.ticket }, { timeout: 15000 });
          if (login.code === 0 && login.openid && login.bridgingId) {
            stopLoginPolling();
            saveUser({ userId: login.openid, userToken: login.bridgingId, userStatus: 'loggedIn', vipStatus: 'none' });
            el.loginMessage.textContent = '登录成功，正在同步会员状态…';
            el.loginMessage.className = 'modal-message success';
            await refreshUserInfo(false);
            setTimeout(() => {
              closeModal(el.loginModal);
              if (state.pendingConversion) continueAfterAuthentication();
            }, 650);
          }
        } catch {
          // A transient polling error should not invalidate the QR session.
        }
      }, 3000);
    } catch (error) {
      el.loginMessage.textContent = error.message;
      el.loginMessage.className = 'modal-message error';
    }
  }

  async function refreshUserInfo(clearOnInvalid = true) {
    const user = state.user;
    if (!user.userId || !user.userToken || user.userStatus !== 'loggedIn') return null;
    try {
      const result = await request('pguserinfo', { openid: user.userId, status: user.userStatus }, { token: user.userToken, timeout: 30000 });
      if (result.code === -1 || !result.bridgingId || result.bridgingId !== user.userToken) {
        if (clearOnInvalid) clearUser();
        return null;
      }
      const next = {
        userId: result._openid || user.userId,
        userToken: result.bridgingId,
        userStatus: 'loggedIn',
        vipStatus: result.memberType || 'none'
      };
      saveUser(next);
      return next;
    } catch (error) {
      showStatus(error.message, 'error');
      return user;
    }
  }

  function openVip() {
    el.vipQr.src = PAYMENT_QR;
    el.vipMessage.textContent = '完成付款后，请点击下方按钮刷新会员状态。';
    el.vipMessage.className = 'modal-message';
    el.paymentButton.disabled = false;
    el.paymentButton.textContent = '已完成支付';
    openModal(el.vipModal);
  }

  async function continueAfterAuthentication() {
    const freshUser = await refreshUserInfo();
    if (!freshUser) {
      state.pendingConversion = true;
      openLogin();
      return;
    }
    if (freshUser.vipStatus !== 'vip') {
      state.pendingConversion = true;
      openVip();
      return;
    }
    if (state.pendingConversion) {
      state.pendingConversion = false;
      performConversion();
    }
  }

  async function startConversion() {
    if (state.busy) return;
    if (!el.input.value.trim()) {
      showStatus('请先输入或上传 Markdown 内容。', 'error');
      el.input.focus();
      return;
    }
    state.pendingConversion = true;
    await continueAfterAuthentication();
  }

  function setBusy(busy) {
    state.busy = busy;
    el.convertButton.disabled = busy;
    el.convertButton.textContent = busy ? '正在生成文档…' : `转换为 ${state.format === 'word' ? 'Word' : 'PDF'}`;
  }

  async function performConversion() {
    setBusy(true);
    el.result.classList.remove('visible');
    showStatus('正在排版并生成文档，请稍候…');
    try {
      const endpoint = state.format === 'word' ? 'pc2word' : 'pc2pdf';
      const result = await request(endpoint, {
        content: el.input.value,
        openid: state.user.userId,
        line: 1,
        formula_position: '0'
      }, { token: state.user.userToken });
      if (result.code !== 0) {
        if (result.code === -1) {
          const fresh = await refreshUserInfo();
          if (!fresh || fresh.vipStatus !== 'vip') {
            state.pendingConversion = true;
            openVip();
          }
        }
        throw new Error(result.message || '转换失败，请稍后重试');
      }
      const url = state.format === 'word' ? result.doc_url : result.pdf_url;
      if (!url) throw new Error('文档已生成，但没有收到下载地址');
      const label = state.format === 'word' ? 'Word DOCX' : 'PDF';
      el.resultText.textContent = `${label} 已生成，可以下载。`;
      el.downloadLink.href = url.replace(/^http:/, 'https:');
      el.downloadLink.textContent = `下载 ${label}`;
      el.downloadLink.setAttribute('download', '');
      el.result.classList.add('visible');
      showStatus('转换完成。', 'success');
      el.downloadLink.click();
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const sample = `# Markdown 转 Word 示例\n\nMarkdown2Word 可以保留常用的文档结构，并生成可编辑的 Word 文档。\n\n## 支持的内容\n\n- **加粗文字**和*强调文字*\n- 有序列表与无序列表\n- 代码块、引用和链接\n- Markdown 表格\n- LaTeX 公式：$E = mc^2$\n\n| 功能 | 输出结果 |\n| --- | --- |\n| 标题 | Word 标题样式 |\n| 表格 | 可编辑表格 |\n| 公式 | 数学公式 |\n\n> 正式交付前，建议在 Word 或 WPS 中复核最终文档。\n\n\`\`\`javascript\nconst message = 'Hello, Markdown2Word';\nconsole.log(message);\n\`\`\``;

  el.input.addEventListener('input', updatePreview);
  el.pasteButton.addEventListener('click', async () => {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      showStatus('当前浏览器无法直接读取剪贴板，请点击输入框后按 Ctrl+V。', 'error');
      el.input.focus();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        showStatus('剪贴板中没有可粘贴的文本。', 'error');
        return;
      }
      const start = el.input.selectionStart ?? el.input.value.length;
      const end = el.input.selectionEnd ?? start;
      el.input.setRangeText(text, start, end, 'end');
      updatePreview();
      showStatus('已粘贴剪贴板内容。');
      el.input.focus();
    } catch {
      showStatus('未获得剪贴板读取权限，请点击输入框后按 Ctrl+V。', 'error');
      el.input.focus();
    }
  });
  el.uploadButton.addEventListener('click', () => el.upload.click());
  el.upload.addEventListener('change', async () => {
    const file = el.upload.files && el.upload.files[0];
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) { showStatus('请选择 .md、.markdown 或 .txt 文件。', 'error'); return; }
    if (file.size > MAX_FILE_SIZE) { showStatus('文件不能超过 2 MB。', 'error'); return; }
    try {
      el.input.value = await file.text();
      updatePreview();
      showStatus(`已载入 ${file.name}`);
    } catch {
      showStatus('无法读取这个文件，请确认文件编码为 UTF-8。', 'error');
    } finally {
      el.upload.value = '';
    }
  });
  el.sampleButton.addEventListener('click', () => { el.input.value = sample; updatePreview(); showStatus('已载入示例内容。'); });
  el.clearButton.addEventListener('click', () => { el.input.value = ''; updatePreview(); el.result.classList.remove('visible'); showStatus('内容已清空。'); el.input.focus(); });
  el.formatButtons.forEach(button => button.addEventListener('click', () => {
    state.format = button.dataset.format;
    el.formatButtons.forEach(item => item.classList.toggle('active', item === button));
    setBusy(false);
  }));
  el.convertButton.addEventListener('click', startConversion);
  el.loginButton.addEventListener('click', () => {
    const loggedIn = state.user.userStatus === 'loggedIn' && state.user.userId;
    if (!loggedIn) openLogin(); else if (state.user.vipStatus !== 'vip') openVip(); else showStatus('当前账号为VIP会员。', 'success');
  });
  el.logoutButton.addEventListener('click', () => { clearUser(); showStatus('已退出登录。'); });
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => {
    const modal = button.closest('.modal');
    if (modal === el.loginModal) stopLoginPolling();
    closeModal(modal);
  }));
  el.paymentButton.addEventListener('click', async () => {
    el.paymentButton.disabled = true;
    el.paymentButton.textContent = '正在确认…';
    el.vipMessage.textContent = '正在刷新会员状态，请稍候…';
    const fresh = await refreshUserInfo(false);
    if (fresh && fresh.vipStatus === 'vip') {
      el.vipMessage.textContent = '会员状态已更新，正在继续转换。';
      el.vipMessage.className = 'modal-message success';
      setTimeout(() => { closeModal(el.vipModal); continueAfterAuthentication(); }, 650);
    } else {
      el.vipMessage.textContent = '暂未检测到VIP状态，请确认付款完成后稍后重试。';
      el.vipMessage.className = 'modal-message error';
      el.paymentButton.disabled = false;
      el.paymentButton.textContent = '再次确认支付状态';
    }
  });

  renderAccount();
  updatePreview();
  if (state.user.userStatus === 'loggedIn') refreshUserInfo(false);
})();
