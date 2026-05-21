import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Download, 
  X, 
  Check, 
  ChevronRight, 
  Info, 
  Share, 
  MoreVertical, 
  PlusSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function MobilePWAInstall() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if loaded inside standalone mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
    };

    // Detect browser platform
    const detectPlatform = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(userAgent)) {
        setPlatform('ios');
      } else if (/android/.test(userAgent)) {
        setPlatform('android');
      } else {
        setPlatform('other');
      }
    };

    checkStandalone();
    detectPlatform();

    // Listen for the raw beforeinstallprompt for native Android install experience
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Trigger showing our beautiful install prompt
      if (!isStandalone) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on iOS or mobile and not standalone, show the banner guide after 3 seconds
    const timer = setTimeout(() => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true;
      
      if (!isStandaloneMode) {
        // Also show for standard mobile/tablet users
        const isMobile = /iphone|ipad|ipod|android|mobile/.test(window.navigator.userAgent.toLowerCase());
        if (isMobile) {
          setShowInstallBanner(true);
        }
      }
    }, 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, [isStandalone]);

  const triggerNativeInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted native installation');
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // Show full step-by-step instructions
      setShowGuideModal(true);
    }
  };

  if (isStandalone) {
    return null; // Running as native app already!
  }

  return (
    <>
      {/* Top/Floating Install Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-4 right-4 z-[100] max-w-lg mx-auto bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 flex items-center justify-between pointer-events-auto"
          >
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-md shadow-indigo-900/40 shrink-0">
                <Smartphone size={20} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-100">Instalar versão Mobile App 📱</h4>
                <p className="text-[10px] text-slate-400">Instale sem gastar memória do celular</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={triggerNativeInstall}
                className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-extrabold text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-sm"
              >
                {deferredPrompt ? 'Instalar' : 'Ver Como'}
              </button>
              <button 
                onClick={() => setShowInstallBanner(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual button in top bar or stats header inside App.tsx */}
      <div className="hidden md:flex">
        <button 
          onClick={() => setShowGuideModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 transition-all text-slate-700 rounded-xl text-xs font-bold cursor-pointer border border-slate-200"
        >
          <Download size={14} className="text-indigo-600" />
          <span>Versão Mobile (Android / iOS)</span>
        </button>
      </div>

      <div className="md:hidden mt-2 mb-4">
        <button 
          onClick={() => setShowGuideModal(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 transition-all text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-[0.98]"
        >
          <Smartphone size={15} />
          <span>Instalar Aplicativo no Celular</span>
        </button>
      </div>

      {/* Step-by-Step Installation Modal */}
      <AnimatePresence>
        {showGuideModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            {/* Backdrop Blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGuideModal(false)}
              className="absolute inset-0 bg-[#0f172a]/70 backdrop-blur-sm"
            />

            {/* Content Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col"
            >
              {/* Image Banner Header */}
              <div className="relative bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 text-white text-center flex flex-col items-center">
                <button 
                  onClick={() => setShowGuideModal(false)}
                  className="absolute top-4 right-4 bg-black/10 hover:bg-black/25 text-white/80 p-1.5 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
                
                <div className="bg-white/10 p-4 rounded-2xl mb-3 shadow-inner">
                  <Smartphone size={32} />
                </div>
                
                <h3 className="text-lg font-black leading-tight">Instalar Aplicativo</h3>
                <p className="text-white/70 text-[11px] mt-1 max-w-[240px]">
                  Salve o Sistema de Gestão na sua tela inicial para rápido acesso offline e em tela cheia.
                </p>
              </div>

              {/* Dynamic steps body */}
              <div className="p-6 space-y-6">
                {platform === 'ios' ? (
                  /* iOS Installation Instruction Guide */
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">No iOS (Safari) 📱</span>
                      <p className="text-sm font-semibold text-slate-800">Siga as instruções para o seu iPhone:</p>
                    </div>

                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="text-xs text-slate-600">
                          Toque no ícone de <strong className="text-slate-900 inline-flex items-center gap-0.5 bg-slate-50 px-1 py-0.5 rounded border border-slate-100"><Share size={12} className="text-indigo-600" /> Compartilhar</strong> na barra de ferramentas do Safari.
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="text-xs text-slate-600">
                          Role as opções para baixo e selecione <strong className="text-slate-900 inline-flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100"><PlusSquare size={12} /> Adicionar à Tela de Início</strong>.
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          3
                        </div>
                        <div className="text-xs text-slate-600">
                          Confirme o nome do aplicativo e toque em <strong className="text-indigo-600">Adicionar</strong> no canto superior direito.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : platform === 'android' ? (
                  /* Android Installation Instruction Guide */
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">No Android (Chrome) 🤖</span>
                      <p className="text-sm font-semibold text-slate-800">Como adicionar no seu celular:</p>
                    </div>

                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="text-xs text-slate-600">
                          Toque nos três pontinhos <strong className="text-slate-900 inline-flex items-center gap-0.5 bg-slate-50 px-1 py-0.5 rounded border border-slate-100"><MoreVertical size={12} /> Menu</strong> no canto superior direito do Chrome.
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="text-xs text-slate-600">
                          Selecione a opção <strong className="text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">Adicionar à tela inicial</strong> ou <strong className="text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">Instalar aplicativo</strong>.
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          3
                        </div>
                        <div className="text-xs text-slate-600">
                          Toque em <strong className="text-indigo-600">Confirmar / Instalar</strong> no aviso. Pronto! O app aparecerá na tela de aplicativos.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Unified Fallback Guide */
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Instalação Geral 🌐</span>
                      <p className="text-sm font-semibold text-slate-800">Funciona em qualquer celular:</p>
                    </div>

                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="text-xs text-slate-600 text-justify">
                          Abra o link do sistema no navegador padrão (Safari no iPhone ou Chrome no Android).
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex gap-3">
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="text-xs text-slate-600">
                          Use o menu do navegador (Compartilhar ou Opções) e clique em <strong className="text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">Adicionar à Tela de Início</strong>.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Benefits List */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-150 flex items-center gap-3">
                  <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-xl">
                    <Check size={16} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Suporta carregamento ultrarrápido, atualização em segundo plano e design otimizado para celulares.
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="w-full bg-slate-900 hover:bg-black active:scale-[0.98] text-white font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-md"
                >
                  Entendi, Concluído!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
