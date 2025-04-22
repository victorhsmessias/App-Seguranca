// em services/cloudinaryService.js
export const optimizeImage = async (dataUrl, quality = 0.6) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Redimensionar para um tamanho razoável, se necessário
      const MAX_WIDTH = 1280;
      const MAX_HEIGHT = 720;
      
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
      }
      
      if (height > MAX_HEIGHT) {
        width = Math.round(width * (MAX_HEIGHT / height));
        height = MAX_HEIGHT;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Converter para dataURL com a qualidade desejada
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    
    img.src = dataUrl;
  });
};

export const uploadImage = async (dataUrl) => {
  try {
    // Converter dataURL para Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    // Criar FormData para upload
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', 'security-app'); // Substitua pelo seu upload_preset do Cloudinary
    
    // Fazer upload para o Cloudinary
    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/dyfhec1gf/image/upload`, // Substitua pelo seu cloud_name
      {
        method: 'POST',
        body: formData,
      }
    );
    
    const cloudinaryData = await cloudinaryResponse.json();
    
    if (cloudinaryResponse.ok) {
      return {
        url: cloudinaryData.secure_url,
        publicId: cloudinaryData.public_id
      };
    } else {
      throw new Error(cloudinaryData.error?.message || 'Erro ao fazer upload da imagem');
    }
  } catch (error) {
    console.error('Erro ao fazer upload para o Cloudinary:', error);
    throw error;
  }
};