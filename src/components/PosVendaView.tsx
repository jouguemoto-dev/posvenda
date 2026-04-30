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
  const [activeTab, setActiveTab] = useState<'proposta' | 'recibo'>('proposta');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const [companyDetails, setCompanyDetails] = useState({
    name: 'Cbc Energias Renovaveis',
    fullName: 'Castelo Branco & Cavalcante Energias Renovaveis LTDA',
    cnpj: '47.951.622/0001-69',
    address: 'Rua Dom Manoel da Costa 257 Cxpst 0119, Madalena, Recife - PE, 50710-395'
  });

  const [servicosInclusos, setServicosInclusos] = useState([
    'Limpeza técnica das placas fotovoltaicas',
    'Inspeção elétrica completa (conexões e cabos)',
    'Análise de desempenho do sistema',
    'Verificação de monitoramento remoto',
    'Emissão de laudo técnico de manutenção',
    'Suporte prioritário por 12 meses'
  ]);

  const [termosGarantia, setTermosGarantia] = useState("A empresa se responsabiliza tecnicamente pela execução dos serviços descritos, garantindo a integridade dos equipamentos durante a manutenção. A garantia do serviço prestado é de 30 dias conforme CDC.");

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

  const handleFirestoreError = (error: any, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    // Don't throw if we want to handle it in state, but here we can throw or just set status
    return errInfo;
  };

  // Fetch history
  useEffect(() => {
    if (!auth.currentUser) return;

    setIsLoadingHistory(true);
    const posVendaPath = 'posvenda';
    const q = query(
      collection(db, posVendaPath),
      where('createdBy', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(records);
      setIsLoadingHistory(false);
    }, (error) => {
      const info = handleFirestoreError(error, 'list', posVendaPath);
      console.error("Erro ao carregar histórico:", info.error);
      setIsLoadingHistory(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser) return;
    
    setIsSaving(true);
    setStatus(null);
    const posVendaPath = 'posvenda';

    try {
      await addDoc(collection(db, posVendaPath), {
        tipo: activeTab,
        ...proposalData,
        ...(activeTab === 'recibo' ? receiptData : {}),
        companyDetails,
        servicosInclusos,
        termosGarantia,
        valorPago: activeTab === 'recibo' ? receiptData.valor : null,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      
      setStatus({ type: 'success', message: `${activeTab === 'proposta' ? 'Proposta' : 'Recibo'} salva com sucesso!` });
      
      // Clear status after 3 seconds
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      const info = handleFirestoreError(error, 'create', posVendaPath);
      setStatus({ type: 'error', message: `Erro ao salvar: ${info.error}` });
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
    doc.text(companyDetails.fullName, pageWidth / 2, 10, { align: 'center' });
    doc.text(`CNPJ: ${companyDetails.cnpj}`, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(8);
    doc.text(companyDetails.address, pageWidth / 2, 20, { align: 'center' });
    doc.line(10, 22, pageWidth - 10, 22);

    if (activeTab === 'proposta') {
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
      servicosInclusos.forEach((s, i) => {
        doc.text(`- ${s}`, 25, 82 + (i * 5));
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
      doc.text(doc.splitTextToSize(termosGarantia, pageWidth - 40), 20, 182);
      
      doc.save(`Proposta_PosVenda_${proposalData.nomeCliente.replace(/ /g, '_')}.pdf`);
    } else {
      // --- RECIBO DE PAGAMENTO ---
      doc.setFontSize(14);
      doc.setTextColor(16, 185, 129); // Emerald-500
      doc.setFont('helvetica', 'bold');
      doc.text('RECIBO DE PAGAMENTO', pageWidth / 2, 40, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`RECIBO Nº: ${receiptData.numeroRecibo}`, 20, 55);
      doc.text(`VALOR: R$ ${(receiptData.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 20, 55, { align: 'right' });
      
      doc.setFont('helvetica', 'normal');
      const textoRecibo = `Recebi(emos) de ${proposalData.nomeCliente}, a importância de R$ ${(receiptData.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${receiptData.formaPagamento}), referente ao serviço de ${receiptData.servicoRealizado}.`;
      doc.text(doc.splitTextToSize(textoRecibo, pageWidth - 40), 20, 65);

      doc.text(`Data: ${new Date(receiptData.dataPagamento).toLocaleDateString('pt-BR')}`, 20, 85);
      
      // Assinatura
      doc.line(pageWidth / 2 - 40, 110, pageWidth / 2 + 40, 110);
      doc.setFontSize(8);
      doc.text(companyDetails.name, pageWidth / 2, 115, { align: 'center' });

      doc.save(`Recibo_PosVenda_${proposalData.nomeCliente.replace(/ /g, '_')}.pdf`);
    }
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
            Exportar {activeTab === 'proposta' ? 'Proposta' : 'Recibo'} (PDF)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit mx-auto">
        <button
          onClick={() => setActiveTab('proposta')}
          className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'proposta' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={16} />
          Proposta de Serviço
        </button>
        <button
          onClick={() => setActiveTab('recibo')}
          className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'recibo' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Receipt size={16} />
          Recibo de Conclusão
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Forms */}
        <div className="space-y-6">
          {/* Company Details Form */}
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-600 border-b border-slate-50 pb-2">
              <Package size={20} />
              <h2 className="font-bold">Dados da Empresa</h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Razão Social / Nome Completo</label>
                <input 
                  type="text" 
                  value={companyDetails.fullName}
                  onChange={(e) => setCompanyDetails({...companyDetails, fullName: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nome Curto (Assinatura)</label>
                  <input 
                    type="text" 
                    value={companyDetails.name}
                    onChange={(e) => setCompanyDetails({...companyDetails, name: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">CNPJ</label>
                  <input 
                    type="text" 
                    value={companyDetails.cnpj}
                    onChange={(e) => setCompanyDetails({...companyDetails, cnpj: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Endereço da Empresa</label>
                <input 
                  type="text" 
                  value={companyDetails.address}
                  onChange={(e) => setCompanyDetails({...companyDetails, address: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium"
                />
              </div>
            </div>
          </section>

          <AnimatePresence mode="wait">
            {activeTab === 'proposta' ? (
              <motion.div
                key="proposal-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
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

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Serviços Inclusos (um por linha)</label>
                      <textarea 
                        value={servicosInclusos.join('\n')}
                        onChange={(e) => setServicosInclusos(e.target.value.split('\n'))}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium h-32"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Termos de Garantia / Responsabilidade</label>
                      <textarea 
                        value={termosGarantia}
                        onChange={(e) => setTermosGarantia(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium h-24"
                      />
                    </div>
                  </div>
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="receipt-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Serviço Realizado (Recibo)</label>
                      <textarea 
                        value={receiptData.servicoRealizado}
                        onChange={(e) => setReceiptData({...receiptData, servicoRealizado: e.target.value})}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all font-medium h-20"
                      />
                    </div>
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Visual Preview */}
        <div className="space-y-6">
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm sticky top-6 font-serif">
            <div className="border p-8 relative">
              {/* Header Info */}
              <div className="text-center mb-6 border-b pb-4">
                <p className="text-sm font-bold text-slate-800 uppercase tracking-wider">{companyDetails.fullName}</p>
                <p className="text-xs text-slate-500 mt-1">CNPJ: {companyDetails.cnpj}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{companyDetails.address}</p>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'proposta' ? (
                  <motion.div
                    key="proposal-preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Proposal Preview */}
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
                        {servicosInclusos.map((s, idx) => (
                          s.trim() && <li key={idx}>{s}</li>
                        ))}
                      </ul>
                      <div className="mt-4 grid grid-cols-2 gap-4 text-[10px] text-slate-600">
                        <p><span className="font-bold">Validade:</span> {proposalData.validade}</p>
                        <p><span className="font-bold">Prazo:</span> {proposalData.prazoExecucao}</p>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 italic">{termosGarantia}</p>
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
                  </motion.div>
                ) : (
                  <motion.div
                    key="receipt-preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Receipt Preview */}
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
                        <p className="text-[10px] font-bold text-slate-800">{companyDetails.name}</p>
                        <p className="text-[8px] text-slate-400">RESPONSÁVEL TÉCNICO</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-4 flex justify-center">
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Printer size={10} /> Visualização de impressão. Use o botão acima para exportar em alta qualidade.
                </p>
            </div>
          </section>
        </div>
      </div>

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
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        record.tipo === 'proposta' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {record.tipo}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{record.nomeCliente}</span>
                      <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                        {record.tipo === 'proposta' ? record.numeroSistema : `#${record.numeroRecibo}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <DollarSign size={10} /> 
                        R$ {(record.tipo === 'proposta' ? record.valorAvulso : record.valorPago)?.toLocaleString('pt-BR')}
                      </span>
                      <span className="flex items-center gap-1"><Calendar size={10} /> {record.createdAt?.toDate ? record.createdAt.toDate().toLocaleDateString('pt-BR') : '---'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (record.tipo) setActiveTab(record.tipo as any);
                      if (record.companyDetails) setCompanyDetails(record.companyDetails);
                      if (record.servicosInclusos) setServicosInclusos(record.servicosInclusos);
                      if (record.termosGarantia) setTermosGarantia(record.termosGarantia);

                      setProposalData({
                        nomeCliente: record.nomeCliente,
                        endereco: record.endereco,
                        numeroSistema: record.numeroSistema,
                        validade: record.validade,
                        prazoExecucao: record.prazoExecucao,
                        valorAvulso: record.valorAvulso,
                        valorPlanoAnual: record.valorPlanoAnual,
                      });
                      if (record.tipo === 'recibo') {
                        setReceiptData({
                          numeroRecibo: record.numeroRecibo,
                          dataPagamento: record.dataPagamento,
                          valor: record.valorPago,
                          formaPagamento: record.formaPagamento,
                          servicoRealizado: record.servicoRealizado,
                        });
                      }
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
