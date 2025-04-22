import { collection, addDoc, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadImage, optimizeImage } from './imageService';

// Registrar check-in com localização e foto
export const registerCheckIn = async (userId, locationData, photoData) => {
    try {
      // Otimizar a imagem antes do upload
      const optimizedImage = await optimizeImage(photoData, 0.6);
      
      // Upload da foto para o Cloudinary
      const photoResult = await uploadImage(optimizedImage);
      
      // Salvar dados de check-in no Firestore
      const checkInData = {
        userId,
        latitude: locationData.lat,
        longitude: locationData.lng,
        accuracy: locationData.accuracy,
        photoUrl: photoResult.url,
        photoPublicId: photoResult.publicId,
        timestamp: Timestamp.now(),
        device: navigator.userAgent || 'Unknown'
      };
      
      const docRef = await addDoc(collection(db, 'check-ins'), checkInData);
      
      return {
        id: docRef.id,
        ...checkInData
      };
    } catch (error) {
      throw error;
    }
  };

// Obter check-ins por usuário
export const getCheckInsByUser = async (userId) => {
  try {
    const q = query(
      collection(db, 'check-ins'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const checkIns = [];
    
    querySnapshot.forEach((doc) => {
      checkIns.push({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate().toISOString()
      });
    });
    
    return checkIns;
  } catch (error) {
    throw error;
  }
};

// Obter check-ins por data
export const getCheckInsByDate = async (startDate, endDate) => {
  try {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const q = query(
      collection(db, 'check-ins'),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const checkIns = [];
    
    querySnapshot.forEach((doc) => {
      checkIns.push({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate().toISOString()
      });
    });
    
    return checkIns;
  } catch (error) {
    throw error;
  }
};