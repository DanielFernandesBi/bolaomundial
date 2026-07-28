-- Adiciona a coluna phase à tabela matches (fase do jogo: Fase de Grupos, Oitavas, etc.)
-- Execute este arquivo no SQL Editor do Supabase ou via: npx supabase db push

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'phase'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN phase text;
  END IF;
END $$;
