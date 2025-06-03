import React, { useRef, useCallback, useState, useEffect } from 'react';
import Webcam from 'react-webcam';

const Camera = ({ onCapture, onCancel }) => {
  const webcamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [devices, setDevices] = useState([]);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [stream, setStream] = useState(null);
  const [brightness, setBrightness] = useState(0);
  const [useScreenLight, setUseScreenLight] = useState(false);
  const [flashSupport, setFlashSupport] = useState('checking'); // 'checking', 'torch', 'screen', 'none'

  // Função para ativar/desativar lanterna
  const toggleTorch = useCallback(async () => {
    try {
      // Primeiro, tentar ativar a lanterna real do dispositivo
      if (stream) {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
                
        // Verificar se o dispositivo suporta torch
        if (capabilities && capabilities.torch) {
          const currentSettings = track.getSettings();
          const newTorchState = !currentSettings.torch;          
          await track.applyConstraints({
            advanced: [{ 
              torch: newTorchState,
              // Adicionar outras configurações que podem ajudar
              exposureMode: 'manual',
              exposureCompensation: newTorchState ? 2 : 0
            }]
          });
          
          setTorchEnabled(newTorchState);
          return;
        }
      }
      
      // Se não tem torch ou falhou, usar flash de tela
      setUseScreenLight(!useScreenLight);
      
    } catch (error) {
      console.error('Erro ao controlar flash:', error);
      // Fallback garantido: usar flash da tela
      setUseScreenLight(!useScreenLight);
    }
  }, [stream, useScreenLight]);

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

  // Função para verificar suporte a flash
  const checkFlashSupport = useCallback(async (streamToCheck) => {
    if (!streamToCheck) {
      setFlashSupport('none');
      return;
    }
    
    try {
      const track = streamToCheck.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      
      if (capabilities && capabilities.torch) {
        setFlashSupport('torch');
      } else {
        setFlashSupport('screen');
      }
    } catch (error) {
      setFlashSupport('screen');
    }
  }, []);

  // Processar imagem para melhorar visibilidade em baixa luz
  const enhanceImage = (canvas, context) => {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Calcular brilho médio
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    
    // Se a imagem estiver muito escura, aplicar melhorias
    if (avgBrightness < 60) {
      // Aumentar brilho e contraste
      const brightnessFactor = 1.5;
      const contrastFactor = 1.3;
      
      for (let i = 0; i < data.length; i += 4) {
        // Aplicar brilho
        data[i] = Math.min(255, data[i] * brightnessFactor);
        data[i + 1] = Math.min(255, data[i + 1] * brightnessFactor);
        data[i + 2] = Math.min(255, data[i + 2] * brightnessFactor);
        
        // Aplicar contraste
        data[i] = Math.min(255, ((data[i] - 128) * contrastFactor) + 128);
        data[i + 1] = Math.min(255, ((data[i + 1] - 128) * contrastFactor) + 128);
        data[i + 2] = Math.min(255, ((data[i + 2] - 128) * contrastFactor) + 128);
      }
      
      // Aplicar redução de ruído simples
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const idx = (y * canvas.width + x) * 4;
          
          // Média com pixels vizinhos para reduzir ruído
          for (let c = 0; c < 3; c++) {
            const sum = 
              data[idx + c] * 4 +
              data[idx - 4 + c] + data[idx + 4 + c] +
              data[idx - canvas.width * 4 + c] + data[idx + canvas.width * 4 + c];
            data[idx + c] = sum / 8;
          }
        }
      }
    }
    
    context.putImageData(imageData, 0, 0);
    setBrightness(avgBrightness);
  };

  // Inicializar câmera com configurações otimizadas para baixa luz
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

        // Sempre usar câmera frontal para verificação de identidade
        const selectedCamera = "user";

        // Configurações otimizadas para baixa luz
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: selectedCamera,
            // Configurações avançadas para melhor captura em baixa luz
            advanced: [
              {
                exposureMode: 'continuous',
                whiteBalanceMode: 'continuous',
                focusMode: 'continuous',
                torch: false // Inicialmente desligado
              }
            ]
          },
          audio: false
        };
        
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(activeStream);
        
        if (mounted) {
          setHasPermission(true);
          // Verificar capacidades da câmera
          const track = activeStream.getVideoTracks()[0];
          const capabilities = track.getCapabilities();
          const settings = track.getSettings();
          // Verificar suporte a flash
          await checkFlashSupport(activeStream);
        }
      } catch (error) {
        console.error('Erro na primeira tentativa:', error);
        
        // Segunda tentativa com configuração mais simples
        if (mounted && error.name !== 'NotAllowedError') {
          try {
            activeStream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: "user" } 
            });
            setStream(activeStream);
            if (mounted) {
              setHasPermission(true);
              // Verificar suporte a flash também na segunda tentativa
              await checkFlashSupport(activeStream);
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
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [getAvailableCameras, checkFlashSupport]);

  // Capturar imagem com melhorias
  const capture = useCallback(() => {
    if (!webcamRef.current || !isCameraReady) {
      setErrorMsg('Câmera não está pronta para captura');
      return;
    }

    // Vibrar o dispositivo se suportado
    if ('vibrate' in navigator) {
      navigator.vibrate(50); // Vibração curta de feedback
    }

    // Em ambientes escuros, ativar flash automaticamente se não estiver ativo
    if (brightness > 0 && brightness < 60 && !torchEnabled && !useScreenLight) {
      toggleTorch();
      // Pequeno delay para garantir que o flash esteja ativo
      setTimeout(() => {
        startCountdown();
      }, 300);
    } else {
      startCountdown();
    }
    
    function startCountdown() {
      setCountdown(3);
      
      const countdownInterval = setInterval(() => {
        setCountdown((prevCount) => {
          if (prevCount <= 1) {
            clearInterval(countdownInterval);
            
            // Pequeno delay para garantir que o flash esteja ativo
            setTimeout(() => {
              try {
                const imageSrc = webcamRef.current?.getScreenshot();
                
                if (!imageSrc) {
                  setErrorMsg('Falha ao capturar imagem. Tente novamente.');
                  return;
                }
                
                // Processar imagem para melhorar qualidade em baixa luz
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  canvas.width = img.width;
                  canvas.height = img.height;
                  context.drawImage(img, 0, 0);
                  
                  // Aplicar melhorias de imagem
                  enhanceImage(canvas, context);
                  
                  // Adicionar informações sobre condições de luz
                  context.font = '12px Arial';
                  context.fillStyle = brightness < 60 ? 'yellow' : 'white';
                  context.fillText(`Luz: ${brightness < 60 ? 'Baixa' : 'Normal'}`, 10, 20);
                  
                  const enhancedImageSrc = canvas.toDataURL('image/jpeg', 0.9);
                  
                  // Desligar flash após captura se foi ativado automaticamente
                  if ((torchEnabled || useScreenLight) && brightness < 60) {
                    setTimeout(() => {
                      toggleTorch();
                    }, 500);
                  }
                  
                  onCapture(enhancedImageSrc);
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
            }, 500);
            
            return null;
          }
          return prevCount - 1;
        });
      }, 1000);
    }
  }, [webcamRef, onCapture, isCameraReady, brightness, torchEnabled, useScreenLight, toggleTorch]);

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
    <div className={`fixed inset-0 bg-black bg-opacity-75 z-[9999] ${useScreenLight ? 'bg-white' : ''}`}>
      {/* Flash de tela para iluminação */}
      {useScreenLight && (
        <div className="fixed inset-0 bg-white opacity-90 z-[10000]" />
      )}
      
      {/* Container principal com altura total */}
      <div className="fixed inset-0 flex flex-col z-[10001]">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 shadow-lg">
          <h2 className="text-lg font-semibold text-center">Verificação de Identidade</h2>
          {brightness > 0 && brightness < 60 && (
            <p className="text-sm text-center mt-1 text-yellow-200">
              ⚠️ Ambiente com pouca luz detectado
            </p>
          )}
          {flashSupport === 'screen' && (
            <p className="text-xs text-center mt-1 text-blue-200">
              💡 Toque no ícone de raio para ativar o flash de tela
            </p>
          )}
        </div>
        
        {errorMsg && (
          <div className="p-2 bg-red-100 border-l-4 border-red-500 text-red-700">
            {errorMsg}
          </div>
        )}
        
        {/* Área da câmera - ocupa o espaço disponível */}
        <div className="flex-1 relative bg-black">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            height="100%"
            videoConstraints={{
              facingMode: "user", // Sempre câmera frontal
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }}
            mirrored={true}
            className="w-full h-full object-cover"
            style={{ height: '100%' }}
            onUserMedia={() => setIsCameraReady(true)}
            onUserMediaError={(error) => {
              console.error('Erro no componente Webcam:', error);
              setErrorMsg('Erro no componente de câmera: ' + error.message);
            }}
            forceScreenshotSourceSize
          />
          
          {/* Botão de lanterna com indicador de tipo */}
          <div className="absolute top-4 right-4">
            <button
              onClick={toggleTorch}
              className={`relative p-3 rounded-full shadow-lg transition-all ${
                torchEnabled || useScreenLight 
                  ? 'bg-yellow-500 text-white' 
                  : 'bg-gray-800 bg-opacity-70 text-white hover:bg-opacity-90'
              }`}
              title={
                torchEnabled ? "Flash do dispositivo ativo" : 
                useScreenLight ? "Flash de tela ativo" : 
                "Ativar Flash"
              }
            >
              {/* Ícone de flash */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              
              {/* Indicador do tipo de flash */}
              {(torchEnabled || useScreenLight) && (
                <span className="absolute -bottom-2 -right-2 bg-black text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {torchEnabled ? '💡' : '📱'}
                </span>
              )}
            </button>
            
            {/* Tooltip informativo */}
            {(torchEnabled || useScreenLight) && (
              <div className="absolute top-full right-0 mt-2 bg-black bg-opacity-90 text-white text-xs rounded-lg p-2 whitespace-nowrap">
                {torchEnabled ? 'Flash do dispositivo' : 'Flash de tela (fallback)'}
              </div>
            )}
          </div>
          
          {/* Botão de cancelar no canto superior esquerdo */}
          <button 
            onClick={onCancel}
            className="absolute top-4 left-4 p-3 rounded-full bg-gray-800 bg-opacity-70 text-white shadow-lg"
            title="Cancelar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-white text-6xl font-bold animate-pulse">
                {countdown > 0 ? countdown : '📸'}
              </div>
            </div>
          )}
          
          {/* Botão de captura flutuante */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/70 to-transparent">
            <button
              onClick={capture}
              disabled={countdown !== null || !isCameraReady}
              className={`w-20 h-20 mx-auto block rounded-full border-4 border-white bg-white shadow-2xl transition-all ${
                (countdown !== null || !isCameraReady) 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:scale-110 active:scale-95'
              }`}
              style={{
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
              }}
            >
              <div className={`w-full h-full rounded-full flex items-center justify-center ${
                (countdown !== null || !isCameraReady)
                  ? 'bg-gray-300'
                  : 'bg-red-500'
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            
            {/* Texto indicativo */}
            <p className="text-white text-center mt-3 text-sm">
              {countdown !== null ? 'Capturando...' : (isCameraReady ? 'Toque para tirar foto' : 'Aguardando câmera...')}
            </p>
          </div>
        </div>
        
        {/* Dicas para melhor captura - aparece como overlay se necessário */}
        {brightness > 0 && brightness < 60 && !countdown && (
          <div className="absolute bottom-32 left-4 right-4 bg-black bg-opacity-80 rounded-lg p-3 text-white text-xs">
            <p className="font-semibold mb-1">💡 Dicas para melhor foto:</p>
            <ul className="space-y-1">
              <li>• Use o botão de flash no canto superior</li>
              <li>• Aproxime-se de uma fonte de luz</li>
              <li>• Mantenha o dispositivo estável</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Camera;