/**
 * Utilitários para processamento de imagens com Canvas API
 * Usado para recortar e redimensionar imagens no navegador
 */

/**
 * Carrega uma imagem a partir de uma URL
 * @param url - URL da imagem a ser carregada
 * @returns Promise que resolve com o elemento Image
 */
export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
    // Permitir imagens de outros domínios (CORS)
    image.crossOrigin = 'anonymous';
  });
}

/**
 * Calcula o tamanho da área rotacionada
 */
function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

/**
 * Calcula o tamanho da área rotacionada
 */
function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Recorta e redimensiona uma imagem usando Canvas API
 * @param imageSrc - URL ou base64 da imagem original
 * @param pixelCrop - Coordenadas e dimensões do recorte
 * @param rotation - Rotação em graus (padrão: 0)
 * @returns Promise que resolve com um Blob da imagem recortada (JPEG)
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation: number = 0
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Não foi possível obter o contexto do canvas');
  }

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  // Definir dimensões do canvas para suportar rotação
  canvas.width = safeArea;
  canvas.height = safeArea;

  // Aplicar rotação
  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate(getRadianAngle(rotation));
  ctx.translate(-safeArea / 2, -safeArea / 2);

  // Desenhar a imagem no canvas
  ctx.drawImage(
    image,
    safeArea / 2 - image.width * 0.5,
    safeArea / 2 - image.height * 0.5
  );

  // Criar um novo canvas para o recorte
  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  // Calcular o tamanho do canvas após rotação
  const rotatedSize = rotateSize(image.width, image.height, rotation);

  // Criar canvas para o recorte final
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');

  if (!croppedCtx) {
    throw new Error('Não foi possível obter o contexto do canvas de recorte');
  }

  // Definir dimensões do canvas de recorte
  croppedCanvas.width = pixelCrop.width;
  croppedCanvas.height = pixelCrop.height;

  // Desenhar a área recortada
  croppedCtx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
  );

  // Redimensionar para máximo 300x300 mantendo proporção
  const maxDimension = 300;
  let finalWidth = pixelCrop.width;
  let finalHeight = pixelCrop.height;

  if (finalWidth > maxDimension || finalHeight > maxDimension) {
    const scale = Math.min(
      maxDimension / finalWidth,
      maxDimension / finalHeight
    );
    finalWidth = Math.round(finalWidth * scale);
    finalHeight = Math.round(finalHeight * scale);

    // Criar canvas final para redimensionamento
    const resizedCanvas = document.createElement('canvas');
    const resizedCtx = resizedCanvas.getContext('2d');

    if (!resizedCtx) {
      throw new Error('Não foi possível obter o contexto do canvas de redimensionamento');
    }

    resizedCanvas.width = finalWidth;
    resizedCanvas.height = finalHeight;

    // Redimensionar usando alta qualidade
    resizedCtx.imageSmoothingEnabled = true;
    resizedCtx.imageSmoothingQuality = 'high';
    resizedCtx.drawImage(croppedCanvas, 0, 0, finalWidth, finalHeight);

    // Converter para Blob (JPEG com qualidade 0.8)
    return new Promise((resolve, reject) => {
      resizedCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Falha ao criar o blob da imagem'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.8
      );
    });
  }

  // Se não precisar redimensionar, retornar diretamente
  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Falha ao criar o blob da imagem'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.8
    );
  });
}

/**
 * Converte um Blob para uma URL de dados (data URL)
 * Útil para preview ou upload
 * @param blob - Blob da imagem
 * @returns Promise que resolve com a data URL
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Converte um Blob para File (útil para upload)
 * @param blob - Blob da imagem
 * @param filename - Nome do arquivo
 * @returns File object
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: 'image/jpeg' });
}

