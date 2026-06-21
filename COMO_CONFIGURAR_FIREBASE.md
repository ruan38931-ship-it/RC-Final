# Como Configurar o Banco de Dados (Firebase)

Para que sua aplicação funcione com dados compartilhados entre diferentes computadores, você precisa configurar um projeto gratuito no Firebase. Siga os passos abaixo:

## 1. Criar o Projeto

1. Acesse o [Firebase Console](https://console.firebase.google.com/).

1. Clique em **"Adicionar projeto"** e dê um nome (ex: "RC Celulares").

1. Pode desativar o Google Analytics para ser mais rápido.

1. Clique em **"Criar projeto"**.

## 2. Configurar o Firestore (Banco de Dados)

1. No menu lateral, clique em **"Build"** > **"Firestore Database"**.

1. Clique em **"Criar banco de dados"**.

1. Escolha a localização do servidor (pode deixar o padrão).

1. Em **"Regras de segurança"**, selecione **"Iniciar no modo de teste"** (isso permite que você comece a usar imediatamente).

1. Clique em **"Ativar"**.

## 3. Obter as Chaves de Acesso

1. No menu lateral, clique na engrenagem ao lado de "Visão geral do projeto" > **"Configurações do projeto"**.

1. Role até a seção "Seus aplicativos" e clique no ícone de código `</>` (Web).

1. Registre o app com um apelido (ex: "Sistema Web").

1. O Firebase vai mostrar um código contendo o objeto `firebaseConfig`. Ele se parece com isso:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## 4. Aplicar no Projeto

1. Abra o arquivo `app.js` da sua aplicação.

1. Localize as primeiras linhas onde está escrito `const firebaseConfig`.

1. Substitua todo o conteúdo daquele objeto pelas chaves que você copiou do Firebase.

1. Salve o arquivo.

**Pronto!** Agora, qualquer pessoa que abrir o seu site (ou o arquivo `index.html`) verá as mesmas ordens de serviço em tempo real.

