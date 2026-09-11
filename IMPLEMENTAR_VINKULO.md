# Prompt de implementação — Vínkulo

Copie este documento como instrução para implementar (ou reconstruir fielmente) o projeto **Vínkulo** no repositório atual. Não crie um app paralelo, não troque a arquitetura do Vite/React e não remova mudanças existentes que não sejam diretamente necessárias.

## Objetivo

Construa uma experiência responsiva, mobile-first e visualmente refinada para o **Vínkulo**, plataforma brasileira de gestão para igrejas evangélicas. Há três estados de interface:

1. **Recepção/login** como página inicial.
2. **Landing page** institucional, acessível pelo link da recepção.
3. **Boas-vindas** breve e animada após o login.

O resultado deve funcionar integralmente como protótipo local, sem backend. A interface deve parecer um produto SaaS editorial e acolhedor — nunca um template genérico — usando ícones SVG de traço fino, e não emojis.

## Ambiente e regras do repositório

- Stack: React 19, TypeScript, Vite 8 e Tailwind CSS v4.
- Entrada: `src/main.tsx` importa `src/index.css` e monta `src/App.tsx`.
- Use classes utilitárias Tailwind em JSX; mantenha tokens globais, fontes e animações em `src/index.css`.
- Não adicionar configuração Tailwind ou PostCSS. O CSS deve iniciar com os `@import` necessários.
- Componentes devem ter `export default`.
- Não introduzir uma biblioteca de ícones só para esta tela: mantenha os SVGs inline, com `stroke="currentColor"`, traço fino e geometria simples.
- Não use resets globais universais sem camada.
- Preserve `src/App.tsx`, a troca de tema, o wallpaper discreto claro, e o fluxo de views já existentes. Não introduza roteamento para uma navegação que hoje é controlada por estado.

## Arquivos e responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `src/App.tsx` | Controla `reception`, `landing` e `welcome`; detecta `prefers-color-scheme`, aplica/remove a classe `dark` no `<html>` e mantém botão flutuante de tema. |
| `src/pages/ReceptionPage.tsx` | Recepção, tabs Entrar/Criar conta e encaminhamento ao login ou landing. |
| `src/components/LoginForm.tsx` | Login em duas etapas: e-mail → senha. |
| `src/components/RegisterForm.tsx` | Cadastro em duas etapas: pessoa → comunidade. |
| `src/pages/WelcomePage.tsx` | Tela transitória de confirmação após login. |
| `src/pages/LandingPage.tsx` | Landing completa e interativa. |
| `src/components/ScrollReveal.tsx` | Anima a entrada de blocos da landing durante a rolagem. |
| `src/index.css` | Fontes, tokens de claro/escuro e keyframes. |
| `apply-scroll-reveal.cjs` | Script histórico que aplica os wrappers `ScrollReveal` à landing; não é parte da execução da aplicação e não deve substituir as edições manuais atuais. |

## Identidade visual

### Tipografia

- **Bricolage Grotesque**: títulos e marca (`font-display`), pesos 600–800, tracking levemente fechado.
- **Instrument Sans**: texto e controles (`font-sans`).
- **IBM Plex Mono**: horários e metadados temporais (`font-mono`).
- Carregue as três via Google Fonts no topo de `src/index.css`, antes de `@import 'tailwindcss'`.

### Tokens

Use estes valores como fonte de verdade e exponha-os no `@theme` do Tailwind v4:

| Token | Claro | Escuro |
| --- | --- | --- |
| Fundo `--bg` | `#FFFFFF` | `#0B0D10` |
| Superfície `--surface` | `#F8FAFC` | `#15181D` |
| Superfície sutil | `#F1F5F9` | `#1A1E24` |
| Borda | `#E2E8F0` | `#2E353E` |
| Texto principal | `#0F172A` | `#EDF1F5` |
| Texto secundário | `#475569` | `#98A3B0` |
| Texto discreto | `#94A3B8` | `#6B7C89` |
| Azul principal | `#2563EB` | `#3B82F6` |
| Hover azul | `#1D4ED8` | `#2563EB` |
| Laranja | `#F97316` | `#F97316` |
| Amarelo | `#EAB308` | `#FBBF24` |

Inclua ainda cores semânticas: sucesso `#1B8F63`, aviso `#A96C10`, perigo `#B93E58` e roxo `#6B5ED4`. Os raios característicos são: controles 12px, cartões 20–24px e pills totalmente arredondadas.

