/* =====================================================================
   NIAT (FOR 005-001) — comportamento do formulário + gravação no banco
   ===================================================================== */
const { sb, toast, traduzErro, esc } = SST;
let perfil = null;

// ── Classificação (mantém o comportamento original) ───────────────
const severities = [
  { cls: '',          band: SST.ic('triangle-alert') + ' ACIDENTE GRAVE',             val: 'grave' },
  { cls: 'leve',      band: SST.ic('triangle-alert') + ' ACIDENTE LEVE',              val: 'leve' },
  { cls: 'incidente', band: SST.ic('triangle-alert') + ' INCIDENTE / QUASE ACIDENTE', val: 'incidente' }
];
let sevIdx = 0;
function setSeverity(val) {
  sevIdx = Math.max(0, severities.findIndex(s => s.val === val));
  const s = severities[sevIdx];
  const band = document.getElementById('sev-band');
  band.className = 'severity-band ' + s.cls;
  band.innerHTML = s.band + '<span class="sev-hint">(clique para alternar classificação)</span>';
  document.getElementById('sev-select').value = s.val;
  const sel1 = document.getElementById('class-secao1');
  if (sel1) sel1.value = s.val;
  marcarSujo();
}
function setSeverityByLabel(val) { setSeverity(val); }
function cycleSeverity() { setSeverity(severities[(sevIdx + 1) % severities.length].val); }

// ── Plano de ação (cada ação tem id, prazo e status) ──────────────
let rowCount = 0;
function addRow(acao = {}) {
  const tbody = document.getElementById('action-tbody');
  const tr = document.createElement('tr');
  const rn = rowCount++;
  tr.dataset.id = acao.id || SST.novoId();
  if (acao.concluida_em) tr.dataset.concluida = acao.concluida_em;
  if (acao.criado_por_nome) { tr.dataset.criadoPor = acao.criado_por_nome; tr.dataset.criadoEm = acao.criado_em || ''; }
  tr.innerHTML = `
    <td><div class="cell-val" contenteditable="true" data-a="oque"></div></td>
    <td><div class="cell-val" contenteditable="true" data-a="quem"></div></td>
    <td><input class="cell-in" data-a="quando" placeholder="DD/MM/AAAA" maxlength="13"></td>
    <td><select class="cell-status" data-a="status">${SST.opcoesStatus(acao.status)}</select><span class="concl"></span></td>
    <td><div style="display:flex;gap:12px;padding:6px 8px;align-items:center;font-size:12px">
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="rep${rn}" value="Sim"> Sim</label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="rep${rn}" value="Não"> Não</label>
    </div></td>
    <td class="col-x"><button type="button" class="btn-x" title="Remover linha" aria-label="Remover linha">${SST.ic('trash-2', 14)}</button></td>`;
  tr.querySelector('[data-a=oque]').textContent = acao.oque || '';
  tr.querySelector('[data-a=quem]').textContent = acao.quem || '';
  const q = tr.querySelector('[data-a=quando]');
  q.value = acao.quando || '';
  q.addEventListener('input', function () {
    if (/[a-z]/i.test(this.value)) return;   // texto antigo (ex.: "imediatamente") fica como está
    let v = this.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });
  tr.querySelectorAll('input[type=radio]').forEach(r => r.checked = (r.value === acao.replicar));
  const st = tr.querySelector('[data-a=status]');
  const atualizar = () => {
    const a = SST.ajustarConclusao({ status: st.value, concluida_em: tr.dataset.concluida, quando: q.value });
    if (a.concluida_em) tr.dataset.concluida = a.concluida_em; else delete tr.dataset.concluida;
    tr.className = 'st-' + SST.situacaoAcao(a);
    tr.querySelector('.concl').textContent = a.concluida_em ? `concluída em ${SST.dataBR(a.concluida_em)}` : '';
  };
  st.addEventListener('change', atualizar);
  q.addEventListener('change', atualizar);
  atualizar();
  tr.querySelector('.btn-x').onclick = () => {
    const temTexto = [...tr.querySelectorAll('.cell-val')].some(c => c.innerText.trim());
    if (temTexto && !confirm('Remover esta ação do plano?')) return;
    tr.remove(); marcarSujo();
  };
  tbody.appendChild(tr);
  if (arguments.length === 0) marcarSujo();
}
function lerAcoes() {
  return [...document.querySelectorAll('#action-tbody tr')].map(tr => {
    const a = {
      id: tr.dataset.id,
      oque: tr.querySelector('[data-a=oque]').innerText.trim(),
      quem: tr.querySelector('[data-a=quem]').innerText.trim(),
      quando: tr.querySelector('[data-a=quando]').value.trim(),
      status: tr.querySelector('[data-a=status]').value,
      replicar: (tr.querySelector('input[type=radio]:checked') || {}).value || ''
    };
    if (tr.dataset.concluida) a.concluida_em = tr.dataset.concluida;
    if (tr.dataset.criadoPor) { a.criado_por_nome = tr.dataset.criadoPor; a.criado_em = tr.dataset.criadoEm; }
    else if (a.oque && perfil) { a.criado_por_nome = perfil.nome; a.criado_em = SST.hojeISO(); tr.dataset.criadoPor = a.criado_por_nome; tr.dataset.criadoEm = a.criado_em; }
    return SST.ajustarConclusao(a);
  }).filter(a => a.oque || a.quem || a.quando || a.replicar || a.status !== 'pendente');
}

