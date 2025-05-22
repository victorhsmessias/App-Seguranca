import { 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Lista de funções operacionais que podem usar o aplicativo
const operationalRoles = ['security', 'vigia', 'porteiro', 'zelador', 'supervisor', 'sdf'];

// Função auxiliar para verificar se é uma função operacional
export const isOperationalRole = (role) => {
  return operationalRoles.includes(role);
};

// Função para obter nome mais amigável da função
export const getRoleName = (role) => {
  const roleNames = {
    'security': 'Segurança',
    'vigia': 'Vigia',
    'porteiro': 'Porteiro',
    'zelador': 'Zelador',
    'supervisor': 'Supervisor',
    'sdf': 'SDF',
    'admin': 'Administrador',
    'rh': 'RH'
  };
  
  return roleNames[role] || role;
};

// Verificar se funcionário pode fazer login
export const checkEmployeeLoginStatus = async (email, password) => {
  try {    
    // 1. Primeiro, fazer login normalmente
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    
    // 2. Buscar dados do usuário no Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (!userDoc.exists()) {
      console.error('Usuário não encontrado no Firestore');
      // Fazer logout se o usuário não existir no Firestore
      await signOut(auth);
      throw new Error('Usuário não encontrado no sistema.');
    }
    
    const userData = userDoc.data();
    
    // 3. Verificar se é um funcionário operacional (não admin)
    if (!isOperationalRole(userData.role)) {
      await signOut(auth);
      throw new Error('Este aplicativo é apenas para funcionários operacionais.');
    }
    
    // 4. Verificar se o funcionário está bloqueado
    if (userData.status === 'blocked') {
      await signOut(auth);
      const reason = userData.blockReason || 'Conta bloqueada pelo administrador';
      throw new Error(`Sua conta está bloqueada. Motivo: ${reason}`);
    }
    
    // 5. Se chegou até aqui, o login é válido
    return {
      user: user,
      userData: userData,
      success: true
    };
    
  } catch (error) {
    console.error('Erro na verificação de login:', error);
    throw error;
  }
};

// Verificar status em tempo real (para usar durante o app)
export const checkCurrentUserStatus = async () => {
  try {
    if (!auth.currentUser) {
      return { blocked: true, reason: 'Usuário não autenticado' };
    }
    
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    
    if (!userDoc.exists()) {
      return { blocked: true, reason: 'Usuário não encontrado' };
    }
    
    const userData = userDoc.data();
    
    if (userData.status === 'blocked') {
      return { 
        blocked: true, 
        reason: userData.blockReason || 'Conta bloqueada pelo administrador' 
      };
    }
    
    return { blocked: false, userData: userData };
    
  } catch (error) {
    console.error('Erro ao verificar status atual:', error);
    return { blocked: true, reason: 'Erro ao verificar status' };
  }
};

// Login com email e senha
export const loginWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const getUserData = async (userId) => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("Documento do usuário não encontrado");
      return null;
    }
    
    return {
      ...userDoc.data(),
      id: userId
    };
  } catch (error) {
    console.error("Erro ao obter dados do usuário:", error);
    throw error;
  }
};

export const getUserRole = async (userId) => {
  try {
    // Assumindo que você já configurou a referência ao Firestore
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (userDoc.exists()) {
      return userDoc.data().role || 'user'; // 'user' como fallback padrão
    } else {
      return 'user'; // Papel padrão
    }
  } catch (error) {
    return 'user'; // Papel padrão em caso de erro
  }
};

// Logout com registro
export const logout = async () => {
  try {
    await signOut(auth);
    
    localStorage.removeItem('user');
    sessionStorage.removeItem('user');
    
    return true;
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
    throw error;
  }
};

// Obter usuário atual
export const getCurrentUser = () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      
      if (user) {
        try {
          // Obter informações adicionais do usuário
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Verificar se o usuário tem permissão para o app (qualquer função operacional)
            if (!isOperationalRole(userData.role)) {
              await signOut(auth);
              resolve(null);
              return;
            }
            
            // VERIFICAR SE ESTÁ BLOQUEADO
            if (userData.status === 'blocked') {
              await signOut(auth);
              resolve(null);
              return;
            }
            
            resolve({
              uid: user.uid,
              email: user.email,
              ...userData
            });
          } else {
            resolve(null);
          }
        } catch (error) {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    }, reject);
  });
};
