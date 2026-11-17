# Sistema SST — DB Agronegócios

Registro de investigações de acidentes (NIAT, FOR 005-001) e análises dos 5 Porquês (FOR 005-002), com login, banco de dados e numeração por unidade.

**Endereço:** https://vdaconsolacaooliveira-debug.github.io/investigacao/

## Como funciona

| Página | O que faz |
|---|---|
| `index.html` | Login, cadastro, recuperação de senha e menu inicial |
| `niat.html` | Formulário NIAT (FOR 005-001) |
| `cincoporques.html` | Formulário 5 Porquês (FOR 005-002), ligado a uma NIAT |
| `relatorios.html` | Lista com pesquisa, filtros e exportação CSV |
| `usuarios.html` | Aprovação e gestão de usuários (só Administrador) |
| `configuracoes.html` | Edição da lista do Diagrama de Ishikawa: grupos e itens (só Administrador) |

- **Banco:** Supabase (plano gratuito), projeto `sst-db`, região São Paulo.
- **Numeração:** `NIAT-FSF-001/2026` e `5PQ-FSF-001/2026` — contagem própria por tipo, unidade e ano. O número é gerado ao salvar e não muda mais.
- **NIAT → 5 Porquês:** na NIAT, o botão "Gerar 5 Porquês" cria o relatório filho já ligado à NIAT (pai), com unidade, data, envolvido, descrição e classificação. Cada NIAT tem no máximo um 5 Porquês, e a ligação não pode ser trocada depois.
- **Lista do Ishikawa:** fica no banco (tabelas `ishikawa_grupos` e `ishikawa_itens`). Só o Administrador altera. Cada relatório guarda o texto do que foi marcado, então mudanças na lista não alteram relatórios já salvos — itens que saíram da lista aparecem em itálico no relatório antigo.
- **Responsável:** quem vê e edita o relatório. O Administrador pode criar uma NIAT ou um 5 Porquês e escolher o responsável; o 5 Porquês filho sempre acompanha o responsável da NIAT pai.
- **Acesso:** o primeiro cadastro vira Administrador. Os demais entram pendentes até o Administrador aprovar.
  - Administrador: vê e edita todos os relatórios, exclui relatórios, gerencia usuários.
  - Padrão: vê e edita só os relatórios dos quais é responsável (os que criou e os que o Administrador designou para ele).
- **Fotos:** reduzidas no navegador (máx. 1600 px) e guardadas no Storage do Supabase, visíveis só para quem pode abrir o relatório.

## Siglas das unidades

| Sigla | Unidade |
|---|---|
| ESC | Escritório Central |
| LOG | Estacionamento/Logística |
| FBR | Faz. Bom Retiro |
| FCH | Faz. Chuá |
| FSF | Faz. Saco São Francisco |
| FST | Faz. Saco Tapera |
| FSJ | Faz. São João |
| GBR | Granja Bom Retiro |
| GSF | Granja Saco São Francisco |
| GSJ | Granja São João |
| GCH | Granjas Chuá |

As unidades ficam na tabela `unidades` do banco. Para incluir uma nova, basta inserir a linha (sigla de 3 letras).

## Arquivos técnicos

- `sql/01_estrutura.sql` — estrutura base do banco. As alterações seguintes (vínculo pai/filho, lista do Ishikawa, responsável) estão no histórico de migrações do Supabase: Database → Migrations.
- `js/config.js` — endereço e chave pública do banco.
- `js/vendor/supabase.js` — biblioteca do Supabase (v2.119.0), incluída no repositório.