// ── Ishikawa (lista vem do banco; o Administrador edita) ──────────
// Cada marcação é guardada com o id e o texto do item (e o nome do grupo),
// assim o relatório continua igual mesmo se a lista mudar depois.
let catalogo = [];
function desenharIshikawa() {
  const grid = document.getElementById('ishi-grid');
  grid.innerHTML = catalogo.map(g => `
    <div class="ishi-m" data-g="${g.id}" data-gn="${esc(g.nome)}" data-chave="${esc(g.chave || '')}">
      <div class="ishi-m-header">${SST.ic(SST.iconeGrupo(g))}<span>${esc(g.nome)}</span></div>
      <div class="ishi-m-body">${g.itens.map(it =>
        `<label class="ishi-option"><input type="checkbox" data-i="${it.id}"> ${esc(it.texto)}</label>`).join('')}</div>
    </div>`).join('');
  const n = catalogo.length;
  document.getElementById('ishi-titulo').textContent =
    `6. Diagrama de Ishikawa — Análise de Causas${n === 6 ? ' (6Ms)' : ''}`;
}
function textoOpcao(cb) { return cb.parentElement.textContent.trim(); }
function lerIshikawa() {
  return [...document.querySelectorAll('#ishi-grid input[type=checkbox]:checked')].map(cb => {
    const g = cb.closest('.ishi-m');
    return { g: g.dataset.g || null, gn: g.dataset.gn, i: cb.dataset.i || null, t: textoOpcao(cb) };
  });
}
// Item que não está mais na lista: aparece marcado, em itálico, só neste relatório
function opcaoAntiga(grupoEl, texto) {
  const l = document.createElement('label');
  l.className = 'ishi-option removido';
  l.title = 'Item que não está mais na lista atual (mantido neste relatório)';
  l.innerHTML = `<input type="checkbox" checked> ${esc(texto)}`;
  grupoEl.querySelector('.ishi-m-body').appendChild(l);
}
function grupoAntigo(nome) {
  const grid = document.getElementById('ishi-grid');
  let el = [...grid.querySelectorAll('.ishi-m')].find(x => x.dataset.gn === nome && !x.dataset.g);
  if (!el) {
    el = document.createElement('div');
    el.className = 'ishi-m';
    el.dataset.gn = nome;
    el.innerHTML = `<div class="ishi-m-header">${esc(nome)}</div><div class="ishi-m-body"></div>`;
    grid.appendChild(el);
  }
  return el;
}
function escreverIshikawa(dados) {
  desenharIshikawa();
  if (!dados) return;
  const grid = document.getElementById('ishi-grid');
  const porId = id => grid.querySelector(`input[data-i="${id}"]`);
  const marcar = (grupoEl, texto) => {
    const cb = [...grupoEl.querySelectorAll('input[type=checkbox]')].find(c => textoOpcao(c).toLowerCase() === texto.toLowerCase());
    if (cb) cb.checked = true; else opcaoAntiga(grupoEl, texto);
  };
  if (Array.isArray(dados)) {
    dados.forEach(m => {
      const cb = m.i && porId(m.i);
      if (cb) { cb.checked = true; return; }
      const g = (m.g && grid.querySelector(`.ishi-m[data-g="${m.g}"]`)) || grupoAntigo(m.gn || 'Outros');
      marcar(g, m.t);
    });
  } else {
    // formato antigo: { mao_de_obra: ['texto', ...], ... }
    Object.entries(dados).forEach(([chave, textos]) => (textos || []).forEach(t => {
      const g = grid.querySelector(`.ishi-m[data-chave="${chave}"]`) || grupoAntigo(chave.replace(/_/g, ' '));
      marcar(g, t);
    }));
  }
}

