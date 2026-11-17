/* =====================================================================
   5 Porquês (FOR 005-002) — comportamento do formulário + gravação
   ===================================================================== */
const { sb, toast, traduzErro, esc } = SST;
let perfil = null;

// ── Classificação ─────────────────────────────────────────────────
const SEV = [
  { cls: '',          label: '⚠ ACIDENTE GRAVE',             val: 'grave' },
  { cls: 'leve',      label: '⚠ ACIDENTE LEVE',              val: 'leve' },
  { cls: 'incidente', label: '⚠ INCIDENTE / QUASE ACIDENTE', val: 'incidente' }
];
let sevIdx = 0;
function setSeverity(v) {
  sevIdx = Math.max(0, SEV.findIndex(s => s.val === v));
  const b = document.getElementById('sev-band');
  b.className = 'severity-band ' + SEV[sevIdx].cls;
  b.innerHTML = SEV[sevIdx].label + '<span class="sev-hint">(clique para alternar)</span>';
  document.getElementById('sev-select').value = SEV[sevIdx].val;
  marcarSujo();
}
function cycleSeverity() { setSeverity(SEV[(sevIdx + 1) % SEV.length].val); }

// ── Cadeias (mesmo layout do formulário original) ─────────────────
let cadeiaCount = 0;

function novaCadeia(linhas) {
  cadeiaCount++;
  const id = 'cadeia-' + cadeiaCount;
  const n = cadeiaCount;
  const bloco = document.createElement('div');
  bloco.className = 'cadeia-bloco';
  bloco.id = id;
  bloco.dataset.n = n;
  bloco.innerHTML = `
    <div class="cadeia-head">
      <span class="cadeia-titulo">Cadeia ${String(n).padStart(2, '0')}</span>
      <div class="cadeia-head-btns">
        <button class="btn-cadeia btn-add-l" onclick="adicionarLinha('${id}', ${n}, false)">+ Linha</button>
        <button class="btn-cadeia btn-del-l" onclick="removerUltimaLinha('${id}', ${n})">— Linha</button>
        ${n > 1 ? `<button class="btn-cadeia btn-del-cadeia" onclick="removerCadeia('${id}')">✕ Cadeia</button>` : ''}
      </div>
    </div>
    <div class="grade-wrap">
      <div class="col-headers" id="${id}-headers"></div>
      <div id="${id}-linhas"></div>
    </div>`;
  document.getElementById('cadeias-container').appendChild(bloco);

  const hdrEl = document.getElementById(id + '-headers');
  const heads = ['Problema', '1° Porquê', '2° Porquê', '3° Porquê', '4° Porquê', '5° Porquê', '6° Porquê', 'Ação recomendada', 'Responsável', 'Prazo'];
  const hClasses = ['w-prob', 'w-pq', 'w-pq', 'w-pq', 'w-pq', 'w-pq', 'w-pq', 'w-acao', 'w-resp', 'w-prazo'];
  const recuo = n > 1 ? '98px' : '0';
  hdrEl.style.paddingLeft = recuo;
  for (let i = 0; i < heads.length; i++) {
    if (i === 0 && n > 1) continue;
    const d = document.createElement('div');
    d.className = 'col-head ' + hClasses[i];
    d.textContent = heads[i];
    hdrEl.appendChild(d);
  }
  document.getElementById(id + '-linhas').style.cssText = `padding-left:${recuo}`;

  const dados = (linhas && linhas.length) ? linhas : [{}];
  dados.forEach((l, i) => adicionarLinha(id, n, i === 0, l));
  if (!linhas) marcarSujo();
}

