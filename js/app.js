/* =====================================================================
   Sistema SST — DB Agronegócios
   Núcleo comum: conexão, login, barra superior, avisos e utilitários.
   ===================================================================== */
(function () {
  const cfg = window.SST_CONFIG || {};
  const sb = window.supabase.createClient(cfg.url, cfg.chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const CLASSIF = {
    grave:     { rotulo: 'Acidente Grave', curto: 'Grave' },
    leve:      { rotulo: 'Acidente Leve', curto: 'Leve' },
    incidente: { rotulo: 'Incidente / Quase Acidente', curto: 'Incidente' }
  };
  const TIPOS = {
    niat: { rotulo: 'NIAT — Investigação', curto: 'NIAT', pagina: 'niat.html', cod: 'FOR 005-001' },
    '5pq': { rotulo: '5 Porquês', curto: '5 Porquês', pagina: 'cincoporques.html', cod: 'FOR 005-002' }
  };

  // ── Utilitários ───────────────────────────────────────────────────
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function hojeBR() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  // "10/11/2026", "10/11/26", "10-11-2026", "2026-11-10" → "2026-11-10" (ou null)
  function dataISO(txt) {
    if (!txt) return null;
    const t = String(txt).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/(\d{1,2})\s*[\/\.\-]\s*(\d{1,2})\s*[\/\.\-]\s*(\d{2,4})/);
    if (!m) return null;
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(+y, +mo - 1, +d);
    if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function dataBR(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }
  function dataHoraBR(iso) {
    if (!iso) return '';
    const d = new Date(iso), p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function iniciais(nome) {
    const p = String(nome || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }
  function param(nome) { return new URLSearchParams(location.search).get(nome); }

  function traduzErro(e) {
    const msg = (e && (e.message || e.error_description || e.msg)) || String(e || 'Erro desconhecido');
    const mapa = [
      [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/Email not confirmed/i, 'Seu e-mail ainda não foi confirmado. Abra o link enviado para o seu e-mail.'],
      [/User already registered/i, 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".'],
      [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/rate limit|too many/i, 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'],
      [/row-level security|permission denied/i, 'Você não tem permissão para esta ação.'],
      [/Failed to fetch|NetworkError/i, 'Sem conexão com o servidor. Verifique a internet.'],
      [/invalid.*email|Unable to validate email/i, 'E-mail inválido.']
    ];
    for (const [re, t] of mapa) if (re.test(msg)) return t;
    return msg;
  }

  // ── Avisos ────────────────────────────────────────────────────────
  function toast(msg, tipo = '', ms = 3500) {
    let box = document.getElementById('sst-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'sst-toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + tipo;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ── Sessão e perfil ───────────────────────────────────────────────
  async function sessao() {
    const { data } = await sb.auth.getSession();
    return data.session;
  }
  async function perfilAtual() {
    const s = await sessao();
    if (!s) return null;
    const { data, error } = await sb.from('perfis').select('*').eq('id', s.user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  // Usa nas páginas internas: sem login (ou não aprovado) volta para o início
  async function exigirLogin(opcoes = {}) {
    let perfil = null;
    try { perfil = await perfilAtual(); } catch (e) { /* trata abaixo */ }
    if (!perfil || perfil.situacao !== 'ativo') { location.replace('index.html'); throw new Error('sem login'); }
    if (opcoes.admin && perfil.papel !== 'admin') { location.replace('index.html'); throw new Error('sem permissão'); }
    return perfil;
  }

  async function sair() {
    await sb.auth.signOut();
    location.href = 'index.html';
  }

  // ── Barra superior ────────────────────────────────────────────────
  async function barra(perfil, ativo) {
    const el = document.getElementById('sst-appbar') || (() => {
      const d = document.createElement('header'); d.id = 'sst-appbar'; document.body.prepend(d); return d;
    })();
    el.className = 'sst-appbar';
    const admin = perfil.papel === 'admin';
    const links = [
      ['inicio', 'index.html', '🏠', 'Início'],
      ['niat', 'niat.html', '📝', 'Nova NIAT'],
      ['5pq', 'cincoporques.html', '❓', 'Novo 5 Porquês'],
      ['lista', 'relatorios.html', '📂', 'Relatórios']
    ];
    if (admin) links.push(['usuarios', 'usuarios.html', '👥', 'Usuários']);
    el.innerHTML = `
      <a class="marca" href="index.html">
        <img src="img/logo-db.png" alt="DB Agronegócios">
        <span><b>Sistema SST</b><small>Segurança do Trabalho</small></span>
      </a>
      <nav>${links.map(([k, href, ic, t]) =>
        `<a href="${href}" class="${k === ativo ? 'ativo' : ''}" data-k="${k}">${ic} ${t}${k === 'usuarios' ? '<span class="badge" id="badge-pend" hidden></span>' : ''}</a>`).join('')}
      </nav>
      <div class="usuario">
        <div class="nome-bloco" style="text-align:right">
          <div>${esc(perfil.nome || perfil.email)}</div>
          <div class="papel">${admin ? 'Administrador' : 'Usuário padrão'}</div>
        </div>
        <div class="avatar" title="${esc(perfil.email)}">${esc(iniciais(perfil.nome || perfil.email))}</div>
        <button class="sair" type="button">Sair</button>
      </div>`;
    el.querySelector('button.sair').onclick = sair;
    if (admin) {
      const { count } = await sb.from('perfis').select('id', { count: 'exact', head: true }).eq('situacao', 'pendente');
      const b = document.getElementById('badge-pend');
      if (b && count) { b.textContent = count; b.hidden = false; }
    }
  }

  // ── Unidades ──────────────────────────────────────────────────────
  let _unidades = null;
  async function unidades() {
    if (_unidades) return _unidades;
    const { data, error } = await sb.from('unidades').select('*').eq('ativa', true).order('ordem');
    if (error) throw error;
    _unidades = data;
    return data;
  }
  async function preencherUnidades(select, valor) {
    const lista = await unidades();
    select.innerHTML = '<option value="">— selecione —</option>' +
      lista.map(u => `<option value="${esc(u.sigla)}">${esc(u.nome)}</option>`).join('');
    if (valor) select.value = valor;
  }
  // Relatórios antigos guardavam o nome; converte para a sigla
  async function siglaDe(nomeOuSigla) {
    if (!nomeOuSigla) return '';
    const l = await unidades();
    const u = l.find(x => x.sigla === nomeOuSigla || x.nome.toLowerCase() === String(nomeOuSigla).toLowerCase());
    return u ? u.sigla : '';
  }

  // ── Fotos ─────────────────────────────────────────────────────────
  // Reduz a foto (máx. 1600 px, JPEG) antes de enviar — economiza espaço gratuito
  function comprimirImagem(arquivo, max = 1600, qualidade = 0.78) {
    return new Promise((ok, erro) => {
      const img = new Image();
      const url = URL.createObjectURL(arquivo);
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > max || h > max) { const f = max / Math.max(w, h); w = Math.round(w * f); h = Math.round(h * f); }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? ok(b) : erro(new Error('Falha ao processar a foto')), 'image/jpeg', qualidade);
      };
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Arquivo de imagem inválido')); };
      img.src = url;
    });
  }
  async function urlsFotos(caminhos) {
    if (!caminhos.length) return {};
    const { data, error } = await sb.storage.from('fotos').createSignedUrls(caminhos, 60 * 60);
    if (error) throw error;
    const m = {};
    data.forEach(d => { if (d.signedUrl) m[d.path] = d.signedUrl; });
    return m;
  }

  // ── Campos genéricos dos formulários (data-f) ─────────────────────
  function lerCampos(raiz) {
    const o = {};
    raiz.querySelectorAll('[data-f]').forEach(el => {
      const k = el.dataset.f;
      if (el.type === 'checkbox') o[k] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[k] = el.value; else if (!(k in o)) o[k] = ''; }
      else if ('value' in el && el.tagName !== 'DIV' && el.tagName !== 'SPAN') o[k] = el.value;
      else o[k] = el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    });
    return o;
  }
  function escreverCampos(raiz, dados) {
    raiz.querySelectorAll('[data-f]').forEach(el => {
      const k = el.dataset.f;
      if (!(k in dados)) return;
      const v = dados[k];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = (el.value === v);
      else if ('value' in el && el.tagName !== 'DIV' && el.tagName !== 'SPAN') el.value = v ?? '';
      else el.textContent = v ?? '';
    });
  }

  // ── Controle de alterações não salvas ─────────────────────────────
  const alteracoes = {
    sujo: false,
    vigiar(raiz, aoMudar) {
      const marcar = () => { if (!this.sujo) { this.sujo = true; aoMudar && aoMudar(true); } };
      raiz.addEventListener('input', marcar);
      raiz.addEventListener('change', marcar);
      window.addEventListener('beforeunload', e => { if (this.sujo) { e.preventDefault(); e.returnValue = ''; } });
    },
    limpar(aoMudar) { this.sujo = false; aoMudar && aoMudar(false); }
  };

  window.SST = {
    sb, CLASSIF, TIPOS, esc, hojeBR, dataISO, dataBR, dataHoraBR, iniciais, primeiroNome, param,
    traduzErro, toast, sessao, perfilAtual, exigirLogin, sair, barra, unidades, preencherUnidades,
    siglaDe, comprimirImagem, urlsFotos, lerCampos, escreverCampos, alteracoes
  };
})();
