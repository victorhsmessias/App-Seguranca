import React, { useRef, useCallback, useState, useEffect } from 'react';
import Webcam from 'react-webcam';

const Camera = ({ onCapture, onCancel }) => {
  const webcamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [devices, setDevices] = useState([]);
  const [flashMode, setFlashMode] = useState('auto'); // Mudado para 'auto' por padrão
  const [showFlash, setShowFlash] = useState(false);
  const [isLowLight, setIsLowLight] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Detectar iOS
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);
  }, [isIOS]);

  // Função para listar dispositivos de câmera disponíveis
  const getAvailableCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
      return videoDevices.length > 0;
    } catch (error) {
      console.error('Erro ao listar dispositivos:', error);
      return false;
    }
  }, []);

  // Aplicar estilos globais para máximo brilho durante flash
  useEffect(() => {
    if (showFlash) {
      // Adicionar meta tag temporária para brilho máximo (funciona em alguns dispositivos)
      const metaBrightness = document.createElement('meta');
      metaBrightness.name = 'brightness';
      metaBrightness.content = 'maximum';
      document.head.appendChild(metaBrightness);
      
      // Forçar repaint para garantir aplicação dos estilos
      document.body.style.transform = 'translateZ(0)';
      
      return () => {
        // Limpar meta tag quando flash terminar
        if (metaBrightness.parentNode) {
          metaBrightness.parentNode.removeChild(metaBrightness);
        }
        document.body.style.transform = '';
      };
    }
  }, [showFlash]);

  // Detectar condições de baixa luminosidade
  useEffect(() => {
    if (!webcamRef.current || !isCameraReady) return;
    
    const checkLightConditions = () => {
      try {
        const video = webcamRef.current?.video;
        if (!video) return;
        
        // Criar canvas temporário para análise
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 100; // Tamanho reduzido para performance
        canvas.height = 100;
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Calcular luminosidade média
        let brightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Fórmula de luminosidade perceptual
          brightness += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        brightness = brightness / (data.length / 4);
        
        // Considerar baixa luminosidade se < 70 (0-255)
        setIsLowLight(brightness < 70);
      } catch (error) {
        console.error('Erro ao verificar luminosidade:', error);
      }
    };
    
    // Verificar a cada 2 segundos
    const interval = setInterval(checkLightConditions, 2000);
    // Verificar imediatamente
    checkLightConditions();
    
    return () => clearInterval(interval);
  }, [isCameraReady]);

  // Inicializar câmera
  useEffect(() => {
    let mounted = true;
    let activeStream = null;

    const initCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Seu navegador não suporta acesso à câmera');
        }

        const hasDevices = await getAvailableCameras();
        if (!hasDevices) {
          throw new Error('Nenhuma câmera detectada no dispositivo');
        }

        const constraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
          },
          audio: false
        };

        
        const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao acessar câmera')), 10000);
        });
        
        activeStream = await Promise.race([streamPromise, timeoutPromise]);
        
        if (mounted) {
          setHasPermission(true);
        }
      } catch (error) {
        console.error('Erro na primeira tentativa:', error);
        
        if (mounted && error.name !== 'NotAllowedError') {
          try {
            activeStream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: "user" } 
            });
            if (mounted) {
              setHasPermission(true);
            }
          } catch (secondError) {
            handleCameraError(secondError);
          }
        } else {
          handleCameraError(error);
        }
      }
    };

    const handleCameraError = (error) => {
      if (!mounted) return;
      
      console.error('Erro detalhado:', error.name, error.message);
      setHasPermission(false);
      
      if (error.name === 'NotAllowedError') {
        setErrorMsg('Acesso à câmera negado. Por favor, permita o acesso nas configurações do navegador.');
      } else if (error.name === 'NotFoundError') {
        setErrorMsg('Nenhuma câmera encontrada no dispositivo.');
      } else if (error.name === 'NotReadableError') {
        setErrorMsg('Sua câmera já está sendo usada por outro aplicativo.');
      } else if (error.name === 'OverconstrainedError') {
        setErrorMsg('Sua câmera não atende aos requisitos necessários.');
      } else {
        setErrorMsg(`Erro ao acessar câmera: ${error.message}`);
      }
    };

    initCamera();

    return () => {
      mounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [getAvailableCameras]);

  // Flash melhorado com controle de intensidade e brilho máximo
  const triggerFlash = useCallback(async () => {
    // Salvar configurações originais
    const originalBrightness = window.screen?.brightness;
    
    // 1. Tentar Wake Lock API para manter tela ativa com brilho máximo
    let wakeLock = null;
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.log('Wake Lock não disponível:', err);
    }
    
    // 2. Tentar aumentar brilho via Screen API (funciona em alguns Android)
    if (window.screen?.brightness !== undefined) {
      try {
        window.screen.brightness = 1.0; // Máximo brilho
      } catch (err) {
        console.log('Não foi possível ajustar brilho:', err);
      }
    }
    
    // 3. Adicionar classe ao body para forçar brilho máximo via CSS
    document.body.classList.add('flash-active-max-brightness');
    
    const isIOSDevice = isIOS; // Capturar valor no escopo da função
    
    // 4. Criar elemento fullscreen branco temporário
    const flashOverlay = document.createElement('div');
    
    // Configurações específicas para iOS
    if (isIOSDevice) {
      flashOverlay.style.cssText = `
        position: fixed;
        top: -100%;
        left: -100%;
        width: 300%;
        height: 300%;
        background: white;
        z-index: 999999;
        pointer-events: none;
        -webkit-transform: translate3d(0,0,0);
        transform: translate3d(0,0,0);
      `;
      
      // No iOS, forçar renderização de hardware
      document.documentElement.style.webkitTransform = 'scale(1)';
    } else {
      flashOverlay.style.cssText = `
        position: fixed;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: white;
        z-index: 999999;
        pointer-events: none;
      `;
    }
    document.body.appendChild(flashOverlay);
    
    // 5. Desabilitar temporariamente economia de energia (se possível)
    const metaViewport = document.querySelector('meta[name="viewport"]');
    const originalViewport = metaViewport?.content;
    if (metaViewport) {
      metaViewport.content = originalViewport + ', user-scalable=no';
    }
    
    setShowFlash(true);
    
    // Manter o flash por mais tempo para garantir iluminação adequada
    setTimeout(async () => {
      setShowFlash(false);
      
      // Remover overlay extra
      if (flashOverlay && flashOverlay.parentNode) {
        flashOverlay.parentNode.removeChild(flashOverlay);
      }
      
      // Remover classe do body
      document.body.classList.remove('flash-active-max-brightness');
      
      // Limpar transformação do iOS
      if (isIOSDevice) {
        document.documentElement.style.webkitTransform = '';
      }
      
      // Restaurar viewport
      if (metaViewport && originalViewport) {
        metaViewport.content = originalViewport;
      }
      
      // Liberar Wake Lock
      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch (err) {
          console.log('Erro ao liberar Wake Lock:', err);
        }
      }
      
      // Restaurar brilho original
      if (window.screen?.brightness !== undefined && originalBrightness !== undefined) {
        try {
          window.screen.brightness = originalBrightness;
        } catch (err) {
          console.log('Erro ao restaurar brilho:', err);
        }
      }
    }, 1800); // Aumentado para 1.8 segundos
  }, []);

  // Capturar imagem com flash aprimorado
  const capture = useCallback(() => {
    if (!webcamRef.current || !isCameraReady) {
      setErrorMsg('Câmera não está pronta para captura');
      return;
    }

    setCountdown(3);
    
    const countdownInterval = setInterval(() => {
      setCountdown((prevCount) => {
        if (prevCount <= 1) {
          clearInterval(countdownInterval);
          
          try {
            // Determinar se deve usar flash
            const shouldUseFlash = flashMode === 'on' || (flashMode === 'auto' && isLowLight);
            
            if (shouldUseFlash) {
              // Ativar flash ANTES da captura
              triggerFlash();
              
              // Aguardar o flash estar totalmente ativo antes de capturar
              setTimeout(() => {
                const imageSrc = webcamRef.current?.getScreenshot();
                
                if (!imageSrc) {
                  setErrorMsg('Falha ao capturar imagem. Tente novamente.');
                  setCountdown(null);
                  return;
                }
                
                // Pequeno delay adicional para garantir que a foto foi tirada com flash
                setTimeout(() => {
                  onCapture(imageSrc);
                }, 200); // Aumentado para garantir captura no pico do brilho
              }, 800); // Aumentado para capturar no momento de máximo brilho
            } else {
              const imageSrc = webcamRef.current?.getScreenshot();
              
              if (!imageSrc) {
                setErrorMsg('Falha ao capturar imagem. Tente novamente.');
                setCountdown(null);
                return;
              }
              
              onCapture(imageSrc);
            }
          } catch (error) {
            console.error('Erro na captura:', error);
            setErrorMsg('Erro ao capturar: ' + error.message);
            setCountdown(null);
          }
          
          return null;
        }
        return prevCount - 1;
      });
    }, 1000);
  }, [webcamRef, onCapture, isCameraReady, flashMode, triggerFlash, isLowLight]);

  // Estado de carregando
  if (hasPermission === null) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-[9999]">
        <div className="bg-white rounded-lg overflow-hidden max-w-md w-full p-6 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold mb-2">Inicializando câmera...</h3>
          <p className="text-gray-600 mb-4">Por favor, aguarde enquanto acessamos sua câmera.</p>
        </div>
      </div>
    );
  }

  // Se não tem permissão
  if (hasPermission === false) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-[9999]">
        <div className="bg-white rounded-lg overflow-hidden max-w-md w-full p-6 text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold mb-2">Acesso à câmera negado</h3>
          <p className="text-gray-600 mb-4">{errorMsg || 'Para verificar sua identidade, precisamos acessar sua câmera.'}</p>
          <button 
            onClick={onCancel}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // SOLUÇÃO COM SCROLL - Layout que garante visibilidade do botão
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-[9999] p-4">
      {/* Flash Effect Overlay - Melhorado para máxima iluminação */}
      {showFlash && (
        <>
          {/* Múltiplas camadas para garantir máximo brilho */}
          <div className="fixed inset-0 bg-white z-[10001] pointer-events-none" 
              style={{ 
                opacity: 1,
                backgroundColor: '#FFFFFF',
                mixBlendMode: 'normal'
              }} />
          <div className="fixed inset-0 bg-white z-[10002] pointer-events-none" 
              style={{ 
                opacity: 1,
                backgroundColor: '#FFFFFF',
                boxShadow: 'inset 0 0 100vw 100vw rgba(255,255,255,0.9)'
              }} />
          <div className="fixed inset-0 z-[10003] pointer-events-none" 
              style={{ 
                background: 'radial-gradient(circle at center, #FFFFFF 0%, #FFFFFF 40%, #FAFAFA 70%, #F5F5F5 100%)',
                opacity: 1 
              }} />
          {/* Camada extra de luminosidade */}
          <div className="fixed inset-0 z-[10004] pointer-events-none"
              style={{
                backgroundColor: 'white',
                opacity: 0.95,
                filter: 'brightness(1.5) contrast(1.2)'
              }} />
          {/* Camada adicional para dispositivos com tela OLED/AMOLED */}
          <div className="fixed inset-0 z-[10005] pointer-events-none"
              style={{
                backgroundColor: '#FFFFFF',
                opacity: 1,
                transform: 'scale(1.1)',
                filter: 'blur(0px) brightness(1.3)'
              }} />
          {/* Elemento de reforço para brilho máximo */}
          <div className="fixed inset-0 z-[10006] pointer-events-none"
              style={{
                background: 'linear-gradient(0deg, white 0%, white 100%)',
                mixBlendMode: 'screen',
                opacity: 1
              }} />
        </>
      )}
      
      <style jsx>{`
        @keyframes flash-animation {
          0% { opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        .flash-overlay {
          animation: flash-animation 1.5s ease-in-out;
        }
        
        /* Forçar máximo brilho durante o flash */
        .flash-active {
          filter: brightness(2) contrast(1.1);
        }
        
        /* CSS para maximizar brilho da tela durante flash */
        :global(.flash-active-max-brightness) {
          filter: brightness(1.5) !important;
        }
        
        :global(.flash-active-max-brightness *) {
          filter: brightness(1.2) !important;
          opacity: 1 !important;
        }
        
        /* Forçar tela a ficar acordada e brilhante */
        @media screen {
          :global(.flash-active-max-brightness) {
            backface-visibility: hidden !important;
            -webkit-backface-visibility: hidden !important;
            transform: translateZ(0) !important;
            -webkit-transform: translateZ(0) !important;
          }
        }
      `}</style>
      
      {/* Container com altura máxima e scroll se necessário */}
      <div className="bg-white rounded-lg overflow-auto max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header fixo */}
        <div className="p-4 bg-blue-600 text-white flex-shrink-0">
          <h2 className="text-lg font-semibold text-center">Verificação de Identidade</h2>
        </div>
        
        {errorMsg && (
          <div className="p-2 bg-red-100 border-l-4 border-red-500 text-red-700 flex-shrink-0">
            {errorMsg}
          </div>
        )}
        
        {/* Área da câmera com altura fixa */}
        <div className="relative flex-shrink-0" style={{ height: '300px' }}>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            height="100%"
            videoConstraints={{
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 }
            }}
            mirrored={true}
            className="h-full object-cover"
            onUserMedia={() => setIsCameraReady(true)}
            onUserMediaError={(error) => {
              console.error('Erro no componente Webcam:', error);
              setErrorMsg('Erro no componente de câmera: ' + error.message);
            }}
            forceScreenshotSourceSize
          />
          
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-white text-6xl font-bold animate-pulse">
                {countdown > 0 ? countdown : '📸'}
              </div>
            </div>
          )}
        </div>
        
        {/* Controles na parte inferior - sempre visíveis */}
        <div className="mt-auto flex-shrink-0">
          {/* Controles de Flash */}
          <div className="p-3 bg-gray-100">
            {/* Indicador de baixa luminosidade */}
            {isLowLight && flashMode === 'auto' && (
              <div className="text-center mb-2">
                <p className="text-sm text-yellow-600 flex items-center justify-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M11 3L8 8H3l7 8v-5h5l-4-8z" />
                  </svg>
                  Baixa luminosidade detectada - Flash será ativado
                </p>
              </div>
            )}
            
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setFlashMode('off')}
                className={`px-3 py-2 rounded flex items-center gap-1 text-sm ${
                  flashMode === 'off' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="font-medium">Off</span>
              </button>
              
              <button
                onClick={() => setFlashMode('auto')}
                className={`px-3 py-2 rounded flex items-center gap-1 text-sm ${
                  flashMode === 'auto' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11 3L8 8H3l7 8v-5h5l-4-8z" />
                  <text x="12" y="18" fontSize="8" fontWeight="bold">A</text>
                </svg>
                <span className="font-medium">Auto</span>
              </button>
              
              <button
                onClick={() => setFlashMode('on')}
                className={`px-3 py-2 rounded flex items-center gap-1 text-sm ${
                  flashMode === 'on' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-medium">On</span>
              </button>
            </div>
          </div>
          
          {/* Botões de ação */}
          <div className="p-4 space-y-3">
            <button
              onClick={capture}
              disabled={countdown !== null || !isCameraReady}
              className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center transition-all ${
                (countdown !== null || !isCameraReady) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-lg">
                {countdown !== null ? 'Capturando...' : (isCameraReady ? 'Tirar Foto' : 'Aguardando câmera...')}
              </span>
            </button>
            
            <button 
              onClick={onCancel}
              className="w-full text-gray-600 hover:text-gray-800 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Camera;