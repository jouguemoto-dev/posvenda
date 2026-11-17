import re
import sys

# 1. Patch EscalaView.tsx
with open('src/components/EscalaView.tsx', 'r', encoding='utf-8') as f:
    escala = f.read()

# Check if feriados already imported
if "from '../lib/feriados'" not in escala and 'from "../lib/feriados"' not in escala:
    escala = "import { getFeriado, isDataBloqueadaParaAgendamento, FeriadoInfo } from '../lib/feriados';\n" + escala

# Ensure duplicate check is guarded in handleDuplicateItem
if "isDataBloqueadaParaAgendamento(tempDate)" not in escala:
    old_dup = "const handleDuplicateItem = async () => {"
    new_dup = """const handleDuplicateItem = async () => {
    if (tempDate) {
      const lock = isDataBloqueadaParaAgendamento(tempDate);
      if (lock.bloqueada) {
        addToast(`🚫 ${lock.motivo}`);
        return;
      }
    }"""
    escala = escala.replace(old_dup, new_dup, 1)

# Check UserPlus button in cell (direct quick schedule creation button)
# Find onClick for UserPlus or quick cell add
# In EscalaView, let's see how quick add or cell click works:
# We can search for handleQuickAdd or UserPlus
# Let's inspect where UserPlus or cell addition is in EscalaView

# 2. Patch legend in toolbar
if "Feriados Nacionais (Bloqueado)" not in escala:
    old_legend = '<span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Concluído'
    new_legend = """<span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Concluído
            <div className="h-3 w-px bg-slate-300 mx-1"></div>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold border border-rose-300" title="Proibido agendamentos em feriados nacionais">
              🇧🇷 Feriados Nacionais (Bloqueado)
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-300" title="Feriados em Pernambuco e Recife">
              ⭐ PE / Recife
            </span>"""
    escala = escala.replace(old_legend, new_legend, 1)

# 3. Patch Day/Date column to show holiday badge
# Look for <p className={`font-semibold text-slate-500 ${fontConfig.dateText}`}>{weekDates[dayIdx]}</p>
old_date_render = """<p className={`font-semibold text-slate-500 ${fontConfig.dateText}`}>{weekDates[dayIdx]}</p>
                      </div>"""
new_date_render = """<p className={`font-semibold text-slate-500 ${fontConfig.dateText}`}>{weekDates[dayIdx]}</p>
                        {(() => {
                          const feriado = getFeriado(weekDatesFull[dayIdx]);
                          if (!feriado) return null;
                          if (feriado.tipo === 'municipal_recife') {
                            return (
                              <div className="mt-1 px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold leading-tight" title={feriado.descricao || feriado.nome}>
                                🏛️ RECIFE: {feriado.nome}
                              </div>
                            );
                          }
                          if (feriado.tipo === 'estadual_pe') {
                            return (
                              <div className="mt-1 px-1.5 py-0.5 rounded bg-blue-100 border border-blue-300 text-blue-900 text-[10px] font-bold leading-tight" title={feriado.descricao || feriado.nome}>
                                ⭐ PE: {feriado.nome}
                              </div>
                            );
                          }
                          if (feriado.tipo === 'nacional') {
                            return (
                              <div className="mt-1 px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-bold leading-tight" title={`Feriado Nacional: ${feriado.nome}. Agendamentos BLOQUEADOS!`}>
                                🇧🇷 FERIADO: {feriado.nome}
                                <div className="text-[9px] text-rose-700 font-extrabold uppercase mt-0.5">🚫 Não agendável</div>
                              </div>
                            );
                          }
                          return (
                            <div className="mt-1 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold leading-tight">
                              📅 {feriado.nome}
                            </div>
                          );
                        })()}
                      </div>"""

if old_date_render in escala and "const feriado = getFeriado(weekDatesFull[dayIdx]);" not in escala:
    escala = escala.replace(old_date_render, new_date_render, 1)

# 4. In day cell header inside visibleTeams.map
# Look for <td key={team.id} className={`p-2 border-r border-slate-200 align-top relative group/cell
# Or wherever items in cell are rendered
# Let's find how cell is opened:
cell_marker = "const fullDate = weekDatesFull[dayIdx];"
# Let's check cell content insertion

with open('src/components/EscalaView.tsx', 'w', encoding='utf-8') as f:
    f.write(escala)

print("EscalaView.tsx patched successfully")
