(() => {
  'use strict';

  const API_BASE = 'https://seekservice-9gkeeztlfcb2a6d4-1301441002.ap-shanghai.app.tcloudbase.com';
  const PAYMENT_QR = 'https://7365-seekservice-9gkeeztlfcb2a6d4-1301441002.tcb.qcloud.la/mini-gotopay.png?sign=61cda63121f6df0be8f4d11caa43002a&t=1755240478';
  const STORAGE_KEY = 'markdown2word_user_v1';
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const TOOL_TYPE = document.body.dataset.converter === 'latex' ? 'latex' : 'markdown';
  const isLatexTool = TOOL_TYPE === 'latex';

  const state = {
    format: 'word',
    user: loadUser(),
    loginPoll: null,
    loginCountdown: null,
    pendingConversion: false,
    busy: false,
    downloadObjectUrl: ''
  };

  const el = {
    input: document.querySelector('#markdownInput, #latexInput'),
    preview: document.querySelector('#markdownPreview, #latexPreview'),
    charCount: document.querySelector('#charCount'),
    upload: document.querySelector('#markdownFile, #latexFile'),
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

  function hasMathDelimiters(source) {
    return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?)\}/.test(source);
  }

  function normalizeLatex(source) {
    let content = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    content = content
      .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^}]+\}\s*$/gm, '')
      .replace(/^\s*\\usepackage(?:\[[^\]]*\])?\{[^}]+\}\s*$/gm, '')
      .replace(/^\s*\\begin\{document\}\s*$/gm, '')
      .replace(/^\s*\\end\{document\}\s*$/gm, '')
      .replace(/\\section\*?\{([^}]+)\}/g, '# $1')
      .replace(/\\subsection\*?\{([^}]+)\}/g, '## $1')
      .replace(/\\subsubsection\*?\{([^}]+)\}/g, '### $1')
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => `$$\n${formula.trim()}\n$$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => `$${formula.trim()}$`)
      .replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, formula) => `$$\n${formula.trim()}\n$$`)
      .replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (_, formula) => `$$\n\\begin{aligned}\n${formula.trim()}\n\\end{aligned}\n$$`)
      .replace(/\\begin\{gather\*?\}([\s\S]*?)\\end\{gather\*?\}/g, (_, formula) => `$$\n\\begin{gathered}\n${formula.trim()}\n\\end{gathered}\n$$`)
      .replace(/\\begin\{multline\*?\}([\s\S]*?)\\end\{multline\*?\}/g, (_, formula) => `$$\n${formula.trim()}\n$$`)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (content && !hasMathDelimiters(content)) content = `$$\n${content}\n$$`;
    return content;
  }

  function renderLatex(source) {
    if (!source.trim()) {
      el.preview.innerHTML = '<div class="preview-empty">在左侧输入 LaTeX，公式预览会显示在这里。</div>';
      return;
    }
    const content = normalizeLatex(source);
    el.preview.textContent = content;
    if (typeof window.renderMathInElement !== 'function') {
      el.preview.innerHTML = '<div class="preview-empty">公式预览组件加载失败，但仍可尝试转换。</div>';
      return;
    }
    let errorCount = 0;
    window.renderMathInElement(el.preview, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false,
      trust: false,
      strict: 'warn',
      errorCallback: () => { errorCount += 1; }
    });
    if (errorCount) {
      const note = document.createElement('div');
      note.className = 'latex-preview-note error';
      note.textContent = '部分语法无法完整预览，你仍然可以尝试转换为 Word';
      el.preview.prepend(note);
    }
  }

  let previewTimer;
  function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const content = el.input.value;
      if (isLatexTool) renderLatex(content);
      else el.preview.innerHTML = renderMarkdown(content);
      el.charCount.textContent = `${content.length.toLocaleString('zh-CN')} 字符`;
    }, isLatexTool ? 150 : 80);
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
      showStatus(`请先输入或上传 ${isLatexTool ? 'LaTeX' : 'Markdown'} 内容。`, 'error');
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

  async function prepareDownload(url, fileName) {
    const secureUrl = url.replace(/^http:/, 'https:');
    if (state.downloadObjectUrl) {
      URL.revokeObjectURL(state.downloadObjectUrl);
      state.downloadObjectUrl = '';
    }
    el.downloadLink.href = secureUrl;
    el.downloadLink.setAttribute('download', fileName);
    try {
      const response = await fetch(secureUrl);
      if (!response.ok) throw new Error('文件读取失败');
      const blob = await response.blob();
      state.downloadObjectUrl = URL.createObjectURL(blob);
      el.downloadLink.href = state.downloadObjectUrl;
    } catch {
      // Keep the original URL as a fallback when the file host blocks CORS.
    }
  }

  async function performConversion() {
    setBusy(true);
    el.result.classList.remove('visible');
    showStatus('正在排版并生成文档，请稍候…');
    try {
      const endpoint = state.format === 'word' ? 'pc2word' : 'pc2pdf';
      const result = await request(endpoint, {
        content: isLatexTool ? normalizeLatex(el.input.value) : el.input.value,
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
      const extension = state.format === 'word' ? 'docx' : 'pdf';
      const fileName = `${isLatexTool ? 'latex2word' : 'markdown2word'}-${Date.now()}.${extension}`;
      await prepareDownload(url, fileName);
      el.resultText.textContent = `${label} 已生成，可以下载。`;
      el.downloadLink.textContent = `下载 ${label}`;
      el.result.classList.add('visible');
      showStatus('转换完成。', 'success');
      el.downloadLink.click();
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const markdownSample = `# AI 生成 Markdown 转 Word 示例\n\n这份示例模拟 AI 生成的技术内容，并测试普通转换器容易遗漏的复杂元素。\n\n## 表格内 LaTeX 公式\n\n| 模型 | 损失函数 | 梯度 |\n| --- | --- | --- |\n| 线性回归 | $L(\\\\theta)=\\\\frac{1}{n}\\\\sum_{i=1}^{n}(y_i-\\\\hat{y}_i)^2$ | $\\\\nabla_{\\\\theta}L$ |\n| 正则化 | $L_2=\\\\lambda\\\\lVert\\\\mathbf{w}\\\\rVert_2^2$ | $\\\\frac{\\\\partial L}{\\\\partial w_j}$ |\n\n## 下划线与多行公式\n\n$$\n\\\\begin{aligned}\nx_{train} &= [x_1,x_2,\\\\ldots,x_n] \\\\\\\\ny_{pred} &= f_{\\\\theta}(x_{train})\n\\\\end{aligned}\n$$\n\n## Mermaid 图表\n\n\`\`\`mermaid\nflowchart LR\n  AI[AI 生成 Markdown] --> Parse[结构解析]\n  Parse --> Formula[LaTeX 公式]\n  Parse --> Vector[SVG 图片]\n  Formula --> DOCX[可编辑 Word]\n  Vector --> DOCX\n\`\`\`\n\n## SVG 图片\n\n![SVG 架构图](https://www.w3.org/Icons/SVG/svg-logo.svg)\n\n> 导出阶段会进一步处理复杂公式、图表与矢量资源。`;
  const latexSample = `\\section{常用数学公式}\n\n二次方程的求根公式为：\n\n\\[\n x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n\\]\n\n欧拉公式为 $e^{i\\pi}+1=0$。\n\n\\begin{equation}\n \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}\n\\end{equation}`;
  const sample = isLatexTool ? latexSample : markdownSample;

  el.input.addEventListener('input', updatePreview);
  el.input.addEventListener('keydown', event => {
    if (!isLatexTool || event.key !== 'Tab') return;
    event.preventDefault();
    const start = el.input.selectionStart;
    const end = el.input.selectionEnd;
    el.input.setRangeText('  ', start, end, 'end');
    updatePreview();
  });
  document.querySelectorAll('[data-latex-insert]').forEach(button => button.addEventListener('click', () => {
    const snippet = button.dataset.latexInsert || '';
    const start = el.input.selectionStart ?? el.input.value.length;
    const end = el.input.selectionEnd ?? start;
    const selected = el.input.value.slice(start, end);
    const inserted = selected && snippet.includes('{}') ? snippet.replace('{}', `{${selected}}`) : snippet;
    el.input.setRangeText(inserted, start, end, 'end');
    if (!selected) {
      const placeholder = inserted.indexOf('{}');
      if (placeholder >= 0) el.input.setSelectionRange(start + placeholder + 1, start + placeholder + 1);
    }
    updatePreview();
    el.input.focus();
  }));
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
    const allowedFile = isLatexTool ? /\.(tex|latex|txt)$/i : /\.(md|markdown|txt)$/i;
    if (!allowedFile.test(file.name)) {
      showStatus(`请选择 ${isLatexTool ? '.tex、.latex 或 .txt' : '.md、.markdown 或 .txt'} 文件。`, 'error');
      return;
    }
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
  el.logoutButton.addEventListener('click', () => {
    if (!window.confirm('确定要退出当前账号吗？')) return;
    clearUser();
    showStatus('已退出登录。');
  });
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
  window.addEventListener('pagehide', () => {
    if (state.downloadObjectUrl) URL.revokeObjectURL(state.downloadObjectUrl);
  });
})();
