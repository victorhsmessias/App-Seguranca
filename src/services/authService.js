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
    // Isso vai desautenticar o usuário do Firebase Auth
    await signOut(auth);
    
    // Se você estiver usando localStorage ou sessionStorage para persistir dados
    localStorage.removeItem('user'); // Remova qualquer persistência local
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
