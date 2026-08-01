// ============================================================================
// Motor de probabilidade do bolão de clubes.
//
// Separado de lib/probability/ de propósito: aquele motor é do Mundial de
// seleções — prior FIFA, chave fixa de 32, fase de grupos e disputa de 3º
// lugar. Aqui o prior é Opta, o chaveamento tem três competições, os
// confrontos são de ida e volta e o pódio é por competição.
//
// Este módulo é puro: entra dado, sai dado. Nada de Supabase, nada de fetch.
// Quem lê e grava é a camada de cima — o que também deixa o backtest rodar
// sem banco.
// ============================================================================

export * from './constants';
export * from './types';
export * from './strength';
export * from './poisson';
export * from './knockout';
