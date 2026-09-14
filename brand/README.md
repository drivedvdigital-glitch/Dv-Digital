# Identidade visual do D&VFly

A marca é um **losango composto de losangos**: um grid 5×5 girado 45°, com os ladrilhos crescendo
do vértice de cima para o de baixo.

## A marca é código, não imagem

Os SVGs deste diretório são **gerados**, não desenhados:

```sh
node --experimental-strip-types brand/build-logo.ts
```

Isso é deliberado, e é o mesmo argumento que o produto faz sobre páginas aplicado ao próprio logo:
descrever a forma como regra em vez de embarcar um bitmap dá um arquivo de **1,6 KB**, que escala
para qualquer tamanho sem borrar e muda de cor alterando **uma constante**.

| Arquivo | Para quê | Tamanho |
|---|---|---|
| `mark.svg` | Uso geral, fundo claro ou transparente | 1,6 KB |
| `mark-on-dark.svg` | Mesma marca com fundo preto embutido | 1,6 KB |
| `favicon.svg` | Ícone pequeno — **variante simplificada**, ver abaixo | 663 B |
| `app-icon.svg` / `.png` | **Ícone do app na Shopify** — 1200×1200, fundo escuro | 1,7 KB / PNG |
| `app-icon-light.png` | Mesma marca sobre branco (alternativa) | PNG |

## A variante pequena existe por um motivo medido

Rasterizei a marca completa em 16px e **vira borrão**: os ladrilhos finos perto do vértice de cima
caem em menos de um pixel cada. Aos 32px dá para ler, mas o topo fica fantasma.

Por isso o `favicon.svg` usa um grid **3×3** (9 ladrilhos em vez de 25), com a mesma ideia —
diamante de diamantes, crescendo para baixo — e ladrilhos grandes o bastante para sobreviver.

⚠️ **Mesmo assim, aos 16px a forma amacia.** Isso é inerente: quadrado girado 45° em 16 pixels
sempre cai em antialiasing. A variante 3×3 é o melhor compromisso, e aos 32px (que é o que
navegador em tela retina usa) fica nítida. Se um dia for preciso um 16px cravado, o caminho é um
losango único e sólido.

## O ícone do app tem fundo escuro de propósito

A Shopify exige **1200×1200**, PNG ou JPEG, e avisa que o ícone é exibido **sobre branco e cinza
claro**. Verde puro em fundo transparente desbota justamente aí.

Por isso o `app-icon` traz um quadrado arredondado escuro atrás da marca. Comparado lado a lado
sobre o cinza do admin, o escuro lê como ícone de app e o claro some. O `app-icon-light.png` fica
como alternativa caso um dia a peça peça fundo claro.

## Cor

```
Verde D&VFly    #0BE05C
```

⚠️ **Este hex é estimativa.** Os arquivos originais chegaram nesta sessão como imagens na
conversa, não como arquivos, então não deu para amostrar o pixel. **Substitua pelo valor exato da
arte original** — ele aparece num lugar só, a constante `BRAND_GREEN` em `build-logo.ts`. Rodar o
gerador de novo propaga para os três SVGs.

Sobre fundo escuro o verde funciona puro. Sobre fundo claro ele tem contraste baixo para texto —
use-o em superfície e forma, e deixe o texto em tom de tinta (`#17201C` ou similar), como o
logotipo completo faz.

## Geometria, para quem for mexer

| Constante | Valor | O que controla |
|---|---|---|
| `GRID` | 5 | Ladrilhos por lado da marca completa (25 no total) |
| `GRID_SMALL` | 3 | Ladrilhos por lado da variante de ícone (9 no total) |
| `TILE_MIN` | 0,34 | Tamanho do ladrilho no vértice de cima, como fração do passo |
| `TILE_MAX` | 0,88 | Tamanho no vértice de baixo — **abaixo de 1,0 de propósito**, para sobrar folga entre os ladrilhos maiores |

Os ladrilhos são posicionados no grid **sem rotação** e o grupo inteiro é girado de uma vez. É por
isso que o espaçamento fica uniforme com uma transformação só.

## Regras de uso

- **Folga**: pelo menos a altura de um ladrilho grande em volta da marca.
- **Não distorcer**: a marca é quadrada; escale proporcionalmente.
- **Não recolorir** fora do verde da marca, salvo monocromático (preto ou branco) quando a peça
  exigir.
- **Não redesenhar à mão**: mexa no gerador e rode de novo, para as variantes não divergirem.

## O que ainda falta

- [ ] **Hex exato** da arte original (ver aviso acima)
- [ ] **Logotipo completo** (marca + "D&VFLY") — só a marca foi reconstruída. O logotipo depende da
      fonte usada no texto, que ainda não sei qual é
- [ ] PNGs para onde SVG não serve (app store, alguns clientes de e-mail)