function adicionarLinha(cadeiaId, cadeiaNum, primeira, valores) {
  const container = document.getElementById(cadeiaId + '-linhas');
  const n = cadeiaNum || parseInt(cadeiaId.split('-')[1]);
  const v = valores || {};
  const linha = document.createElement('div');
  linha.className = 'grade-linha';

  if (n === 1) {
    const c = document.createElement('div');
    c.className = 'mcell w-prob';
    if (container.children.length === 0) {
      c.contentEditable = 'true';
      c.dataset.c = 'problema';
      c.textContent = v.problema || '';
    } else {
      c.contentEditable = 'false';
      c.style.cssText = 'background:transparent;border:none;pointer-events:none;';
    }
    linha.appendChild(c);
  }
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('div');
    c.className = 'mcell w-pq';
    c.contentEditable = 'true';
    c.dataset.c = 'pq';
    c.textContent = (v.pq && v.pq[i]) || '';
    linha.appendChild(c);
  }
  [['w-acao', 'acao'], ['w-resp', 'resp'], ['w-prazo', 'prazo']].forEach(([cls, k]) => {
    const c = document.createElement('div');
    c.className = 'mcell ' + cls;
    c.contentEditable = 'true';
    c.dataset.c = k;
    c.textContent = v[k] || '';
    linha.appendChild(c);
  });

  const x = document.createElement('button');
  x.className = 'btn-x-linha';
  x.textContent = 'X';
  x.title = 'Remover linha';
  const isPrimeiraDaCadeiaUm = (n === 1) && (container.children.length === 0);
  if (!isPrimeiraDaCadeiaUm) {
    x.onclick = () => {
      const linhas = container.querySelectorAll('.grade-linha');
      if (linhas.length > 1) { linha.remove(); marcarSujo(); }
      else mostrarAviso(document.getElementById(cadeiaId), 'A cadeia precisa de ao menos uma linha.');
    };
    linha.appendChild(x);
  }
  container.appendChild(linha);
  if (!valores) marcarSujo();
}

function mostrarAviso(bloco, msg) {
  if (bloco.querySelector('.aviso-inline')) return;
  const aviso = document.createElement('div');
  aviso.className = 'aviso-inline';
  aviso.style.cssText = 'margin:0 10px 8px;padding:6px 12px;background:#fff8e1;border:1px solid #f0c040;border-radius:4px;font-size:11px;color:#7a5c00;font-family:Arial,sans-serif;';
  aviso.textContent = msg;
  bloco.appendChild(aviso);
  setTimeout(() => aviso.remove(), 2500);
}

function removerCadeia(cadeiaId) {
  const bloco = document.getElementById(cadeiaId);
  if (!bloco) return;
  const existente = bloco.querySelector('.confirm-del');
  if (existente) { existente.remove(); return; }
  const painel = document.createElement('div');
  painel.className = 'confirm-del';
  painel.style.cssText = 'background:#fff3f3;border:1.5px solid #c0392b;border-radius:5px;padding:8px 14px;margin:0 10px 10px;display:flex;align-items:center;gap:12px;font-size:12px;font-family:Arial,sans-serif;';
  painel.innerHTML = `
    <span style="color:#7b1010;font-weight:bold;">Remover esta cadeia e todo o conteúdo?</span>
    <button class="sim" style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:4px 14px;cursor:pointer;font-weight:bold;font-family:Arial,sans-serif;font-size:12px;">Sim, remover</button>
    <button class="nao" style="background:#fff;color:#555;border:1px solid #ccc;border-radius:4px;padding:4px 12px;cursor:pointer;font-family:Arial,sans-serif;font-size:12px;">Cancelar</button>`;
  painel.querySelector('.sim').onclick = () => { bloco.remove(); marcarSujo(); };
  painel.querySelector('.nao').onclick = () => painel.remove();
  bloco.appendChild(painel);
}

function removerUltimaLinha(cadeiaId, n) {
  const container = document.getElementById(cadeiaId + '-linhas');
  const linhas = container.querySelectorAll('.grade-linha');
  if (linhas.length > 1) { linhas[linhas.length - 1].remove(); marcarSujo(); }
  else mostrarAviso(document.getElementById(cadeiaId),
    n === 1 ? 'A primeira linha da Cadeia 01 não pode ser removida.' : 'A cadeia precisa de ao menos uma linha.');
}

