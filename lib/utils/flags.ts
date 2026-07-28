/**
 * Utilitário para exibir bandeiras de países ou logos de times
 * 
 * Estratégia: 
 * - Se o código começa com 'http', retorna a URL diretamente (logo de time)
 * - Caso contrário, usa flagcdn.com com código ISO de 2 letras (bandeira de país)
 * 
 * Exemplo de uso:
 * <img src={getFlagUrl('BR')} alt="Brasil" className="flag" />
 * <img src={getFlagUrl('https://upload.wikimedia.org/...')} alt="Time" className="flag" />
 * 
 * @param countryCode - Código ISO de 2 letras do país (ex: 'BR', 'FR', 'AR') ou URL completa (ex: 'https://...')
 * @returns URL da bandeira no flagcdn.com ou URL direta
 */
export function getFlagUrl(countryCode: string): string {
  // Se começa com 'http', é uma URL direta (logo de time)
  if (countryCode.toLowerCase().startsWith('http')) {
    return countryCode;
  }
  // Caso contrário, é um código ISO (bandeira de país)
  const normalizedCode = countryCode.toLowerCase();
  return `https://flagcdn.com/w40/${normalizedCode}.png`;
}

/**
 * Componente de bandeira (para uso futuro)
 * 
 * Exemplo:
 * <Flag countryCode="BR" alt="Brasil" />
 */
export interface FlagProps {
  countryCode: string;
  alt?: string;
  className?: string;
  size?: number;
}

export function getFlagUrlWithSize(countryCode: string, size: number = 40): string {
  const normalizedCode = countryCode.toLowerCase();
  return `https://flagcdn.com/w${size}/${normalizedCode}.png`;
}

