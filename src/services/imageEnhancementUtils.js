
//Algoritmo de Equalização de Histograma
export const histogramEqualization = (imageData) => {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  const cdf = new Array(256).fill(0);
  
  // Calcular histograma para canal de luminância
  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[luminance]++;
  }
  
  // Calcular CDF (Cumulative Distribution Function)
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  
  // Normalizar CDF
  const totalPixels = data.length / 4;
  const cdfMin = cdf.find(val => val > 0);
  
  // Aplicar equalização
  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const newLuminance = Math.round(((cdf[luminance] - cdfMin) / (totalPixels - cdfMin)) * 255);
    const ratio = newLuminance / (luminance || 1);
    
    data[i] = Math.min(255, data[i] * ratio);
    data[i + 1] = Math.min(255, data[i + 1] * ratio);
    data[i + 2] = Math.min(255, data[i + 2] * ratio);
  }
  
  return imageData;
};

// Algoritmo CLAHE 
export const applyCLAHE = (canvas, context, clipLimit = 2.0) => {
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Dividir imagem em tiles (blocos)
  const tileSize = 64;
  const numTilesX = Math.ceil(canvas.width / tileSize);
  const numTilesY = Math.ceil(canvas.height / tileSize);
  
  // Processar cada tile
  for (let ty = 0; ty < numTilesY; ty++) {
    for (let tx = 0; tx < numTilesX; tx++) {
      const tileStartX = tx * tileSize;
      const tileStartY = ty * tileSize;
      const tileEndX = Math.min(tileStartX + tileSize, canvas.width);
      const tileEndY = Math.min(tileStartY + tileSize, canvas.height);
      
      // Aplicar equalização limitada no tile
      processTile(data, canvas.width, tileStartX, tileStartY, tileEndX, tileEndY, clipLimit);
    }
  }
  
  context.putImageData(imageData, 0, 0);
};

