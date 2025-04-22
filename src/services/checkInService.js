import { collection, addDoc, serverTimestamp , getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Registrar um check-in
export const registerCheckIn = async (userId, username, location, photoUrl) => {
  try {
    // Validar dados obrigatórios
    if (!userId) throw new Error('ID de usuário não fornecido');
    if (!location) throw new Error('Dados de localização não fornecidos');
    if (!photoUrl) throw new Error('URL da foto não fornecida');
    
    const checkInData = {
      userId,
      username,
      location: {
        latitude: location.lat,
        longitude: location.lng,
        accuracy: location.accuracy
      },
      timestamp: serverTimestamp(),
      photoUrl,
      deviceInfo: navigator.userAgent || "Desconhecido"
    };
    
    const docRef = await addDoc(collection(db, 'checkIns'), checkInData);
    
    return docRef.id;
  } catch (error) {
    console.error('Erro ao registrar check-in:', error);
    throw error;
  }
};

// Obter histórico de check-ins do usuário
export const getUserCheckIns = async (userId, limitCount = 10) => {
  try {
    if (!userId) throw new Error('ID de usuário não fornecido');
    
    const querySnapshot = await getDocs(
      query(
        collection(db, 'checkIns'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      )
    );
    
    // Limitar os resultados após obter os dados
    const checkIns = [];
    let count = 0;
    querySnapshot.forEach((doc) => {
      if (count < limitCount) {
        checkIns.push({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate()
        });
        count++;
      }
    });
    
    return checkIns;
  } catch (error) {
    console.error('Erro ao obter check-ins:', error);
    throw error;
  }
};