// ── Fotos ─────────────────────────────────────────────────────────
// fotos = [{ caminho?, blob?, url, legenda }] ; removidas = [caminho]
let fotos = [];
let fotosRemovidas = [];
function desenharFotos() {
  const container = document.getElementById('fotos-container');
  container.innerHTML = '';
  fotos.forEach((f, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;';
    if (!f.caminho) wrap.className = 'foto-nova';
    const img = document.createElement('img');
    img.src = f.url;
    img.style.cssText = 'width:160px;height:120px;object-fit:cover;border-radius:4px;border:1px solid #ddd;display:block;cursor:zoom-in';
    img.onclick = () => window.open(f.url, '_blank');
    const caption = document.createElement('div');
    caption.contentEditable = 'true';
    caption.style.cssText = 'font-size:10px;color:#555;text-align:center;margin-top:3px;font-family:Arial,sans-serif;outline:none;border-bottom:1px solid #ddd;min-width:160px;max-width:160px;min-height:14px';
    caption.textContent = f.legenda || '';
    caption.oninput = () => { f.legenda = caption.innerText.trim(); };
    const btn = document.createElement('button');
    btn.className = 'foto-x';
    btn.type = 'button';
    btn.innerHTML = SST.ic('x', 12);
    btn.title = 'Remover foto';
    btn.style.cssText = 'position:absolute;top:3px;right:3px;background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:10px;cursor:pointer;line-height:1;padding:0;font-family:Arial,sans-serif;';
    btn.onclick = () => {
      if (!confirm('Remover esta foto?')) return;
      if (f.caminho) fotosRemovidas.push(f.caminho);
      fotos.splice(i, 1); desenharFotos(); marcarSujo();
    };
    wrap.append(img, caption, btn);
    container.appendChild(wrap);
  });
}
async function adicionarFotos(input) {
  const arquivos = Array.from(input.files);
  input.value = '';
  for (const arq of arquivos) {
    try {
      const blob = await SST.comprimirImagem(arq);
      fotos.push({ blob, url: URL.createObjectURL(blob), legenda: '' });
    } catch (e) { toast(`Não foi possível usar a foto ${arq.name}.`, 'erro'); }
  }
  desenharFotos(); marcarSujo();
  if (!registro.id) toast('As fotos serão enviadas quando você salvar.', '', 3000);
}
async function enviarFotos(id) {
  for (const f of fotos) {
    if (f.caminho || !f.blob) continue;
    const caminho = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('fotos').upload(caminho, f.blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    f.caminho = caminho; delete f.blob;
  }
  if (fotosRemovidas.length) {
    await sb.storage.from('fotos').remove(fotosRemovidas);
    fotosRemovidas = [];
  }
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
}

// ── Estado do registro ────────────────────────────────────────────
let registro = { id: null, numero: null };
let carregandoForm = false;
function marcarSujo() {
  if (carregandoForm) return;
  SST.alteracoes.sujo = true;
  const e = document.getElementById('estado');
  e.textContent = 'Alterações não salvas'; e.className = 'estado sujo';
}
function marcarLimpo(txt) {
  SST.alteracoes.sujo = false;
  const e = document.getElementById('estado');
  e.textContent = txt || ''; e.className = 'estado';
}
function mostrarHistorico() {
  const b = document.getElementById('b-hist');
  b.hidden = !(perfil && perfil.papel === 'admin' && registro.id);
  b.onclick = () => window.open(`historico.html?registro=${registro.id}`, '_blank');
}
function mostrarNumero() {
  mostrarHistorico();
  const n = document.getElementById('num-doc');
  if (registro.numero) {
    n.textContent = registro.numero; n.className = 'num-doc';
    document.getElementById('numero').value = registro.numero;
    document.getElementById('numero').placeholder = '';
    document.getElementById('unidade').disabled = true;
    document.getElementById('unidade').title = 'A unidade faz parte do número e não pode ser trocada depois de salvar.';
    atualizarFilho();
    document.title = registro.numero + ' — NIAT';
  }
}

function coletar() {
  const campos = SST.lerCampos(document.getElementById('form'));
  return {
    campos,
    ishikawa: lerIshikawa(),
    acoes: lerAcoes(),
    fotos: fotos.filter(f => f.caminho).map(f => ({ caminho: f.caminho, legenda: f.legenda || '' }))
  };
}

async function salvar() {
  const b = document.getElementById('b-salvar');
  const dados = coletar();
  const c = dados.campos;
  if (!c.unidade) { toast('Escolha a Unidade / Complexo antes de salvar. Ela faz parte do número do relatório.', 'erro', 5000); document.getElementById('unidade').focus(); return false; }
  if (c.data && !SST.dataISO(c.data)) { toast('A data da ocorrência está inválida. Use DD/MM/AAAA.', 'erro'); return false; }
  b.disabled = true; b.innerHTML = SST.ic('loader-circle') + '<span>Salvando…</span>';
  try {
    const linha = {
      classificacao: c.classificacao || null,
      data_ocorrencia: SST.dataISO(c.data),
      envolvido: [c.e1_nome, c.e2_nome].filter(Boolean).join(' / '),
      resumo: (c.w_oque || c.descricao || '').slice(0, 300),
      situacao: document.getElementById('situacao').value
    };
    const numDigitado = document.getElementById('numero').value.trim().toUpperCase();
    const selResp = document.getElementById('responsavel');
    if (!selResp.hidden && !selResp.disabled) linha.responsavel = selResp.value;
    if (!registro.id) {
      const { data, error } = await sb.from('relatorios')
        .insert({ ...linha, tipo: 'niat', unidade: c.unidade, dados, ...(numDigitado ? { numero: numDigitado } : {}) })
        .select('id,numero').single();
      if (error) throw error;
      registro = data;
      history.replaceState(null, '', `niat.html?id=${data.id}`);
      mostrarNumero();
    }
    await enviarFotos(registro.id);
    const dadosFinais = coletar();
    const mudouNumero = numDigitado && numDigitado !== registro.numero;
    const { data: atual, error } = await sb.from('relatorios')
      .update({ ...linha, dados: dadosFinais, ...(mudouNumero ? { numero: numDigitado } : {}) })
      .eq('id', registro.id).select('numero').single();
    if (error) throw error;
    registro.numero = atual.numero; mostrarNumero();
    desenharFotos();
    marcarLimpo('Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    const resp = document.getElementById('responsavel');
    const outro = !resp.hidden && resp.value !== perfil.id;
    toast(`Relatório ${registro.numero} salvo.` + (outro ? ` Responsável: ${resp.selectedOptions[0].text}.` : ''), 'ok', outro ? 5000 : 3500);
    return true;
  } catch (e) {
    toast('Não foi possível salvar: ' + traduzErro(e), 'erro', 6000);
    return false;
  } finally {
    b.disabled = false; b.innerHTML = SST.ic('save') + '<span>Salvar</span>';
  }
}

async function carregar(id) {
  const { data, error } = await sb.from('relatorios').select('*').eq('id', id).eq('tipo', 'niat').maybeSingle();
  if (error) throw error;
  if (!data) return false;
  registro = { id: data.id, numero: data.numero };
  const d = data.dados || {};
  const campos = { ...(d.campos || {}), unidade: data.unidade };
  carregandoForm = true;
  SST.escreverCampos(document.getElementById('form'), campos);
  setSeverity(campos.classificacao || data.classificacao || 'grave');
  escreverIshikawa(d.ishikawa);
  document.getElementById('action-tbody').innerHTML = '';
  (d.acoes && d.acoes.length ? d.acoes : [{}, {}]).forEach(a => addRow(a));
  document.getElementById('situacao').value = data.situacao;
  if (!document.getElementById('responsavel').hidden) document.getElementById('responsavel').value = data.responsavel;
  const caminhos = (d.fotos || []).map(f => f.caminho);
  const urls = await SST.urlsFotos(caminhos).catch(() => ({}));
  fotos = (d.fotos || []).map(f => ({ ...f, url: urls[f.caminho] || '' }));
  desenharFotos();
  carregandoForm = false;
  mostrarNumero();
  marcarLimpo('Atualizado em ' + SST.dataHoraBR(data.atualizado_em));
  return true;
}


// ── Relatório filho: 5 Porquês ────────────────────────────────────
let filho = null;   // { id, numero } do 5 Porquês ligado a esta NIAT
async function atualizarFilho() {
  const b = document.getElementById('b-5pq');
  b.hidden = false;
  if (!registro.id) { filho = null; b.innerHTML = SST.ic('list-tree') + '<span>Gerar 5 Porquês</span>'; document.getElementById('filho-cab').hidden = true; return; }
  const { data } = await sb.from('relatorios').select('id,numero').eq('tipo', '5pq').eq('niat_id', registro.id).limit(1);
  filho = data && data[0] ? data[0] : null;
  b.innerHTML = SST.ic('list-tree') + (filho ? '<span>Ver 5 Porquês</span>' : '<span>Gerar 5 Porquês</span>');
  b.title = filho ? `Abrir ${filho.numero} (relatório filho desta NIAT)` : 'Criar a análise dos 5 Porquês como relatório filho desta NIAT';
  const cab = document.getElementById('filho-cab');
  cab.hidden = !filho;
  if (filho) cab.querySelector('b').textContent = filho.numero;
}

async function gerarOuAbrir5pq() {
  const b = document.getElementById('b-5pq');
  // a NIAT precisa estar salva para ser o relatório pai
  if (!registro.id || SST.alteracoes.sujo) {
    if (!registro.id && !confirm('Para gerar o 5 Porquês, a NIAT precisa ser salva primeiro. Salvar agora?')) return;
    if (!(await salvar())) return;
  }
  await atualizarFilho();
  if (filho) { location.href = `cincoporques.html?id=${filho.id}`; return; }
  if (!confirm(`Gerar a análise dos 5 Porquês ligada à ${registro.numero}?\n\nEla fica registrada como relatório filho desta NIAT.`)) return;

  b.disabled = true; b.innerHTML = SST.ic('loader-circle') + '<span>Gerando…</span>';
  try {
    const c = SST.lerCampos(document.getElementById('form'));
    const campos = {
      data_ocorrencia: c.data || '', unidade: c.unidade, envolvido: c.e1_nome || '', funcao: c.e1_funcao || '',
      fenomeno: c.descricao || '', classificacao: c.classificacao, data_emissao: SST.hojeBR(),
      tecnico: c.tecnico || '', gerente: c.gerente || ''
    };
    const { data, error } = await sb.from('relatorios').insert({
      tipo: '5pq', unidade: c.unidade, niat_id: registro.id,
      classificacao: c.classificacao || null, data_ocorrencia: SST.dataISO(c.data),
      envolvido: campos.envolvido, resumo: (c.w_oque || c.descricao || '').slice(0, 300),
      dados: { campos, cadeias: [[{ problema: c.w_oque || '', pq: [], acao: '', resp: '', prazo: '' }]] }
    }).select('id,numero').single();
    if (error) {
      // outro usuário (ou outra aba) já gerou: abre o existente
      if (error.code === '23505') { await atualizarFilho(); if (filho) { location.href = `cincoporques.html?id=${filho.id}`; return; } }
      throw error;
    }
    toast(`5 Porquês ${data.numero} criado e ligado à ${registro.numero}.`, 'ok');
    location.href = `cincoporques.html?id=${data.id}`;
  } catch (e) {
    toast('Não foi possível gerar o 5 Porquês: ' + traduzErro(e), 'erro', 6000);
    b.disabled = false; atualizarFilho();
  }
}

// Mostra no campo Nº qual será o número automático
async function sugerirNumero() {
  const campo = document.getElementById('numero');
  if (registro.id) return;
  const un = document.getElementById('unidade').value;
  if (!un) { campo.placeholder = 'Automático'; return; }
  const ano = (SST.dataISO(document.getElementById('data-ocorrencia').value) || SST.hojeISO()).slice(0, 4);
  const { data } = await sb.rpc('proximo_numero', { p_tipo: 'niat', p_unidade: un, p_ano: +ano });
  campo.placeholder = data ? `Automático: ${data}` : 'Automático';
}

// ── Início ────────────────────────────────────────────────────────
(async function iniciar() {
  try { perfil = await SST.exigirLogin(); } catch (e) { return; }
  await SST.barra(perfil, 'niat');
  await SST.preencherUnidades(document.getElementById('unidade'));
  catalogo = await SST.catalogoIshikawa().catch(e => { toast(traduzErro(e), 'erro'); return []; });
  desenharIshikawa();
  const admin = await SST.seletorResponsavel(perfil, document.getElementById('responsavel'));
  document.getElementById('ishi-editar').hidden = !admin;
  document.getElementById('responsavel').addEventListener('change', marcarSujo);
  mascaraData(document.getElementById('data-ocorrencia'));

  const form = document.getElementById('form');
  form.addEventListener('input', marcarSujo);
  form.addEventListener('change', marcarSujo);
  document.getElementById('situacao').addEventListener('change', marcarSujo);
  window.addEventListener('beforeunload', e => { if (SST.alteracoes.sujo) { e.preventDefault(); e.returnValue = ''; } });
  document.getElementById('b-salvar').onclick = salvar;
  document.getElementById('unidade').addEventListener('change', sugerirNumero);
  document.getElementById('data-ocorrencia').addEventListener('change', sugerirNumero);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(); }
  });
  document.getElementById('b-5pq').onclick = gerarOuAbrir5pq;


  const id = SST.param('id');
  try {
    if (id) {
      const ok = await carregar(id);
      if (!ok) {
        document.getElementById('carregando').innerHTML = '<div class="vazio"><div class="ic">' + SST.ic('lock', 40) + '</div>Relatório não encontrado ou você não tem permissão para abri-lo.<br><br><a class="btn primario" href="relatorios.html">Ir para a lista</a></div>';
        return;
      }
    } else {
      carregandoForm = true;
      document.getElementById('data-emissao').textContent = SST.hojeBR();
      addRow({}); addRow({});
      setSeverity('grave');
      carregandoForm = false;
      marcarLimpo('Novo relatório — o número é gerado ao salvar');
      atualizarFilho();
    }
  } catch (e) {
    toast(traduzErro(e), 'erro', 6000);
  }
  document.getElementById('carregando').hidden = true;
  document.getElementById('conteudo').hidden = false;
})();
