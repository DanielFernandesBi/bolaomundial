# Desabilitar Confirmação de E-mail no Supabase

Para remover a exigência de confirmação por e-mail no cadastro de novos jogadores, você precisa desabilitar essa opção no dashboard do Supabase.

## Passos para Desabilitar:

1. Acesse o [Dashboard do Supabase](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Authentication** (no menu lateral)
4. Clique em **Settings** (Configurações)
5. Na seção **Email Auth**, encontre a opção **"Confirm email"**
6. **Desmarque** a opção "Confirm email"
7. Clique em **Save** (Salvar)

## O que isso faz:

- Usuários poderão fazer login imediatamente após o cadastro
- Não será necessário confirmar o e-mail antes de usar a conta
- O e-mail ainda será usado para recuperação de senha (se configurado)

## Nota de Segurança:

Desabilitar a confirmação de e-mail reduz a segurança, pois permite que qualquer pessoa crie contas com e-mails que não possuem. Considere implementar outras medidas de segurança se necessário.

## Verificação:

Após desabilitar, teste criando uma nova conta. O usuário deve conseguir fazer login imediatamente sem precisar confirmar o e-mail.

