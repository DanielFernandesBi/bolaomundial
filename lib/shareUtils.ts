import { toPng } from 'html-to-image';
// @ts-ignore - downloadjs não tem tipos TypeScript
import download from 'downloadjs';

async function elementToPng(elementId: string): Promise<string> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error(`Elemento ${elementId} não encontrado`);
  return toPng(element, {
    quality: 1.0,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    width: element.offsetWidth,
    height: element.offsetHeight,
  });
}

export async function shareAsImage(
  elementId: string,
  filename: string = 'bolao-mundial.png'
): Promise<void> {
  try {
    const dataUrl = await elementToPng(elementId);

    if (navigator.share && navigator.canShare) {
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Bolão Mundial - Minha Conquista!',
            text: 'Olha só minha cravada no Bolão Mundial! 🏆',
            files: [file],
          });
          return;
        }
      } catch {
        // fallback para download
      }
    }

    download(dataUrl, filename, 'image/png');
  } catch (error) {
    console.error('Erro ao gerar imagem:', error);
    throw new Error('Erro ao gerar imagem para compartilhamento');
  }
}

export async function shareMultipleAsImages(
  elementIds: string[],
  filenames: string[]
): Promise<void> {
  try {
    const dataUrls = await Promise.all(elementIds.map(elementToPng));

    if (navigator.share && navigator.canShare) {
      try {
        const files = await Promise.all(
          dataUrls.map(async (dataUrl, i) => {
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            return new File([blob], filenames[i], { type: 'image/png' });
          })
        );
        if (navigator.canShare({ files })) {
          await navigator.share({
            title: 'Bolão Mundial - Ranking Completo!',
            text: 'Confira o ranking completo do Bolão! 🏆',
            files,
          });
          return;
        }
      } catch {
        // fallback para download
      }
    }

    for (let i = 0; i < dataUrls.length; i++) {
      download(dataUrls[i], filenames[i], 'image/png');
      if (i < dataUrls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  } catch (error) {
    console.error('Erro ao gerar imagens:', error);
    throw new Error('Erro ao gerar imagens para compartilhamento');
  }
}

