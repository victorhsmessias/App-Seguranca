import React, { useRef, useCallback, useState, useEffect } from 'react';
import Webcam from 'react-webcam';

const Camera = ({ onCapture, onCancel }) => {
  const webcamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [devices, setDevices] = useState([]);
  const [flashMode, setFlashMode] = useState('off'); // Começar com flash desligado
  const [showFlash, setShowFlash] = useState(false);

  // Função para listar dispositivos de câmera disponíveis
  const getAvailableCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('Câmeras disponíveis:', videoDevices);
      setDevices(videoDevices);
      return videoDevices.length > 0;
    } catch (error) {
      console.error('Erro ao listar dispositivos:', error);
      return false;
    }
  }, []);

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

        console.log('Solicitando acesso à câmera com:', constraints);
        
        const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao acessar câmera')), 10000);
        });
        
        activeStream = await Promise.race([streamPromise, timeoutPromise]);
        
        if (mounted) {
          console.log('Câmera inicializada com sucesso');
          setHasPermission(true);
        }
      } catch (error) {
        console.error('Erro na primeira tentativa:', error);
        
        if (mounted && error.name !== 'NotAllowedError') {
          try {
            console.log('Tentando novamente com configuração mínima');
            activeStream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: "user" } 
            });
            if (mounted) {
              console.log('Segunda tentativa bem-sucedida');
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

  //  Flash melhorado - efeito de tela branca mais visível
  const triggerFlash = useCallback(() => {
    console.log('Disparando flash...');
    setShowFlash(true);
    
    // Manter flash visível por mais tempo
    setTimeout(() => {
      setShowFlash(false);
    }, 500); // Duração do flash
  }, []);

  // Capturar imagem SEM verificação de qualidade
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
            // Disparar flash se estiver ativado
            if (flashMode === 'on') {
              triggerFlash();
              
              // Pequeno delay para garantir que o flash seja visível na captura
              setTimeout(() => {
                const imageSrc = webcamRef.current?.getScreenshot();
                
                if (!imageSrc) {
                  setErrorMsg('Falha ao capturar imagem. Tente novamente.');
                  setCountdown(null);
                  return;
                }
                
                // REMOVIDO: Toda verificação de qualidade
                // Envia direto a imagem capturada
                onCapture(imageSrc);
              }, 100); // Delay para capturar com flash
            } else {
              // Sem flash, captura imediata
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
  }, [webcamRef, onCapture, isCameraReady, flashMode, triggerFlash]);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-[9999]">
      {/* Flash Effect Overlay - Mais forte e visível */}
      {showFlash && (
        <div 
          className="fixed inset-0 bg-white z-[10001] pointer-events-none"
          style={{ 
            opacity: 1,
            animation: 'flash-animation 0.4s ease-out'
          }}
        />
      )}
      
      <style jsx>{`
        @keyframes flash-animation {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      
      <div className="bg-white rounded-lg overflow-hidden max-w-md w-full mx-4 my-4">
        <div className="p-4 bg-blue-600 text-white">
          <h2 className="text-lg font-semibold text-center">Verificação de Identidade</h2>
        </div>
        
        {errorMsg && (
          <div className="p-2 bg-red-100 border-l-4 border-red-500 text-red-700">
            {errorMsg}
          </div>
        )}
        
        <div className="relative">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            videoConstraints={{
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 }
            }}
            mirrored={true}
            className="border-b"
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
        
        {/* Controles de Flash - Simplificados */}
        <div className="p-3 bg-gray-100 flex justify-center gap-4">
          <button
            onClick={() => setFlashMode('off')}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              flashMode === 'off' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title="Flash desligado"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-medium">Flash Off</span>
          </button>
          
          <button
            onClick={() => setFlashMode('on')}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              flashMode === 'on' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title="Flash ligado"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm font-medium">Flash On</span>
          </button>
        </div>
        
        {/*  Área de botões ajustada - Mais espaço e melhor posicionamento */}
        <div className="p-4 pb-6 space-y-3">
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
  );
};

export default Camera;