//Detecção de Faces em Baixa Luz (usando padrões simples)
export const detectFaceLowLight = async (canvas) => {
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Converter para escala de cinza
  const grayData = [];
  for (let i = 0; i < data.length; i += 4) {
    grayData.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  // Detectar regiões com variação consistente (possíveis faces)
  const regions = [];
  const blockSize = 32;
  
  for (let y = 0; y < canvas.height - blockSize; y += blockSize / 2) {
    for (let x = 0; x < canvas.width - blockSize; x += blockSize / 2) {
      const variance = calculateBlockVariance(grayData, x, y, blockSize, canvas.width);
      
      // Regiões com variância média podem indicar faces
      if (variance > 20 && variance < 80) {
        regions.push({ x, y, variance });
      }
    }
  }
  
  return regions.length > 0;
};

// Algoritmo de Redução de Ruído Adaptativa
export const adaptiveNoiseReduction = (imageData, sensitivity = 0.5) => {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Criar cópia para processar
  const output = new Uint8ClampedArray(data);
  
  // Kernel de suavização adaptativa
  const kernelSize = 3;
  const offset = Math.floor(kernelSize / 2);
  
  for (let y = offset; y < height - offset; y++) {
    for (let x = offset; x < width - offset; x++) {
      const idx = (y * width + x) * 4;
      
      // Calcular desvio padrão local
      let sumR = 0, sumG = 0, sumB = 0;
      let sumR2 = 0, sumG2 = 0, sumB2 = 0;
      let count = 0;
      
      for (let ky = -offset; ky <= offset; ky++) {
        for (let kx = -offset; kx <= offset; kx++) {
          const kidx = ((y + ky) * width + (x + kx)) * 4;
          sumR += data[kidx];
          sumG += data[kidx + 1];
          sumB += data[kidx + 2];
          sumR2 += data[kidx] * data[kidx];
          sumG2 += data[kidx + 1] * data[kidx + 1];
          sumB2 += data[kidx + 2] * data[kidx + 2];
          count++;
        }
      }
      
      const meanR = sumR / count;
      const meanG = sumG / count;
      const meanB = sumB / count;
      
      const stdR = Math.sqrt(sumR2 / count - meanR * meanR);
      const stdG = Math.sqrt(sumG2 / count - meanG * meanG);
      const stdB = Math.sqrt(sumB2 / count - meanB * meanB);
      
      // Aplicar suavização baseada no desvio padrão
      const threshold = 30 * sensitivity;
      
      if (stdR < threshold) output[idx] = meanR;
      if (stdG < threshold) output[idx + 1] = meanG;
      if (stdB < threshold) output[idx + 2] = meanB;
    }
  }
  
  // Copiar resultado de volta
  for (let i = 0; i < data.length; i++) {
    data[i] = output[i];
  }
  
  return imageData;
};

// Análise de Qualidade de Imagem
export const analyzeImageQuality = (canvas) => {
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  let brightness = 0;
  let contrast = 0;
  let sharpness = 0;
  let noise = 0;
  
  // Calcular brilho médio
  for (let i = 0; i < data.length; i += 4) {
    brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  brightness = brightness / (data.length / 4);
  
  // Calcular contraste (desvio padrão)
  let sumSquares = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sumSquares += Math.pow(gray - brightness, 2);
  }
  contrast = Math.sqrt(sumSquares / (data.length / 4));
  
  // Estimar nitidez usando detecção de bordas simplificada
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const idx = (y * canvas.width + x) * 4;
      const idxLeft = (y * canvas.width + (x - 1)) * 4;
      const idxUp = ((y - 1) * canvas.width + x) * 4;
      
      const diffX = Math.abs(data[idx] - data[idxLeft]);
      const diffY = Math.abs(data[idx] - data[idxUp]);
      
      sharpness += (diffX + diffY) / 2;
    }
  }
  sharpness = sharpness / ((canvas.width - 2) * (canvas.height - 2));
  
  // Estimar ruído
  const noiseKernel = 3;
  for (let y = noiseKernel; y < canvas.height - noiseKernel; y += noiseKernel) {
    for (let x = noiseKernel; x < canvas.width - noiseKernel; x += noiseKernel) {
      const variance = calculateBlockVariance(data, x, y, noiseKernel, canvas.width);
      noise += variance;
    }
  }
  noise = noise / ((canvas.width / noiseKernel) * (canvas.height / noiseKernel));
  
  return {
    brightness: brightness / 255 * 100, // Percentual
    contrast: contrast / 128 * 100, // Percentual
    sharpness: Math.min(sharpness / 50 * 100, 100), // Percentual
    noise: Math.min(noise / 100 * 100, 100), // Percentual
    isLowLight: brightness < 60,
    isAcceptable: brightness > 30 && contrast > 15 && sharpness > 20 && noise < 70,
    recommendations: getQualityRecommendations({ brightness, contrast, sharpness, noise })
  };
};

//Pipeline completo de melhoria de imagem
export const enhanceImagePipeline = async (canvas, options = {}) => {
  const {
    applyHistogram = true,
    applyCLAHEFilter = true,
    reduceNoise = true,
    enhanceBrightness = true,
    autoWhiteBalance = true
  } = options;
  
  const context = canvas.getContext('2d');
  let imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  
  // 1. Balanceamento de branco automático
  if (autoWhiteBalance) {
    imageData = autoWhiteBalanceCorrection(imageData);
  }
  
  // 2. Equalização de histograma
  if (applyHistogram) {
    imageData = histogramEqualization(imageData);
  }
  
  // 3. CLAHE para melhor contraste local
  if (applyCLAHEFilter) {
    context.putImageData(imageData, 0, 0);
    applyCLAHE(canvas, context);
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  }
  
  // 4. Redução de ruído
  if (reduceNoise) {
    imageData = adaptiveNoiseReduction(imageData);
  }
  
  // 5. Ajuste final de brilho
  if (enhanceBrightness) {
    imageData = adjustBrightnessContrast(imageData, 1.2, 1.1);
  }
  
  context.putImageData(imageData, 0, 0);
  
  // Retornar análise de qualidade
  return analyzeImageQuality(canvas);
};

