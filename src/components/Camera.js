import React, { useRef, useCallback, useState, useEffect } from 'react';
import Webcam from 'react-webcam';

const Camera = ({ onCapture, onCancel }) => {
  const webcamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [devices, setDevices] = useState([]);
  
  // Estados para Flash
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [currentStream, setCurrentStream] = useState(null);
  const [flashMode, setFlashMode] = useState('auto'); // 'off', 'on', 'auto'
  const [lowLightDetected, setLowLightDetected] = useState(false);
  
  // Detectar suporte a flash/torch
  const checkTorchSupport = useCallback(async (stream) => {
    if (!stream) return false;
    
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return false;
      
      // Verificar se o dispositivo suporta torch
      const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
      
      console.log('Capacidades da câmera:', capabilities);
      console.log('Configurações atuais:', settings);
      
      // Verificar se torch está disponível
      if ('torch' in capabilities || 'torch' in settings) {
        setTorchSupported(true);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Erro ao verificar suporte a torch:', error);
      return false;
    }
  }, []);
  
  // Controlar Flash/Torch
  const toggleTorch = useCallback(async () => {
    if (!currentStream || !torchSupported) return;
    
    try {
      const videoTrack = currentStream.getVideoTracks()[0];
      const newTorchState = !torchEnabled;
      
      await videoTrack.applyConstraints({
        advanced: [{ torch: newTorchState }]
      });
      
      setTorchEnabled(newTorchState);
      console.log('Torch:', newTorchState ? 'LIGADO' : 'DESLIGADO');
    } catch (error) {
      console.error('Erro ao controlar torch:', error);
      setErrorMsg('Não foi possível controlar o flash');
    }
  }, [currentStream, torchSupported, torchEnabled]);
  
  // Detectar condições de baixa luz
  const detectLowLight = useCallback(() => {
    if (!webcamRef.current) return;
    
    try {
      const video = webcamRef.current.video;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Calcular brilho médio
      let brightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      brightness = brightness / (data.length / 4);
      
      // Se brilho < 60, considerar baixa luz
      const isLowLight = brightness < 60;
      setLowLightDetected(isLowLight);
      
      // Auto-ativar flash se estiver no modo automático
      if (flashMode === 'auto' && isLowLight && torchSupported && !torchEnabled) {
        toggleTorch();
      }
      
      return isLowLight;
    } catch (error) {
      console.error('Erro ao detectar luz:', error);
      return false;
    }
  }, [flashMode, torchSupported, torchEnabled, toggleTorch]);
  
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

  // Inicializar câmera com mais robustez
  useEffect(() => {
    let mounted = true;
    let activeStream = null;
    let lightCheckInterval = null;

    const initCamera = async () => {
      try {
        // Verificar se a API é suportada
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Seu navegador não suporta acesso à câmera');
        }

        // Verificar dispositivos disponíveis
        const hasDevices = await getAvailableCameras();
        if (!hasDevices) {
          throw new Error('Nenhuma câmera detectada no dispositivo');
        }

        // Configuração para sempre usar a câmera frontal (user)
        const constraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user" // Sempre usa câmera frontal
          },
          audio: false
        };

        console.log('Solicitando acesso à câmera com:', constraints);
        
        // Adicionar timeout para evitar travamentos
        const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao acessar câmera')), 10000);
        });
        
        activeStream = await Promise.race([streamPromise, timeoutPromise]);
        
        if (mounted) {
          console.log('Câmera inicializada com sucesso');
          setHasPermission(true);
          setCurrentStream(activeStream);
          
          // Verificar suporte a torch
          const hasTorch = await checkTorchSupport(activeStream);
          console.log('Suporte a torch:', hasTorch);
          
          // Iniciar detecção de luz ambiente
          if (hasTorch) {
            lightCheckInterval = setInterval(() => {
              detectLowLight();
            }, 2000); // Verificar a cada 2 segundos
          }
        }
      } catch (error) {
        console.error('Erro na primeira tentativa:', error);
        
        // Segunda tentativa com configuração mais simples
        if (mounted && error.name !== 'NotAllowedError') {
          try {
            console.log('Tentando novamente com configuração mínima');
            activeStream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: "user" } 
            });
            if (mounted) {
              console.log('Segunda tentativa bem-sucedida');
              setHasPermission(true);
              setCurrentStream(activeStream);
              checkTorchSupport(activeStream);
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

    // Cleanup
    return () => {
      mounted = false;
      if (lightCheckInterval) {
        clearInterval(lightCheckInterval);
      }
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [getAvailableCameras, checkTorchSupport, detectLowLight]);

  // Função de flash simulado (tela branca)
  const simulateFlash = useCallback(() => {
    const flashDiv = document.createElement('div');
    flashDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: white;
      z-index: 10000;
      pointer-events: none;
      animation: flashAnimation 0.3s ease-out;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes flashAnimation {
        0% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(flashDiv);
    
    setTimeout(() => {
      flashDiv.remove();
      style.remove();
    }, 300);
  }, []);

  // Capturar imagem com verificação de qualidade
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
            // Se flash está ativado ou no modo auto com baixa luz
            const shouldFlash = flashMode === 'on' || 
                              (flashMode === 'auto' && lowLightDetected && !torchSupported);
            
            if (shouldFlash && !torchEnabled) {
              simulateFlash();
            }
            
            const imageSrc = webcamRef.current?.getScreenshot();
            
            if (!imageSrc) {
              setErrorMsg('Falha ao capturar imagem. Tente novamente.');
              return null;
            }
            
            // Desligar torch após captura
            if (torchEnabled) {
              toggleTorch();
            }
            
            // Verificar qualidade da imagem
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.width = img.width;
              canvas.height = img.height;
              context.drawImage(img, 0, 0);
              
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              const data = imageData.data;
              
              // Análise simplificada de qualidade
              let sum = 0;
              for (let i = 0; i < data.length; i += 4) {
                sum += data[i] + data[i + 1] + data[i + 2];
              }
              
              const avg = sum / (data.length / 4) / 3;
              const isValid = avg > 20 && avg < 235;
              
              if (isValid) {
                onCapture(imageSrc);
              } else {
                setErrorMsg('Imagem muito escura ou clara. Verifique a iluminação.');
                setCountdown(null);
              }
            };
            
            img.onerror = () => {
              setErrorMsg('Erro ao processar a imagem.');
              setCountdown(null);
            };
            
            img.src = imageSrc;
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
  }, [webcamRef, onCapture, isCameraReady, flashMode, lowLightDetected, torchSupported, torchEnabled, simulateFlash, toggleTorch]);

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
      <div className="bg-white rounded-lg overflow-hidden max-w-md w-full">
        <div className="p-4 bg-blue-600 text-white">
          <h2 className="text-lg font-semibold text-center">Verificação de Identidade</h2>
        </div>
        
        {errorMsg && (
          <div className="p-2 bg-red-100 border-l-4 border-red-500 text-red-700">
            {errorMsg}
          </div>
        )}
        
        {/* Indicador de baixa luz */}
        {lowLightDetected && (
          <div className="p-2 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
            <span>Ambiente escuro detectado - {torchSupported ? 'Flash ativado' : 'Aproxime-se de uma fonte de luz'}</span>
          </div>
        )}
        
        <div className="relative">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            videoConstraints={{
              facingMode: "user", // Sempre usar câmera frontal
              width: { ideal: 640 },
              height: { ideal: 480 }
            }}
            mirrored={true} // Espelhar para melhor experiência com câmera frontal
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
              <div className="text-white text-6xl font-bold">
                {countdown > 0 ? countdown : '📸'}
              </div>
            </div>
          )}
        </div>
        
        {/* Controles de Flash */}
        <div className="p-3 bg-gray-100 flex justify-center gap-2">
          <button
            onClick={() => setFlashMode('off')}
            className={`px-3 py-1 rounded ${flashMode === 'off' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            title="Flash desligado"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <button
            onClick={() => setFlashMode('auto')}
            className={`px-3 py-1 rounded ${flashMode === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            title="Flash automático"
          >
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">A</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </button>
          
          <button
            onClick={() => setFlashMode('on')}
            className={`px-3 py-1 rounded ${flashMode === 'on' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            title="Flash ligado"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
          
          {torchSupported && (
            <button
              onClick={toggleTorch}
              className={`px-3 py-1 rounded ml-2 ${torchEnabled ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}
              title="Lanterna"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="p-4 flex justify-center">
          <button
            onClick={capture}
            disabled={countdown !== null || !isCameraReady}
            className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full flex items-center justify-center ${(countdown !== null || !isCameraReady) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {countdown !== null ? 'Capturando...' : (isCameraReady ? 'Tirar Foto' : 'Aguardando câmera...')}
          </button>
        </div>
        
        <div className="p-2 pb-4 text-center">
          <button 
            onClick={onCancel}
            className="text-gray-600 hover:text-gray-800 text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default Camera;