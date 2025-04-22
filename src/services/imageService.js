import axios from 'axios';

// Função para fazer upload de imagem para o Cloudinary
export const uploadImage = async (base64Image) => {
  try {
    // Credenciais do Cloudinary (você pode configurá-las como variáveis de ambiente)
    const cloudName = 'seu-cloud-name';
    const uploadPreset = 'seu-upload-preset-unsigned';
    
    // Preparar a imagem (remover o prefixo de data URL se necessário)
    const formattedImage = base64Image.includes('data:image') 
      ? base64Image 
      : `data:image/jpeg;base64,${base64Image}`;
    
    // Enviar para o Cloudinary usando o preset não assinado
    const formData = new FormData();
    formData.append('file', formattedImage);
    formData.append('upload_preset', uploadPreset);
    
    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      formData
    );
    
    // Retornar a URL da imagem e outros detalhes
    return {
      url: response.data.secure_url,
      publicId: response.data.public_id,
      width: response.data.width,
      height: response.data.height
    };
  } catch (error) {
    console.error('Erro ao fazer upload da imagem:', error);
    throw error;
  }
};

// Função para otimizar a imagem antes do upload
export const optimizeImage = (base64Image, quality = 0.5) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Image;
    img.onload = () => {
      // Calcular novas dimensões (max 800px)
      let width = img.width;
      let height = img.height;
      const maxDimension = 800;
      
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      // Redimensionar e comprimir
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Converter para JPEG com qualidade reduzida
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
  });
};