function lerCadeias() {
  return [...document.querySelectorAll('.cadeia-bloco')].map(b =>
    [...b.querySelectorAll('.grade-linha')].map(l => {
      const t = el => el ? el.innerText.replace(/\n$/, '').trim() : '';
      const o = { pq: [...l.querySelectorAll('[data-c=pq]')].map(t), acao: t(l.querySelector('[data-c=acao]')),
        resp: t(l.querySelector('[data-c=resp]')), prazo: t(l.querySelector('[data-c=prazo]')) };
      const p = l.querySelector('[data-c=problema]');
      if (p) o.problema = t(p);
      return o;
    }));
}

// ── Máscara de data ───────────────────────────────────────────────
function mascaraData(el) {
  el.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });
  el.addEventListener('blur', function () {
    const ok = !this.value || SST.dataISO(this.value);
    this.style.borderColor = ok ? '' : '#c0392b';
    this.title = ok ? '' : 'Data inválida';
  });
  el.addEventListener('focus', function () { this.style.borderColor = ''; this.title = ''; });
}

// ── Vínculo com NIAT ──────────────────────────────────────────────
let niats = [];
let paiTravado = false;   // true quando o 5 Porquês já nasceu (ou foi salvo) como filho de uma NIAT
async function carregarNiats(selecionado) {
  const [{ data, error }, { data: filhos }] = await Promise.all([
    sb.from('lista_relatorios').select('id,numero,envolvido,unidade,data_ocorrencia')
      .eq('tipo', 'niat').order('criado_em', { ascending: false }).limit(1000),
    sb.from('relatorios').select('niat_id').eq('tipo', '5pq').not('niat_id', 'is', null)
  ]);
  if (error) throw error;
  const comFilho = new Set((filhos || []).map(f => f.niat_id));
  // Só aparecem NIATs sem 5 Porquês (mais a NIAT pai deste relatório)
  niats = data.filter(r => r.id === selecionado || !comFilho.has(r.id));
  const sel = document.getElementById('niat-vinculo');
  sel.innerHTML = '<option value="">— sem vínculo —</option>' + niats.map(r =>
    `<option value="${r.id}">${esc(r.numero)}${r.envolvido ? ' · ' + esc(r.envolvido) : ''}</option>`).join('');
  if (selecionado) sel.value = selecionado;
  atualizarBotaoNiat();
}
function atualizarBotaoNiat() {
  const sel = document.getElementById('niat-vinculo');
  const v = sel.value;
  const b = document.getElementById('b-niat');
  b.hidden = !v;
  b.textContent = paiTravado ? '📝 Abrir NIAT (pai)' : '📝 Abrir NIAT';
  b.onclick = () => { location.href = `niat.html?id=${v}`; };
  sel.disabled = paiTravado;
  const resp = document.getElementById('responsavel');
  resp.disabled = paiTravado;
  resp.title = paiTravado ? 'O responsável é o mesmo da NIAT pai. Para trocar, altere na NIAT.' : 'Responsável: quem vai ver e editar este relatório';
  sel.title = paiTravado ? 'Relatório filho: a ligação com a NIAT pai não pode ser trocada.' : 'NIAT que deu origem a esta análise';
  const cab = document.getElementById('pai-cab');
  const op = sel.selectedOptions[0];
  cab.hidden = !(paiTravado && v);
  if (paiTravado && v && op) cab.querySelector('b').textContent = op.text.split(' · ')[0];
}
// Ao escolher a NIAT, traz os dados dela para os campos vazios
async function puxarDaNiat(id, sobrescrever) {
  if (!id) return;
  const { data } = await sb.from('relatorios').select('unidade,classificacao,dados,responsavel').eq('id', id).maybeSingle();
  if (!data) return;
  const resp = document.getElementById('responsavel');
  if (!resp.hidden) resp.value = data.responsavel;
  const c = (data.dados && data.dados.campos) || {};
  const alvo = {
    data_ocorrencia: c.data || '',
    envolvido: c.e1_nome || '',
    funcao: c.e1_funcao || '',
    fenomeno: c.descricao || ''
  };
  const form = document.getElementById('form');
  const atual = SST.lerCampos(form);
  const novo = {};
  for (const k in alvo) if (sobrescrever || !atual[k]) novo[k] = alvo[k];
  SST.escreverCampos(form, novo);
  const un = document.getElementById('unidade');
  if (!registro.id && data.unidade) un.value = data.unidade;
  else if (registro.id && data.unidade !== un.value) {
    toast('Essa NIAT é de outra unidade. Escolha uma NIAT da mesma unidade deste relatório.', 'erro', 6000);
    document.getElementById('niat-vinculo').value = ''; atualizarBotaoNiat(); return;
  }
  if (data.classificacao) setSeverity(data.classificacao);
  // Problema da cadeia 01 = O quê da NIAT, se estiver vazio
  const prob = document.querySelector('[data-c=problema]');
  if (prob && !prob.innerText.trim() && c.w_oque) prob.textContent = c.w_oque;
}