### Linguagem do “fio do dia”

O fio é o motivo visual central: **passado sólido**, **presente iluminado** e **futuro tracejado**. Use uma linha vertical azul/laranja com ponto luminoso no presente. Ele aparece de modo decorativo no desktop e, no bloco explicativo, como uma mini interface funcional. Não transformar o fio em elemento excessivamente ornamental.

### Tema e fundo

- Tema inicial segue o sistema operacional. O botão flutuante no canto inferior direito alterna o tema e atualiza a classe `dark` no documento.
- No claro, deixe ao fundo uma imagem arquitetônica/abstrata discreta (`photo-1558591710-4b4a1ae0f04d` do Unsplash), em `cover`, com overlay `bg-background/80` e blur leve.
- No escuro, esconda o wallpaper e use apenas um gradiente radial azul muito sutil no topo.
- Cuidado para que o wallpaper nunca prejudique legibilidade.

## Comportamento global

- Em `App.tsx`, iniciar em `reception`.
- "Conheça o sistema" e CTAs da landing levam para `landing` ou `reception` conforme o contexto atual.
- Login: e-mail → senha → `welcome`; use o e-mail digitado, com fallback `pastoral@suaigreja.com.br`.
- Boas-vindas informa que está preparando o ambiente e simula a navegação futura após 3 segundos com `console.log` (não é necessário dashboard nesta entrega).
- Todo o layout deve começar em uma coluna no mobile e só adotar grids/duas colunas a partir de `md`.

## Página de recepção

Estruture a tela como recepção SaaS calma, com header, hero, cartão de autenticação e rodapé.

- Header: marca SVG azul + nome minúsculo **vínkulo** à esquerda; botão textual "Conheça o sistema →" à direita.
- No desktop, manter o fio vertical central: primeiros 35% com traço sólido/gradiente, ponto de presente em laranja com glow e o restante tracejado. No mobile, ocultá-lo.
- Hero: badge amarelo "GESTÃO PARA IGREJAS"; título "Sua comunidade, conectada e organizada." com "conectada" em laranja; descrição do produto.
- Ao lado (ou abaixo no mobile), cartão claro/escuro de autenticação com borda, `rounded-3xl` e sombra ampla. Tabs: "Entrar" e "Criar conta".
- Login: primeiro e-mail, depois senha; link "Esqueci minha senha" na segunda etapa; divisor "ou" e botão "Continuar com Google" com SVG oficial do Google na primeira.
- Cadastro: etapa 1 com nome, e-mail e senha; etapa 2 com nome da comunidade, cidade e select de papel. Indicador de duas barras; botão Próximo/Criar conta e Voltar.
- Rodapé: texto de aceite com "Termos de uso" e "Política de privacidade" clicáveis visualmente.

## Tela de boas-vindas

- Centralizada, com radiação azul quase imperceptível.
- Selo circular azul com check SVG, `animate-pulse-glow`.
- Título "Tudo pronto!" e texto que contém o e-mail em destaque.
- Três pontos animados: azul, amarelo e laranja, com atrasos progressivos.

## Landing page

A navegação superior é sticky, translúcida (`backdrop-blur`) e contém a marca e o botão "Entrar →". Mantenha as seções abaixo nesta ordem e com estes conteúdos.

