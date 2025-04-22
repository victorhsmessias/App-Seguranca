import React, { useRef, useCallback, useState, useEffect } from 'react';
import Webcam from 'react-webcam';

const Camera = ({ onCapture, onCancel }) => {
  const webcamRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Verificar permissões da câmera
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(() => setHasPermission(true))
      .catch((error) => {
        console.error('Erro ao acessar câmera:', error);
        setHasPermission(false);
        setErrorMsg('Não foi possível acessar a câmera. Verifique as permissões.');
      });
  }, []);

  const capture = useCallback(() => {
    // Iniciar contagem regressiva antes de capturar
    setCountdown(3);
    
    const countdownInterval = setInterval(() => {
      setCountdown((prevCount) => {
        if (prevCount <= 1) {
          clearInterval(countdownInterval);
          
          // Capturar imagem
          const imageSrc = webcamRef.current?.getScreenshot();
          
          if (!imageSrc) {
            setErrorMsg('Não foi possível capturar a imagem. Tente novamente.');
            return null;
          }
          
          // Verificar qualidade da imagem (exemplo básico)
          const img = new Image();
          img.onload = () => {
            // Verificar se a imagem não está toda preta ou toda branca
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);
            
            // Obter dados de pixels
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Verificar variação de cores (simplificado)
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) {
              sum += data[i] + data[i + 1] + data[i + 2];
            }
            
            const avg = sum / (data.length / 4) / 3;
            const isValid = avg > 20 && avg < 235; // Não totalmente preto ou branco
            
            if (isValid) {
              onCapture(imageSrc);
            } else {
              setErrorMsg('Imagem muito escura ou clara. Tente novamente.');
              setCountdown(null);
            }
          };
          
          img.src = imageSrc;
          return null;
        }
        return prevCount - 1;
      });
    }, 1000);
    
  }, [webcamRef, onCapture]);

  // Se não tem permissão da câmera
  if (hasPermission === false) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-[9999]">
        <div className="bg-white rounded-lg overflow-hidden max-w-md w-full p-6 text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold mb-2">Acesso à câmera negado</h3>
          <p className="text-gray-600 mb-4">{errorMsg || 'Para verificar sua identidade, precisamos acessar sua câmera. Por favor, verifique as permissões no seu navegador.'}</p>
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
        
        <div className="relative">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            videoConstraints={{
              facingMode: "user",
              width: 640,
              height: 480,
            }}
            mirrored={true}
            className="border-b"
          />
          
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-white text-6xl font-bold">
                {countdown > 0 ? countdown : '📸'}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 flex justify-center">
          <button
            onClick={capture}
            disabled={countdown !== null}
            className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full flex items-center justify-center ${countdown !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {countdown !== null ? 'Capturando...' : 'Tirar Foto'}
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