import re
import sys

# ==========================================================
# 1. Update EscalaView.tsx
# ==========================================================
with open('src/components/EscalaView.tsx', 'r', encoding='utf-8') as f:
    escala = f.read()

# Ensure feriados import
if "from '../lib/feriados'" not in escala and 'from "../lib/feriados"' not in escala:
    escala = "import { getFeriado, isDataBloqueadaParaAgendamento, FeriadoInfo } from '../lib/feriados';\n" + escala

# Ensure handleDuplicateItem is guarded
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

# Ensure legend in toolbar has holiday markers
if "Feriados Nacionais (Bloqueado)" not in escala:
    old_legend = '<span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Concluído'
    new_legend = """<span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Concluído
            <div className="h-3 w-px bg-slate-300 mx-1"></div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold border border-rose-300" title="Proibido agendamentos em feriados nacionais">
              🇧🇷 Feriados Nacionais (Bloqueado)
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-300" title="Feriados em Pernambuco e Recife">
              ⭐ PE / Recife
            </span>"""
    escala = escala.replace(old_legend, new_legend, 1)

# Ensure holiday badge in Day / Date column
day_date_pattern = r'(<p className=\{`font-semibold text-slate-500 \$\{fontConfig\.dateText\}`\}>\{weekDates\[dayIdx\]\}<\/p>\s*<\/div>)'
if 'const feriado = getFeriado(weekDatesFull[dayIdx]);' not in escala:
    replacement_day = """<p className={`font-semibold text-slate-500 ${fontConfig.dateText}`}>{weekDates[dayIdx]}</p>
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
    escala = re.sub(day_date_pattern, replacement_day, escala, count=1)

# Ensure day cell has holiday banner at top
cell_top_target = 'style={{ backgroundColor: cellColor }}\n                      >'
cell_top_replacement = """style={{ backgroundColor: cellColor }}
                      >
                        {/* Holiday Banner inside cell */}
                        {(() => {
                          const feriado = getFeriado(fullDate);
                          if (!feriado) return null;
                          if (feriado.tipo === 'nacional') {
                            return (
                              <div className="mb-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-400/40 text-rose-900 text-[10px] font-extrabold flex items-center justify-between shadow-2xs backdrop-blur-xs" title={`Feriado Nacional: ${feriado.nome}. Proibido agendar!`}>
                                <span className="truncate">🇧🇷 {feriado.nome}</span>
                                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-rose-600 text-white font-black shrink-0 ml-1">Bloqueado</span>
                              </div>
                            );
                          }
                          if (feriado.tipo === 'municipal_recife' || feriado.tipo === 'estadual_pe') {
                            return (
                              <div className={`mb-1 px-1.5 py-0.5 rounded ${feriado.tipo === 'municipal_recife' ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-950' : 'bg-blue-500/15 border-blue-400/40 text-blue-950'} border text-[10px] font-extrabold flex items-center gap-1 shadow-2xs backdrop-blur-xs`} title={feriado.descricao || feriado.nome}>
                                <span className="truncate">{feriado.tipo === 'municipal_recife' ? '🏛️ Recife' : '⭐ PE'}: {feriado.nome}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}"""

if cell_top_target in escala and "Holiday Banner inside cell" not in escala:
    escala = escala.replace(cell_top_target, cell_top_replacement, 1)

# Guard UserPlus button click
old_userplus = """<button 
                            onClick={() => setAddingClientTo(addingClientTo?.day === day && addingClientTo?.teamId === team.id ? null : {day, teamId: team.id})}"""
new_userplus = """<button 
                            onClick={() => {
                              const lock = isDataBloqueadaParaAgendamento(fullDate);
                              if (lock.bloqueada) {
                                addToast(`🚫 ${lock.motivo}`);
                                return;
                              }
                              setAddingClientTo(addingClientTo?.day === day && addingClientTo?.teamId === team.id ? null : {day, teamId: team.id});
                            }}"""
if old_userplus in escala and "isDataBloqueadaParaAgendamento(fullDate)" not in escala:
    escala = escala.replace(old_userplus, new_userplus, 1)

# Write back EscalaView.tsx
with open('src/components/EscalaView.tsx', 'w', encoding='utf-8') as f:
    f.write(escala)

print("EscalaView.tsx successfully updated.")

# ==========================================================
# 2. Update App.tsx
# ==========================================================
with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Ensure feriados import in App.tsx
if "from './lib/feriados'" not in app and 'from "./lib/feriados"' not in app:
    app = "import { getFeriado, isDataBloqueadaParaAgendamento } from './lib/feriados';\n" + app

# Guard handleSubmit in App.tsx
if "isDataBloqueadaParaAgendamento(formData.dataObra)" not in app:
    old_hs = "const handleSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    if (!user) return;"
    new_hs = """const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (formData.dataObra) {
      const lock = isDataBloqueadaParaAgendamento(formData.dataObra);
      if (lock.bloqueada) {
        alert(`🚫 Bloqueado: Não é permitido agendar em feriados nacionais.\\n\\n${lock.motivo}`);
        return;
      }
    }"""
    app = app.replace(old_hs, new_hs, 1)

# Guard handleServicoSubmit in App.tsx
if "isDataBloqueadaParaAgendamento(servicoFormData.dataServico)" not in app:
    old_hss = "const handleServicoSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    if (!user) return;"
    new_hss = """const handleServicoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (servicoFormData.dataServico) {
      const lock = isDataBloqueadaParaAgendamento(servicoFormData.dataServico);
      if (lock.bloqueada) {
        alert(`🚫 Bloqueado: Não é permitido agendar em feriados nacionais.\\n\\n${lock.motivo}`);
        return;
      }
    }"""
    app = app.replace(old_hss, new_hss, 1)

# Guard updateObraQuick in App.tsx
if "isDataBloqueadaParaAgendamento(String(value))" not in app:
    old_uoq = "const updateObraQuick = async (id: number, field: keyof Obra, value: any) => {"
    new_uoq = """const updateObraQuick = async (id: number, field: keyof Obra, value: any) => {
    if (field === 'dataObra' && value) {
      const lock = isDataBloqueadaParaAgendamento(String(value));
      if (lock.bloqueada) {
        alert(`🚫 Bloqueado: Não é permitido agendar em feriados nacionais.\\n\\n${lock.motivo}`);
        return;
      }
    }"""
    app = app.replace(old_uoq, new_uoq, 1)

# Guard updateServicoQuick in App.tsx
if "field === 'dataServico' && value" not in app:
    old_usq = "const updateServicoQuick = async (id: number, field: string, value: any) => {"
    new_usq = """const updateServicoQuick = async (id: number, field: string, value: any) => {
    if (field === 'dataServico' && value) {
      const lock = isDataBloqueadaParaAgendamento(String(value));
      if (lock.bloqueada) {
        alert(`🚫 Bloqueado: Não é permitido agendar em feriados nacionais.\\n\\n${lock.motivo}`);
        return;
      }
    }"""
    app = app.replace(old_usq, new_usq, 1)

# FormField dataObra holiday feedback
old_form_obra = """<FormField label="Data Prevista Obra">
                        <input 
                          type="date" 
                          name="dataObra"
                          disabled={!canEditAllFields}
                          value={formData.dataObra}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 font-medium"
                        />
                      </FormField>"""

new_form_obra = """<FormField label="Data Prevista Obra">
                        <input 
                          type="date" 
                          name="dataObra"
                          disabled={!canEditAllFields}
                          value={formData.dataObra}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 font-medium"
                        />
                        {formData.dataObra && (() => {
                          const feriado = getFeriado(formData.dataObra);
                          if (!feriado) return null;
                          if (feriado.tipo === 'nacional') {
                            return (
                              <div className="mt-1 px-2 py-1 rounded bg-rose-50 border border-rose-300 text-rose-800 text-[11px] font-bold flex items-center gap-1.5">
                                <span>🚫</span>
                                <span>Feriado Nacional ({feriado.nome}): Agendamento Proibido!</span>
                              </div>
                            );
                          }
                          if (feriado.tipo === 'municipal_recife' || feriado.tipo === 'estadual_pe') {
                            return (
                              <div className="mt-1 px-2 py-1 rounded bg-blue-50 border border-blue-300 text-blue-900 text-[11px] font-bold flex items-center gap-1.5">
                                <span>⭐</span>
                                <span>{feriado.tipo === 'municipal_recife' ? 'Feriado Recife' : 'Feriado PE'}: {feriado.nome}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </FormField>"""

if old_form_obra in app:
    app = app.replace(old_form_obra, new_form_obra, 1)

# FormField dataServico holiday feedback
old_form_servico = """<FormField label="Data do Serviço">
                        <input 
                          type="date" 
                          name="dataServico"
                          value={servicoFormData.dataServico}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                        />
                      </FormField>"""

new_form_servico = """<FormField label="Data do Serviço">
                        <input 
                          type="date" 
                          name="dataServico"
                          value={servicoFormData.dataServico}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                        />
                        {servicoFormData.dataServico && (() => {
                          const feriado = getFeriado(servicoFormData.dataServico);
                          if (!feriado) return null;
                          if (feriado.tipo === 'nacional') {
                            return (
                              <div className="mt-1 px-2 py-1 rounded bg-rose-50 border border-rose-300 text-rose-800 text-[11px] font-bold flex items-center gap-1.5">
                                <span>🚫</span>
                                <span>Feriado Nacional ({feriado.nome}): Agendamento Proibido!</span>
                              </div>
                            );
                          }
                          if (feriado.tipo === 'municipal_recife' || feriado.tipo === 'estadual_pe') {
                            return (
                              <div className="mt-1 px-2 py-1 rounded bg-blue-50 border border-blue-300 text-blue-900 text-[11px] font-bold flex items-center gap-1.5">
                                <span>⭐</span>
                                <span>{feriado.tipo === 'municipal_recife' ? 'Feriado Recife' : 'Feriado PE'}: {feriado.nome}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </FormField>"""

if old_form_servico in app:
    app = app.replace(old_form_servico, new_form_servico, 1)

# Write back App.tsx
with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)

print("App.tsx successfully updated.")