// Funções auxiliares
function calculateBlockVariance(data, x, y, blockSize, width) {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  
  for (let by = 0; by < blockSize; by++) {
    for (let bx = 0; bx < blockSize; bx++) {
      const idx = ((y + by) * width + (x + bx)) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      sum += gray;
      sumSquares += gray * gray;
      count++;
    }
  }
  
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

function autoWhiteBalanceCorrection(imageData) {
  const data = imageData.data;
  let avgR = 0, avgG = 0, avgB = 0;
  const pixelCount = data.length / 4;
  
  // Calcular médias
  for (let i = 0; i < data.length; i += 4) {
    avgR += data[i];
    avgG += data[i + 1];
    avgB += data[i + 2];
  }
  
  avgR /= pixelCount;
  avgG /= pixelCount;
  avgB /= pixelCount;
  
  const avg = (avgR + avgG + avgB) / 3;
  const rScale = avg / avgR;
  const gScale = avg / avgG;
  const bScale = avg / avgB;
  
  // Aplicar correção
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * rScale);
    data[i + 1] = Math.min(255, data[i + 1] * gScale);
    data[i + 2] = Math.min(255, data[i + 2] * bScale);
  }
  
  return imageData;
}

function adjustBrightnessContrast(imageData, brightness, contrast) {
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 * brightness));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128 * brightness));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128 * brightness));
  }
  
  return imageData;
}

function processTile(data, imageWidth, startX, startY, endX, endY, clipLimit) {
  const histogram = new Array(256).fill(0);
  const tileWidth = endX - startX;
  const tileHeight = endY - startY;
  const tilePixels = tileWidth * tileHeight;
  
  // Calcular histograma do tile
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * imageWidth + x) * 4;
      const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      histogram[gray]++;
    }
  }
  
  // Aplicar clipping
  const clipValue = (clipLimit * tilePixels) / 256;
  let excess = 0;
  
  for (let i = 0; i < 256; i++) {
    if (histogram[i] > clipValue) {
      excess += histogram[i] - clipValue;
      histogram[i] = clipValue;
    }
  }
  
  // Redistribuir excess
  const avgExcess = excess / 256;
  for (let i = 0; i < 256; i++) {
    histogram[i] += avgExcess;
  }
  
  // Aplicar equalização no tile
  const cdf = new Array(256).fill(0);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * imageWidth + x) * 4;
      const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      const newGray = Math.round((cdf[gray] / tilePixels) * 255);
      const ratio = newGray / (gray || 1);
      
      data[idx] = Math.min(255, data[idx] * ratio);
      data[idx + 1] = Math.min(255, data[idx + 1] * ratio);
      data[idx + 2] = Math.min(255, data[idx + 2] * ratio);
    }
  }
}

function getQualityRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.brightness < 30) {
    recommendations.push('Imagem muito escura - use flash ou aproxime-se de uma fonte de luz');
  } else if (metrics.brightness < 60) {
    recommendations.push('Iluminação baixa - ative o flash para melhor qualidade');
  }
  
  if (metrics.contrast < 15) {
    recommendations.push('Baixo contraste - evite fundos uniformes');
  }
  
  if (metrics.sharpness < 20) {
    recommendations.push('Imagem borrada - mantenha o dispositivo estável');
  }
  
  if (metrics.noise > 70) {
    recommendations.push('Muito ruído - melhore a iluminação');
  }
  
  return recommendations;
}

export default {
  histogramEqualization,
  applyCLAHE,
  detectFaceLowLight,
  adaptiveNoiseReduction,
  analyzeImageQuality,
  enhanceImagePipeline
};