// ── Estado do registro ────────────────────────────────────────────
let registro = { id: null, numero: null };
let carregandoForm = false;
function marcarSujo() {
  if (carregandoForm) return;
  SST.alteracoes.sujo = true;
  const e = document.getElementById('estado');
  e.textContent = '● Alterações não salvas'; e.className = 'estado sujo';
}
function marcarLimpo(txt) {
  SST.alteracoes.sujo = false;
  const e = document.getElementById('estado');
  e.textContent = txt || ''; e.className = 'estado';
}
function mostrarNumero() {
  if (!registro.numero) return;
  const n = document.getElementById('num-doc');
  n.textContent = registro.numero; n.className = 'num-doc';
  document.getElementById('numero-cab').textContent = registro.numero;
  const un = document.getElementById('unidade');
  un.disabled = true;
  un.title = 'A unidade faz parte do número e não pode ser trocada depois de salvar.';
  document.title = registro.numero + ' — 5 Porquês';
}

async function salvar() {
  const b = document.getElementById('b-salvar');
  const campos = SST.lerCampos(document.getElementById('form'));
  campos.classificacao = document.getElementById('sev-select').value;
  if (!campos.unidade) { toast('Escolha a Unidade antes de salvar. Ela faz parte do número do relatório.', 'erro', 5000); document.getElementById('unidade').focus(); return; }
  if (campos.data_ocorrencia && !SST.dataISO(campos.data_ocorrencia)) { toast('A data da ocorrência está inválida. Use DD/MM/AAAA.', 'erro'); return; }
  const dados = { campos, cadeias: lerCadeias() };
  const linha = {
    classificacao: campos.classificacao,
    data_ocorrencia: SST.dataISO(campos.data_ocorrencia),
    envolvido: campos.envolvido || '',
    resumo: ((dados.cadeias[0] && dados.cadeias[0][0] && dados.cadeias[0][0].problema) || campos.fenomeno || '').slice(0, 300),
    situacao: document.getElementById('situacao').value,
    niat_id: document.getElementById('niat-vinculo').value || null,
    dados
  };
  const selResp = document.getElementById('responsavel');
  if (!selResp.hidden && !selResp.disabled) linha.responsavel = selResp.value;
  b.disabled = true; b.textContent = '⏳ Salvando…';
  try {
    if (!registro.id) {
      const { data, error } = await sb.from('relatorios')
        .insert({ ...linha, tipo: '5pq', unidade: campos.unidade }).select('id,numero,unidade,responsavel').single();
      if (error) throw error;
      registro = { id: data.id, numero: data.numero };
      document.getElementById('unidade').value = data.unidade;
      if (!selResp.hidden) selResp.value = data.responsavel;
      history.replaceState(null, '', `cincoporques.html?id=${data.id}`);
      mostrarNumero();
    } else {
      const { error } = await sb.from('relatorios').update(linha).eq('id', registro.id);
      if (error) throw error;
    }
    if (linha.niat_id && !paiTravado) { paiTravado = true; atualizarBotaoNiat(); }
    marcarLimpo('✔ Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    toast(`Relatório ${registro.numero} salvo.`, 'ok');
  } catch (e) {
    toast('Não foi possível salvar: ' + traduzErro(e), 'erro', 6000);
  } finally {
    b.disabled = false; b.textContent = '💾 Salvar';
  }
}

async function carregar(id) {
  const { data, error } = await sb.from('relatorios').select('*').eq('id', id).eq('tipo', '5pq').maybeSingle();
  if (error) throw error;
  if (!data) return false;
  registro = { id: data.id, numero: data.numero };
  const d = data.dados || {};
  carregandoForm = true;
  SST.escreverCampos(document.getElementById('form'), { ...(d.campos || {}), unidade: data.unidade });
  setSeverity(data.classificacao || (d.campos && d.campos.classificacao) || 'grave');
  document.getElementById('cadeias-container').innerHTML = '';
  cadeiaCount = 0;
  (d.cadeias && d.cadeias.length ? d.cadeias : [[{}]]).forEach(linhas => novaCadeia(linhas));
  document.getElementById('situacao').value = data.situacao;
  if (!document.getElementById('responsavel').hidden) document.getElementById('responsavel').value = data.responsavel;
  paiTravado = !!data.niat_id;
  await carregarNiats(data.niat_id);
  carregandoForm = false;
  mostrarNumero();
  marcarLimpo('Atualizado em ' + SST.dataHoraBR(data.atualizado_em));
  return true;
}

// ── Início ────────────────────────────────────────────────────────
(async function iniciar() {
  try { perfil = await SST.exigirLogin(); } catch (e) { return; }
  await SST.barra(perfil, '5pq');
  await SST.seletorResponsavel(perfil, document.getElementById('responsavel'));
  document.getElementById('responsavel').addEventListener('change', marcarSujo);
  await SST.preencherUnidades(document.getElementById('unidade'));
  ['data-ocorrencia', 'data-emissao-footer'].forEach(i => mascaraData(document.getElementById(i)));

  const form = document.getElementById('form');
  form.addEventListener('input', marcarSujo);
  form.addEventListener('change', marcarSujo);
  document.getElementById('situacao').addEventListener('change', marcarSujo);
  document.getElementById('niat-vinculo').addEventListener('change', async e => {
    atualizarBotaoNiat();
    await puxarDaNiat(e.target.value, false);
  });
  window.addEventListener('beforeunload', e => { if (SST.alteracoes.sujo) { e.preventDefault(); e.returnValue = ''; } });
  document.getElementById('b-salvar').onclick = salvar;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(); }
  });

  try {
    const id = SST.param('id');
    if (id) {
      if (!(await carregar(id))) {
        document.getElementById('carregando').innerHTML = '<div class="vazio"><div class="ic">🔒</div>Relatório não encontrado ou você não tem permissão para abri-lo.<br><br><a class="btn primario" href="relatorios.html">Ir para a lista</a></div>';
        return;
      }
    } else {
      carregandoForm = true;
      document.getElementById('data-emissao').textContent = SST.hojeBR();
      novaCadeia([{}]);
      setSeverity('grave');
      const niat = SST.param('niat');
      paiTravado = !!niat;
      await carregarNiats(niat);
      if (niat) await puxarDaNiat(niat, true);
      if (niat) document.getElementById('unidade').disabled = true;
      carregandoForm = false;
      marcarLimpo(niat ? 'Dados trazidos da NIAT — revise e salve' : 'Novo relatório — o número é gerado ao salvar');
      if (niat) SST.alteracoes.sujo = true;
    }
  } catch (e) {
    toast(traduzErro(e), 'erro', 6000);
  }
  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
})();
