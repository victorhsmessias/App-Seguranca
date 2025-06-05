import { useEffect, useState, useCallback, useRef } from 'react';
import Camera from './components/Camera';
import { 
  getCurrentUser, 
  checkEmployeeLoginStatus,  
  checkCurrentUserStatus,    
  logout, 
  getUserRole, 
  getUserData,
  isOperationalRole,
  getRoleName 
} from './services/authService';
import { registerCheckIn } from './services/checkInService';
import { uploadImage, optimizeImage } from './services/cloudinaryService';
import { getAuth, getIdToken } from 'firebase/auth';
import Map from './components/Map';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

const SecurityApp = ({ onLogin }) => {
  // Estados existentes
  const [screen, setScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [location, setLocation] = useState(null);
  const [locationShared, setLocationShared] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const inactivityTimerRef = useRef(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isIntentionalLogout, setIsIntentionalLogout] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [statusCheckInterval, setStatusCheckInterval] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Função para redefinir o temporizador de inatividade
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Encerrar sessão após 30 minutos de inatividade
    inactivityTimerRef.current = setTimeout(() => {
      if (user) {
        setSessionExpired(true);
        handleLogout();
      }
    }, 30 * 60 * 1000);
  }, [user]);

  const checkIOSPermissions = async () => {
    // Detectar se é iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // Verificar se está em HTTPS
    if (isIOS && window.location.protocol !== 'https:') {
      alert('Para usar a localização no iOS, o aplicativo deve estar em HTTPS');
      return false;
    }
    
    // Verificar se a API de permissões está disponível
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state !== 'denied';
      } catch (error) {
        // iOS Safari não suporta permission.query para geolocation
        return true; // Tentar mesmo assim
      }
    }
    
    return true;
  };

  // Função para mostrar o título da função de forma amigável
  const getFunctionTitle = () => {
    if (!userRole) return 'Aplicativo de Monitoramento';
    return `Aplicativo de ${getRoleName(userRole)}`;
  };

  const getAuthToken = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      return await getIdToken(user, true);
    }
    return null;
  };

  const checkNetworkIntegrity = () => {
    const navigatorOnline = window.navigator.onLine;
    
    return new Promise((resolve) => {
      const start = Date.now();
      fetch('https://www.google.com/generate_204')
        .then(() => {
          const latency = Date.now() - start;
          resolve({ 
            online: navigatorOnline, 
            secure: latency > 20, 
            latency 
          });
        })
        .catch(() => {
          resolve({ online: false, secure: false, latency: -1 });
        });
    });
  };

  // Atualizar data e hora a cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Verificar autenticação no carregamento
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setUserRole(currentUser.role || '');
          setUsername(currentUser.username || currentUser.email);
        }
      } catch (error) {
        console.error("Erro ao verificar autenticação:", error);
      }
    };

    checkAuth();
  }, []);

  // Verificar permissões ao entrar na tela de monitoramento
  useEffect(() => {
    if (user && screen === 'monitoring') {
      requestLocationPermission();
    }
  }, [user, screen]);

  useEffect(() => {
    if (!user) return;

    const checkUserStatus = async () => {
      try {
        const status = await checkCurrentUserStatus();
        
        if (status.blocked) {
          // Limpar o intervalo antes de fazer logout
          if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            setStatusCheckInterval(null);
          }
          
          // Mostrar mensagem e fazer logout
          alert(`Sua conta está bloqueada: ${status.reason}`);
          await handleLogout();
        }
      } catch (error) {
        console.error('Erro ao verificar status do usuário:', error);
      }
    };

    // Verificar status a cada 30 segundos
    const interval = setInterval(checkUserStatus, 30000);
    setStatusCheckInterval(interval);
    
    // Verificar imediatamente
    checkUserStatus();

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [user]);

  // Observar eventos de atividade do usuário
  useEffect(() => {
    if (user) {
      const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
      
      const handleActivity = () => {
        resetInactivityTimer();
      };
      
      events.forEach(event => {
        window.addEventListener(event, handleActivity);
      });
      
      resetInactivityTimer();
      
      return () => {
        events.forEach(event => {
          window.removeEventListener(event, handleActivity);
        });
        
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      };
    }
  }, [user, resetInactivityTimer]);

  // Observar alterações no estado de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser && user && !isIntentionalLogout) {
        setError('Sua sessão foi encerrada');
        setUser(null);
        setScreen('login');
      }
    });
    return () => unsubscribe();
  }, [user, isIntentionalLogout]);

  // 🔄 FUNÇÃO DE LOGIN ATUALIZADA
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {      
      // Usar a nova função que verifica bloqueio
      const result = await checkEmployeeLoginStatus(username, password);
            
      // Se chegou até aqui, o login foi aprovado
      const displayName = result.userData.username || username;
      
      setUsername(displayName);
      setUser(result.user);
      setUserRole(result.userData.role);
      setScreen('monitoring');
      
      if (typeof onLogin === 'function') {
        onLogin({ username: displayName, role: result.userData.role });
      }
      
    } catch (error) {     
      if (error.message.includes('bloqueada')) {
        setError(error.message);
      } else if (error.code === 'auth/invalid-credential') {
        setError('Email ou senha incorretos. Verifique suas credenciais.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Email inválido. Verifique seu email.');
      } else if (error.code === 'auth/user-not-found') {
        setError('Usuário não encontrado.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Senha incorreta.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Tente novamente mais tarde.');
      } else if (error.code === 'auth/user-disabled') {
        setError('Esta conta foi desativada.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Erro de conexão. Verifique sua internet.');
      } else {
        setError(error.message || 'Ocorreu um erro inesperado ao fazer login.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogout = async () => {
    setIsIntentionalLogout(true);
    
    // Limpar intervalo de verificação de status
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
      setStatusCheckInterval(null);
    }
    
    try {
      await logout();
      setUser(null);
      setScreen('login');
      setUsername('');
      setPassword('');
      setLocationShared(false);
      setCapturedImage(null);
      setUserRole('');
      setError(''); // Limpar erros
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      setTimeout(() => {
        setIsIntentionalLogout(false);
      }, 1000);
    }
  };

  // Resto das funções permanecem iguais...
  
  // Compartilhar localização e abrir câmera
  const handleShareLocation = async () => {
    // Verificar suporte básico
    if (!navigator.geolocation) {
      alert("Seu dispositivo não suporta geolocalização.");
      return;
    }

    // Verificar permissões no iOS
    const canProceed = await checkIOSPermissions();
    if (!canProceed) return;

    // Detectar iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // Mostrar loading
    setLoading(true);
    setError('');

    const options = {
      enableHighAccuracy: true,
      timeout: isIOS ? 30000 : 10000, // Maior timeout para iOS
      maximumAge: 0
    };

    // Função para tentar obter localização
    const tryGetLocation = () => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('Localização obtida:', position);
            resolve(position);
          },
          (error) => {
            console.error('Erro de geolocalização:', error);
            reject(error);
          },
          options
        );
      });
    };

    try {
      // Primeira tentativa
      const position = await tryGetLocation();
      
      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      
      setShowCamera(true);
      setLoading(false);
      
    } catch (error) {
      setLoading(false);
      
      // Tratamento específico para iOS
      if (isIOS) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            // Instruções específicas para iOS
            alert(
              "Acesso à localização negado.\n\n" +
              "Para habilitar no iOS:\n" +
              "1. Abra Ajustes do iPhone/iPad\n" +
              "2. Role até Safari\n" +
              "3. Toque em 'Localização'\n" +
              "4. Selecione 'Perguntar' ou 'Permitir'\n\n" +
              "Se usando Chrome/Firefox:\n" +
              "- Vá em Ajustes > Privacidade > Serviços de Localização\n" +
              "- Encontre o navegador e permita acesso\n\n" +
              "Depois volte e recarregue a página."
            );
            break;
            
          case error.POSITION_UNAVAILABLE:
            alert(
              "Localização indisponível.\n\n" +
              "Certifique-se de que:\n" +
              "- Wi-Fi está ativado (melhora precisão)\n" +
              "- Serviços de Localização estão ativados\n" +
              "- Modo Avião está desativado"
            );
            break;
            
          case error.TIMEOUT:
            // No iOS, às vezes precisa de uma segunda tentativa
            if (window.confirm("Tempo esgotado ao obter localização. Tentar novamente?")) {
              handleShareLocation(); // Recursão
            }
            break;
            
          default:
            alert("Erro desconhecido ao obter localização. Tente novamente.");
        }
      } else {
        // Tratamento para outros dispositivos (mantém o código original)
        if (error.code === error.PERMISSION_DENIED) {
          alert(
            "Você precisa permitir o acesso à sua localização para continuar.\n\n" +
            "Para habilitar o acesso:\n" +
            "- Clique no ícone de cadeado na barra de endereço\n" +
            "- Encontre 'Localização' nas permissões\n" +
            "- Selecione 'Permitir'\n" +
            "- Atualize a página e tente novamente."
          );
        } else {
          alert("Não foi possível obter sua localização. Verifique as configurações do seu dispositivo.");
          setShowCamera(true);
        }
      }
    }
  };

  const requestLocationPermission = async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
      // No iOS, não podemos solicitar permissão programaticamente
      // Mas podemos verificar o estado e informar o usuário
      try {
        // Fazer uma tentativa silenciosa
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { timeout: 1000 }
          );
        });
      } catch (e) {
        console.log('Permissão de localização ainda não concedida');
      }
    }
  };

  
  const handleCaptureImage = async (imageSrc) => {
    setCapturedImage(imageSrc);
    setShowCamera(false);
    
    try {
      setIsSubmitting(true);      
      // Otimizar tamanho da imagem (mantém apenas a otimização de tamanho)
      const optimizedImage = await optimizeImage(imageSrc, 0.8);
      
      // Fazer upload da imagem
      const photoResult = await uploadImage(optimizedImage);
      
      // Registrar check-in sem metadados de qualidade
      await registerCheckIn(
        user.uid,
        username,
        location,
        photoResult.url
      );
      
      setLocationShared(true);
      setVerificationComplete(true);
    } catch (error) {
      console.error('Erro ao registrar check-in:', error);
      alert('Erro ao enviar os dados. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCancelCapture = () => {
    setShowCamera(false);
  };

  // Tela de Login
  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <img src="/images/logo.png" alt="Logo" className="w-16 h-16 mx-auto mb-2" />
        <div className="w-full max-w-md bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-blue-600 p-4 text-center">
            <h1 className="text-white text-xl font-bold">Sistema de Monitoramento</h1>
          </div>
          
          <div className="p-6">
            {error && (
              <div className={`mb-4 border px-4 py-3 rounded ${
                error.includes('bloqueada') 
                  ? 'bg-red-100 border-red-400 text-red-700' 
                  : 'bg-red-100 border-red-400 text-red-700'
              }`}>
                {error}
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
                Nome de Usuário ou Email
              </label>
              <input 
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                id="username" 
                type="text" 
                placeholder="Digite seu usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                Senha
              </label>
              <input 
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" 
                id="password" 
                type="password" 
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <div className="flex items-center justify-between">
            <button 
              className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full ${loading ? 'opacity-50 cursor-wait' : ''}`} 
              type="button"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Resto do componente permanece igual...
  // Tela de Monitoramento
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Cabeçalho */}
      <header className="bg-blue-600 text-white p-4 shadow">
        <div className="flex justify-between items-center">
          <h1 className="font-bold text-lg">{getFunctionTitle()}</h1>
          <button 
            className="bg-red-500 hover:bg-red-600 text-white text-sm py-1 px-3 rounded" 
            onClick={handleLogout}
          >
            Sair
          </button>
        </div>
      </header>
      
      {/* Resto do JSX permanece igual... */}
      <main className="flex-1 p-4">
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <div className="flex items-center">
            <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center mr-3 overflow-hidden">
              {capturedImage ? (
                <img src={capturedImage} alt="Foto do funcionário" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">{username}</h2>
              <p className="text-sm text-gray-500">{getRoleName(userRole)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm font-medium text-gray-600">{currentDateTime.toLocaleDateString()}</p>
              <p className="text-sm text-gray-500">{currentDateTime.toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-4">
          <Map location={location} />          
          <div className="p-4">
            <button 
              className={`w-full font-bold py-3 px-4 rounded-lg ${
                locationShared 
                  ? "bg-blue-500 hover:bg-blue-600 text-white" 
                  : "bg-green-500 hover:bg-green-600 text-white"
              } ${loadingLocation ? 'opacity-50 cursor-wait' : ''}`}
              onClick={handleShareLocation}
              disabled={showCamera || loadingLocation}
            >
              {loadingLocation 
                ? "Obtendo localização..." 
                : (locationShared ? "Atualizar Localização e Foto" : "Compartilhar Localização")
              }
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="font-bold text-gray-700 mb-2">Status de Monitoramento:</h3>
          <div className="flex items-center mb-3">
            <div className={`w-3 h-3 rounded-full mr-2 ${verificationComplete ? "bg-green-500" : "bg-yellow-500"}`}></div>
            <p className="text-gray-600">
              {verificationComplete 
                ? "Verificação completa" 
                : "Aguardando compartilhamento de localização e foto"}
            </p>
          </div>
          
          {capturedImage && (
            <div className="mt-3">
              <p className="mb-2 font-medium text-gray-700">Foto de verificação:</p>
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <img 
                  src={capturedImage} 
                  alt="Foto do funcionário" 
                  className="w-full" 
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Capturada em: {currentDateTime.toLocaleString()}
              </p>
            </div>
          )}
          
          {locationShared && (
            <div className="bg-gray-50 rounded p-3 text-sm mt-3">
              <p className="mb-1"><span className="font-medium">Última atualização:</span> {currentDateTime.toLocaleTimeString()}</p>
              <p className="mb-1"><span className="font-medium">Precisão:</span> {location && location.accuracy ? `±${Math.round(location.accuracy)}m` : "N/A"}</p>
              <p><span className="font-medium">Dispositivo:</span> {navigator.userAgent ? navigator.userAgent.split(/[()]/)[1] : "Desconhecido"}</p>
            </div>
          )}
        </div>
      </main>
      
      {showCamera && (
        <Camera
          onCapture={handleCaptureImage}
          onCancel={handleCancelCapture}
        />
      )}
    </div>
  );
};

export default SecurityApp;
