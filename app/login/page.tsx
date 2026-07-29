'use client';

import { useState } from 'react';
import { Mail, Lock, ArrowRight, User } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { loginAction, signupAction } from './actions';
import Link from 'next/link';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Controlado de propósito: no React 19 o <form action> RESETA o formulário
  // depois que a action roda. Com o campo não-controlado, o e-mail era apagado
  // a cada tentativa falha e o usuário tinha de redigitar no celular.
  const [email, setEmail] = useState('');

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);

    try {
      const result = isSignup
        ? await signupAction(formData)
        : await loginAction(formData);

      if (result?.error) {
        setError(result.error);
        setSuccess(null);
      } else if (result?.success) {
        setSuccess(result.message);
        setError(null);
      }
    } catch (err) {
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Header com Logo e Título */}
      <div className="flex flex-col items-center mb-8">
        {/* Logo do App */}
        <div className="mb-4">
          <Image
            src="/icon-512.png"
            alt="Arena de Bolões"
            width={120}
            height={120}
            className="rounded-2xl shadow-2xl"
            priority
          />
        </div>
        
        {/* Título */}
        <h1 className="text-4xl font-bold text-primary mb-2">
          Arena de Bolões
        </h1>
        
        {/* Subtítulo */}
        <p className="text-card-foreground text-sm">
          {isSignup ? 'Crie sua conta para participar' : 'Faça seu login para participar'}
        </p>
      </div>

      {/* Card de Login/Cadastro */}
      <Card className="w-full max-w-md bg-card border-border">
        <CardContent className="p-6">
          <form action={handleSubmit} className="space-y-4">
            {/* Campo Username (apenas no cadastro) */}
            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="username" className="text-foreground">
                  Username
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary/70 z-10" />
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="seuusername"
                    required
                    className="pl-10 bg-muted/50 border-border text-foreground placeholder:text-[hsl(var(--faint))] focus:border-primary focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* Campo Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary/70 z-10" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-muted/50 border-border text-foreground placeholder:text-[hsl(var(--faint))] focus:border-primary focus:ring-ring"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password" className="text-foreground">
                  Senha
                </Label>
                {!isSignup && (
                  <Link
                    href="/login/esqueci"
                    className="text-xs font-semibold text-primary transition-opacity hover:opacity-80"
                  >
                    Esqueci minha senha
                  </Link>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary/70 z-10" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="pl-10 bg-muted/50 border-border text-foreground placeholder:text-[hsl(var(--faint))] focus:border-primary focus:ring-ring"
                />
              </div>
            </div>

            {/* Mensagem de Erro */}
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
                {error}
              </div>
            )}

            {/* Mensagem de Sucesso */}
            {success && (
              <div className="text-sm text-success bg-success/10 border border-success/20 rounded-md p-3">
                {success}
              </div>
            )}

            {/* Botão Entrar/Cadastrar */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))] h-11 text-base font-semibold shadow-lg shadow-primary/20 transition-all"
            >
              {isLoading ? (
                'Carregando...'
              ) : (
                <>
                  {isSignup ? 'Cadastrar' : 'Entrar'}
                  <ArrowRight className="ml-2 w-5 h-5 text-primary-foreground" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Rodapé com Link de Cadastro/Login */}
      <div className="mt-6 text-center">
        <p className="text-card-foreground text-sm">
          {isSignup ? 'Já tem uma conta? ' : 'Não tem uma conta? '}
          <button
            onClick={() => {
              setIsSignup(!isSignup);
              setError(null);
            }}
            className="text-primary hover:text-primary hover:underline font-semibold transition-colors"
          >
            {isSignup ? 'Faça login' : 'Cadastre-se'}
          </button>
        </p>
      </div>
    </div>
  );
}

