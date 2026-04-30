import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Receipt, 
  Download, 
  User, 
  MapPin, 
  Calendar, 
  Package, 
  DollarSign, 
  ArrowLeft,
  Printer,
  Save,
  CheckCircle2,
  AlertCircle,
  History,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';

interface PosVendaViewProps {
  onBack: () => void;
}

export default function PosVendaView({ onBack }: PosVendaViewProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const COMPANY_DETAILS = {
    name: 'Cbc Energias Renovaveis',
    fullName: 'Castelo Branco & Cavalcante Energias Renovaveis LTDA',
    cnpj: '47.951.622/0001-69',
    address: 'Rua Dom Manoel da Costa 257 Cxpst 0119, Madalena, Recife - PE, 50710-395'
  };

  // Proposal State
  const [proposalData, setProposalData] = useState({
    nomeCliente: 'João da Silva',
    endereco: 'Rua das Palmeiras, 123, Bairro Solar - Cidade Sol',
    numeroSistema: 'SIS-2024-0892',
    validade: '15 dias',
    prazoExecucao: '5 dias úteis após aprovação',
    valorAvulso: 450,
    valorPlanoAnual: 800,
  });

  // Receipt State
  const [receiptData, setReceiptData] = useState({
    numeroRecibo: '001/2026',
    dataPagamento: new Date().toISOString().split('T')[0],
    valor: 450,
    formaPagamento: 'Pix',
    servicoRealizado: 'Manutenção Pós-Venda (Limpeza e Inspeção Elétrica)',
  });

  // Fetch history
  useEffect(() => {
    if (!auth.currentUser) return;

    setIsLoadingHistory(true);
    const q = query(
      collection(db, 'posvenda'),
      where('createdBy', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(records);
      setIsLoadingHistory(false);
    }, (error) => {
      console.error("Erro ao carregar histórico:", error);
      setIsLoadingHistory(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser) return;
    
    setIsSaving(true);
    setStatus(null);

    try {
      await addDoc(collection(db, 'posvenda'), {
        ...proposalData,
        ...receiptData,
        valorPago: receiptData.valor, // Map to blueprint field
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      
      setStatus({ type: 'success', message: 'Recibo salvo com sucesso no banco de dados!' });
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error("Erro ao salvar recibo:", error);
      setStatus({ type: 'error', message: 'Erro ao salvar o recibo. Tente novamente.' });
    } finally {
      setIsSaving(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // --- HEADER COMUM ---
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(COMPANY_DETAILS.fullName, pageWidth / 2, 10, { align: 'center' });
    doc.text(`CNPJ: ${COMPANY_DETAILS.cnpj}`, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(8);
    doc.text(COMPANY_DETAILS.address, pageWidth / 2, 20, { align: 'center' });
    doc.line(10, 22, pageWidth - 10, 22);

    // --- PROPOSTA DE SERVIÇO ---
    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.setFont('helvetica', 'bold');
    doc.text('PROPOSTA DE SERVIÇO DE PÓS-VENDA', pageWidth / 2, 32, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59); // Slate-800
    
    // Dados do Cliente
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO CLIENTE', 20, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${proposalData.nomeCliente}`, 20, 52);
    doc.text(`Endereço: ${proposalData.endereco}`, 20, 57);
    doc.text(`Número do Sistema: ${proposalData.numeroSistema}`, 20, 62);

    // Serviços
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIÇÃO DOS SERVIÇOS OFERECIDOS', 20, 75);
    doc.setFont('helvetica', 'normal');
    const servicos = [
      '- Limpeza técnica das placas fotovoltaicas',
      '- Inspeção elétrica completa (conexões e cabos)',
      '- Análise de desempenho do sistema',
      '- Verificação de monitoramento remoto',
      '- Emissão de laudo técnico de manutenção',
      '- Suporte prioritário por 12 meses'
    ];
    servicos.forEach((s, i) => {
      doc.text(s, 25, 82 + (i * 5));
    });

    // Periodicidade e Valores
    doc.setFont('helvetica', 'bold');
    doc.text('PERIODICIDADE E VALORES', 20, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Periodicidade sugerida: Semestral ou Anual', 20, 127);
    doc.text(`Valor manutenção avulsa: R$ ${(proposalData.valorAvulso || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, 132);
    doc.text(`Valor plano anual (desconto): R$ ${(proposalData.valorPlanoAnual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, 137);

    // Prazos e Termos
    doc.setFont('helvetica', 'bold');
    doc.text('VALIDADE E PRAZOS', 20, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`Validade da proposta: ${proposalData.validade}`, 20, 157);
    doc.text(`Prazo para execução: ${proposalData.prazoExecucao}`, 20, 162);

    doc.setFont('helvetica', 'bold');
    doc.text('TERMOS DE GARANTIA E RESPONSABILIDADE', 20, 175);
    doc.setFontSize(8);
    const termos = "A empresa se responsabiliza tecnicamente pela execução dos serviços descritos, garantindo a integridade dos equipamentos durante a manutenção. A garantia do serviço prestado é de 30 dias conforme CDC.";
    doc.text(doc.splitTextToSize(termos, pageWidth - 40), 20, 182);

    // Linha Separadora
    doc.line(10, 195, pageWidth - 10, 195);

    // --- RECIBO DE PAGAMENTO ---
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // Emerald-500
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGAMENTO', pageWidth / 2, 210, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`RECIBO Nº: ${receiptData.numeroRecibo}`, 20, 220);
    doc.text(`VALOR: R$ ${(receiptData.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 20, 220, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    const textoRecibo = `Recebi(emos) de ${proposalData.nomeCliente}, a importância de R$ ${(receiptData.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${receiptData.formaPagamento}), referente ao serviço de ${receiptData.servicoRealizado}.`;
    doc.text(doc.splitTextToSize(textoRecibo, pageWidth - 40), 20, 230);

    doc.text(`Data: ${new Date(receiptData.dataPagamento).toLocaleDateString('pt-BR')}`, 20, 250);
    
    // Assinatura
    doc.line(pageWidth / 2 - 40, 275, pageWidth / 2 + 40, 275);
    doc.setFontSize(8);
    doc.text(COMPANY_DETAILS.name, pageWidth / 2, 280, { align: 'center' });

    doc.save(`PosVenda_${proposalData.nomeCliente.replace(/ /g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-all"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>
        <div className="flex items-center gap-3">
          {status && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
              }`}
            >
              {status.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {status.message}
            </motion.div>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 transition-all"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Salvar Registro
          </button>
          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all"
          >
            <Download size={18} />
            Exportar Documentos (PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Proposal Form */}
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-indigo-600 border-b border-indigo-50 pb-2">
            <FileText size={20} />
            <h2 className="font-bold">Dados da Proposta</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Cliente</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  value={proposalData.nomeCliente}
                  onChange={(e) => setProposalData({...proposalData, nomeCliente: e.target.value})}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Endereço</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  value={proposalData.endereco}
                  onChange={(e) => setProposalData({...proposalData, endereco: e.target.value})}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">N° Sistema</label>
                <div className="relative">
                  <Package size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="text" 
                    value={proposalData.numeroSistema}
                    onChange={(e) => setProposalData({...proposalData, numeroSistema: e.target.value})}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Validade</label>
                <input 
                  type="text" 
                  value={proposalData.validade}
                  onChange={(e) => setProposalData({...proposalData, validade: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Valor Avulso (R$)</label>
                <input 
                  type="number" 
                  value={isNaN(proposalData.valorAvulso) ? '' : proposalData.valorAvulso}
                  onChange={(e) => setProposalData({...proposalData, valorAvulso: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Valor Plano Anual (R$)</label>
                <input 
                  type="number" 
                  value={isNaN(proposalData.valorPlanoAnual) ? '' : proposalData.valorPlanoAnual}
                  onChange={(e) => setProposalData({...proposalData, valorPlanoAnual: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Receipt Form */}
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-emerald-600 border-b border-emerald-50 pb-2">
            <Receipt size={20} />
            <h2 className="font-bold">Dados do Recibo</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">N° Recibo</label>
                <input 
                  type="text" 
                  value={receiptData.numeroRecibo}
                  onChange={(e) => setReceiptData({...receiptData, numeroRecibo: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Data Pagamento</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="date" 
                    value={receiptData.dataPagamento}
                    onChange={(e) => setReceiptData({...receiptData, dataPagamento: e.target.value})}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Valor Pago (R$)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="number" 
                    value={isNaN(receiptData.valor) ? '' : receiptData.valor}
                    onChange={(e) => setReceiptData({...receiptData, valor: parseFloat(e.target.value)})}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Forma de Pagamento</label>
                <input 
                  type="text" 
                  value={receiptData.formaPagamento}
                  onChange={(e) => setReceiptData({...receiptData, formaPagamento: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Serviço Realizado</label>
              <textarea 
                value={receiptData.servicoRealizado}
                onChange={(e) => setReceiptData({...receiptData, servicoRealizado: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium h-20"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Visual Preview */}
      <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto font-serif">
        <div className="border p-8 relative">
          {/* Header Info */}
          <div className="text-center mb-6 border-b pb-4">
            <p className="text-sm font-bold text-slate-800 uppercase tracking-wider">{COMPANY_DETAILS.fullName}</p>
            <p className="text-xs text-slate-500 mt-1">CNPJ: {COMPANY_DETAILS.cnpj}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{COMPANY_DETAILS.address}</p>
          </div>

          {/* Proposal Preview */}
          <div className="space-y-4">
            <h3 className="text-center text-xl font-bold text-indigo-700">PROPOSTA DE PÓS-VENDA</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-bold">CLIENTE:</p>
                <p>{proposalData.nomeCliente}</p>
                <p className="mt-2 font-bold">ENDEREÇO:</p>
                <p className="text-xs">{proposalData.endereco}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">SISTEMA Nº:</p>
                <p>{proposalData.numeroSistema}</p>
              </div>
            </div>
            
            <div className="pt-4">
              <p className="font-bold text-sm mb-2">SERVIÇOS INCLUSOS:</p>
              <ul className="text-xs space-y-1 list-disc pl-5">
                <li>Limpeza técnica das placas</li>
                <li>Inspeção elétrica e conferência de cabos</li>
                <li>Análise de performance via app</li>
                <li>Laudo técnico de diagnóstico</li>
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-4 text-[10px] text-slate-600">
                <p><span className="font-bold">Validade:</span> {proposalData.validade}</p>
                <p><span className="font-bold">Prazo:</span> {proposalData.prazoExecucao}</p>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 italic">* Garantia de serviço de 30 dias após execução.</p>
            </div>

            <div className="pt-4 grid grid-cols-2 gap-4 text-sm italic">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400">VALOR AVULSO</p>
                <p className="text-lg font-bold text-slate-700">R$ {(proposalData.valorAvulso || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-400">PLANO ANUAL</p>
                <p className="text-lg font-bold text-indigo-700">R$ {(proposalData.valorPlanoAnual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Slashed Line */}
          <div className="my-10 border-t-2 border-dashed border-slate-300 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-4 text-slate-300 text-[10px]">CORTE AQUI</span>
          </div>

          {/* Receipt Preview */}
          <div className="space-y-4">
            <h3 className="text-center text-xl font-bold text-emerald-600 uppercase tracking-widest">Recibo</h3>
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <p className="text-[10px] font-bold text-slate-400">NÚMERO DO RECIBO</p>
                <p className="font-mono font-bold text-slate-700">{receiptData.numeroRecibo}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400">VALOR TOTAL</p>
                <p className="text-2xl font-bold text-emerald-600">R$ {(receiptData.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            
            <div className="text-sm border-l-2 border-emerald-500 pl-4 py-2">
              <p>Recebemos de <span className="font-bold underline decoration-dotted">{proposalData.nomeCliente}</span></p>
              <p className="mt-2 text-xs leading-relaxed">
                Referente ao pagamento de: <span className="italic">{receiptData.servicoRealizado}</span>
              </p>
            </div>

            <div className="flex justify-between items-end pt-8">
              <div className="text-xs text-slate-500">
                Data: {new Date(receiptData.dataPagamento).toLocaleDateString('pt-BR')}
              </div>
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <p className="text-[10px] font-bold text-slate-800">{COMPANY_DETAILS.name}</p>
                <p className="text-[8px] text-slate-400">RESPONSÁVEL TÉCNICO</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-center">
            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Printer size={10} /> Visualização de impressão. Use o botão acima para exportar em alta qualidade.
            </p>
        </div>
      </section>

      {/* History section */}
      <section className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-slate-600 border-b border-slate-200 pb-2">
          <History size={18} />
          <h2 className="font-bold text-sm uppercase tracking-wider">Histórico Recente</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {isLoadingHistory ? (
              <div className="col-span-full py-10 flex justify-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="col-span-full py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-sm text-slate-400 font-medium">Nenhum registro salvo ainda.</p>
              </div>
            ) : (
              history.map((record) => (
                <motion.div 
                  key={record.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{record.nomeCliente}</span>
                      <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">#{record.numeroRecibo}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><DollarSign size={10} /> R$ {record.valorPago?.toLocaleString('pt-BR')}</span>
                      <span className="flex items-center gap-1"><Calendar size={10} /> {record.createdAt?.toDate ? record.createdAt.toDate().toLocaleDateString('pt-BR') : '---'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setProposalData({
                        nomeCliente: record.nomeCliente,
                        endereco: record.endereco,
                        numeroSistema: record.numeroSistema,
                        validade: record.validade,
                        prazoExecucao: record.prazoExecucao,
                        valorAvulso: record.valorAvulso,
                        valorPlanoAnual: record.valorPlanoAnual,
                      });
                      setReceiptData({
                        numeroRecibo: record.numeroRecibo,
                        dataPagamento: record.dataPagamento,
                        valor: record.valorPago,
                        formaPagamento: record.formaPagamento,
                        servicoRealizado: record.servicoRealizado,
                      });
                    }}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Carregar dados"
                  >
                    <ExternalLink size={16} />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