1. **Hero**: badge "GESTÃO PARA IGREJAS", título "Tudo que sua comunidade precisa, conectado.", descrição, CTAs "Começar grátis" e "Ver demonstração", avatares sobrepostos RA/CF/SC/MO e prova social "+1.200 igrejas já usam o Vínkulo". No desktop, um fio vertical discreto no fundo.
2. **Números**: cartão em grade 2×2 no mobile e 4 colunas no desktop: 1.200+ Igrejas, 180K+ Membros, 94% Retenção, 4.9★ Avaliação.
3. **Módulos**: título "Cada área da sua igreja, organizada" e seis cartões: Fio do dia; Células; Ministérios e escalas; Visitantes; Pedidos de oração; Agenda e eventos. Cada um tem ícone SVG próprio, cor semântica e descrição disponível no código atual.
4. **O fio do dia**: texto explicativo e mini-card de timeline. Eventos: 08:30 Culto de oração / Realizado; Agora Reunião de liderança / Em andamento; 19h30 Culto de quarta / Confirmado; Sáb · 10h Treinamento de líderes / 6 confirmados. Horários usam `font-mono`; o item "Agora" recebe foco visual em laranja.
5. **Para quem é**: três cartões: Pastor e liderança, Líder de célula, Membro. Listar exatamente os recursos descritos no componente atual, com bolinhas de cor e ícones SVG apropriados.
6. **Depoimentos**: cartões para Pr. Rogério Almeida, Cristina Ferreira e Diacono Samuel Costa, incluindo texto, papel, igreja e avatares RA/CF/SC.
7. **Planos**: Comunidade (Gratuito), Crescimento (R$ 89/mês) e Rede (Fale conosco), com as listas de recursos existentes. Crescimento é o destaque: selo amarelo "Mais popular", borda amarela e elevação no desktop.
8. **FAQ**: acordeão com cinco perguntas e respostas existentes. Clique abre/fecha, e o `+` gira 45° quando aberto.
9. **CTA final**: bloco azul, marca branca, título "Sua comunidade merece o melhor", subtítulo e botão branco "Criar conta grátis →".
10. **Footer**: marca, descrição em português brasileiro, links Termos de uso/Privacidade/Suporte/Blog, copyright © 2026 Vínkulo e a frase "Feito com cuidado para igrejas brasileiras".

Os textos completos das descrições, depoimentos, planos, FAQ e listas já estão declarados em `src/pages/LandingPage.tsx`; mantenha-os em arrays de dados e não os substitua por texto genérico.

## Animação de revelação por rolagem (mudança manual importante)

`src/components/ScrollReveal.tsx` deve permanecer com este contrato:

- Props: `children`, `className?`, `delay?` e `direction?: "up" | "left" | "right"`.
- Usa `IntersectionObserver` com `threshold: 0.1`.
- Quando entra na viewport, define `isVisible` e deixa de observar o alvo; a animação ocorre uma vez.
- Antes de aparecer, usa `opacity-0` e deslocamento de 12 unidades Tailwind: baixo para `up`, direita para `left`, esquerda para `right`.
- Após aparecer, aplica `opacity-100 translate-x-0 translate-y-0`, `transition-all duration-1000 ease-out` e atraso em milissegundos via `transitionDelay` inline.

Na landing, preserve estes wrappers:

- números como um bloco;
- cabeçalhos de seção;
- cartões de módulos com `delay={idx * 100}`;
- conteúdo do fio entrando pela direita e a mini interface pela esquerda com `delay={200}`;
- cartões de papéis, depoimentos e planos com `delay={idx * 150}`;
- itens do FAQ com `delay={i * 100}`;
- CTA final como um bloco.

Não rode `apply-scroll-reveal.cjs` sobre uma landing já editada sem revisar o diff: ele é um script de transformação textual e as alterações manuais no JSX são a referência final.

## Animações e acabamento

Defina e use somente o necessário:

- `slideUp`: entrada de 10px para cima, 0.6s, curva `cubic-bezier(0.16, 1, 0.3, 1)`.
- `pulseGlow`: glow azul pulsante em 3s.
- `drawLine`: altura de 0 a 100%.
- `animate-slide-up`, `animate-pulse-glow` e `animate-drawLine` como classes utilitárias próprias quando aplicável.

Interações de hover devem ser delicadas: azul mais escuro em botões primários, elevação pequena de cards, mudança de borda para azul e transições de 200–300ms. Respeite contraste em ambos os temas.

## Critérios de aceitação

- O app inicia na recepção e os três estados podem ser percorridos sem erro.
- Claro/escuro funciona, inclusive a preferência inicial do sistema e o botão flutuante.
- A landing é responsiva, sem overflow horizontal, com navegação sticky, FAQ funcional e CTAs retornando à recepção.
- Todos os SVGs permanecem SVGs; não usar emoji como ícone de interface.
- ScrollReveal revela seções/cards uma única vez durante a rolagem, incluindo os atrasos em cascata.
- As fontes, tokens e o conceito visual do fio estão presentes.
- Preserve as edições manuais atuais em `LandingPage.tsx`, `ScrollReveal.tsx` e `apply-scroll-reveal.cjs` como parte do estado a manter.
- Antes de concluir, execute `pnpm run build` se tiver alterado estrutura, tipos ou JSX amplamente; corrija qualquer falha antes de entregar.
